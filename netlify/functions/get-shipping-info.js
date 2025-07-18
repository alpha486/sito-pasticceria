const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// --- NUOVO METODO PER LEGGERE I FILE DI CONFIGURAZIONE ---
// Le funzioni Netlify vengono eseguite dalla root del progetto durante la build.
// Usiamo percorsi relativi direttamente dalla root del progetto.
const configPath = path.resolve(process.cwd(), 'config.json');
const productsPath = path.resolve(process.cwd(), 'products.json');

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const allProducts = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));
// --------------------------------------------------------

// --- LOGICA PER SELEZIONARE IL DATABASE CORRETTO (PRODUZIONE O TEST) ---
const isProduction = process.env.CONTEXT === 'production';

// Assegna il valore alla variabile 'mongouri' come usata nel resto del file
const mongouri = isProduction
  ? process.env.MONGODB_URI       // Se in produzione, usa la variabile live
  : process.env.TEST_MONGODB_URI; // Altrimenti (test, develop), usa la nuova variabile di test

// Aggiungiamo un log per essere sicuri al 100% di quale DB stiamo usando
console.log(`CONTEXT: ${process.env.CONTEXT}. Using ${isProduction ? 'PRODUCTION' : 'TEST'} database.`);
// ------------------------------------------------------------------------


// --- FUNZIONE HELPER getNextWednesday (VERSIONE FINALE E CORRETTA) ---
// Questa versione è la più robusta perché prima calcola la data di spedizione potenziale
// e POI controlla se cade in un periodo di chiusura. Se così fosse, ricalcola la data
// partendo dal giorno successivo alla fine della chiusura, garantendo che il risultato sia sempre valido.
const getNextWednesday = (startDate, weeksToAdd = 0) => {
    let date = new Date(startDate);
    
    // 1. Aggiungi subito le settimane di attesa accumulate durante la ricerca di posti liberi
    date.setDate(date.getDate() + (weeksToAdd * 7));
    
    // 2. Calcola il prossimo mercoledì partendo dalla data aggiornata
    let day = date.getDay(); // (Domenica=0, Lunedì=1, ..., Mercoledì=3)
    let daysUntilWednesday = (3 - day + 7) % 7;
    
    // Caso speciale: se l'ordine viene fatto di mercoledì dopo le 12:00, si slitta al mercoledì successivo.
    // Usiamo new Date() per l'ora corrente, perché è il momento dell'ordine che conta.
    if (daysUntilWednesday === 0 && new Date().toDateString() === date.toDateString() && new Date().getHours() >= 12) {
        daysUntilWednesday = 7;
    }
    date.setDate(date.getDate() + daysUntilWednesday);

    // 3. ORA, CONTROLLA SE LA DATA CALCOLATA È IN PERIODO DI CHIUSURA
    // Questo è il controllo di sicurezza finale e più importante.
    if (config.chiusura && config.chiusura.start && config.chiusura.end) {
        const inizioChiusura = new Date(config.chiusura.start + "T00:00:00");
        const fineChiusura = new Date(config.chiusura.end + "T23:59:59");

        // Se la data di spedizione calcolata cade nelle ferie...
        if (date >= inizioChiusura && date <= fineChiusura) {
            // ...si imposta una nuova data di partenza al giorno dopo la fine delle ferie...
            const ripartenza = new Date(fineChiusura);
            ripartenza.setDate(ripartenza.getDate() + 1);
            
            // ...e si ricalcola da capo il primo mercoledì utile (chiamata ricorsiva).
            return getNextWednesday(ripartenza, 0); 
        }
    }
    
    // 4. Se la data è valida, la restituisce.
    return date;
};


// --- FUNZIONE HELPER PER CALCOLARE IL COSTO DI SPEDIZIONE ---
const calculateShippingCost = (cart) => {
    const SHIPPING_FEE = 9.90;
    if (!cart || cart.length === 0) return SHIPPING_FEE;

    // Calcola la quantità totale di articoli nel carrello
    let totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
    
    // Calcola la quantità di articoli che sono di dimensione "grande"
    let largeBoxQuantity = cart.filter(item => {
        const productInfo = allProducts.find(p => p.name === item.name);
        return productInfo && productInfo.size === 'grande';
    }).reduce((sum, item) => sum + item.quantity, 0);
    
    // La spedizione è gratuita se si ordinano 2 box grandi o 3 o più box totali
    if (largeBoxQuantity >= 2 || totalQuantity >= 3) return 0; 
    
    return SHIPPING_FEE;
};


// --- FUNZIONE HANDLER PRINCIPALE DI NETLIFY ---
exports.handler = async (event) => {
    // Controllo di sicurezza per la variabile d'ambiente del database
    if (!mongoUri) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Configurazione del database mancante.' }) };
    }

    const client = new MongoClient(mongoUri);

    try {
        const { cart } = JSON.parse(event.body || '{}');
        
        await client.connect();
        const collection = client.db('incantesimi-zucchero-db').collection('ordini_settimanali');

        let settimaneDiAttesa = 0;
        let postiLiberi = false;
        let boxOrdinate = 0;
        
        // Ciclo per trovare la prima settimana con posti disponibili
        while (!postiLiberi) {
            // Calcola la data del prossimo mercoledì utile
            const targetDate = getNextWednesday(new Date(), settimaneDiAttesa);
            const weekIdentifier = targetDate.toISOString().split('T')[0];
            
            // Controlla nel database quanti ordini ci sono per quella settimana
            const weekData = await collection.findOne({ settimana: weekIdentifier });
            boxOrdinate = weekData ? weekData.boxOrdinate : 0;

            // Se ci sono posti, esci dal ciclo
            if (boxOrdinate < config.maxBoxPerSettimana) {
                postiLiberi = true;
            } else {
                // Altrimenti, aggiungi una settimana e controlla di nuovo
                settimaneDiAttesa++;
            }
        }

        // Una volta trovata la settimana, calcola la data di spedizione finale
        const finalShippingDate = getNextWednesday(new Date(), settimaneDiAttesa);
        
        // Formatta la data in italiano per mostrarla all'utente
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const formattedDate = finalShippingDate.toLocaleDateString('it-IT', dateOptions);

        // Calcola il costo di spedizione basato sul carrello ricevuto
        const shippingCost = calculateShippingCost(cart);
        
        // Restituisce la risposta al frontend
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                dataSpedizione: formattedDate,
                postiRimasti: config.maxBoxPerSettimana - boxOrdinate,
                shippingCost: shippingCost
            }),
        };

    } catch (error) {
        console.error("Errore in get-shipping-info:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Errore nel recupero dei dati.' }) };
    } finally {
        // Chiudi sempre la connessione al database
        await client.close();
    } 
};