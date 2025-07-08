const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Legge la variabile d'ambiente sicura di MongoDB
const mongoUri = process.env.MONGODB_URI;

// --- FUNZIONE HELPER getNextWednesday AGGIORNATA ---
// Ora accetta un oggetto `config` per gestire le chiusure.
const getNextWednesday = (startDate, weeksToAdd = 0, config) => {
    let date = new Date(startDate);
    
    // Aggiungiamo le settimane di attesa calcolate dal ciclo dei posti liberi
    date.setDate(date.getDate() + (weeksToAdd * 7));

    // Se la data di partenza è mercoledì dopo le 12:00, partiamo dal giorno dopo
    if (date.getDay() === 3 && date.getHours() >= 12) {
        date.setDate(date.getDate() + 1);
    }
    
    // Calcoliamo il prossimo mercoledì utile
    const day = date.getDay();
    const daysUntilWednesday = (3 - day + 7) % 7;
    date.setDate(date.getDate() + daysUntilWednesday);

    // --- NUOVA LOGICA: CONTROLLO CHIUSURE ---
    if (config && config.chiusura && config.chiusura.start && config.chiusura.end) {
        const inizioChiusura = new Date(config.chiusura.start + "T00:00:00");
        const fineChiusura = new Date(config.chiusura.end + "T23:59:59");

        // Se la data di spedizione calcolata cade nel periodo di chiusura,
        // ricalcoliamo il prossimo mercoledì partendo dal giorno DOPO la fine della chiusura.
        if (date >= inizioChiusura && date <= fineChiusura) {
            const ripartenza = new Date(fineChiusura);
            ripartenza.setDate(ripartenza.getDate() + 1); // Il giorno dopo la fine della chiusura
            return getNextWednesday(ripartenza, 0, config); // Chiamata ricorsiva con 0 settimane di attesa
        }
    }
    
    return date;
};

// --- FUNZIONE HELPER PER CALCOLARE IL COSTO DI SPEDIZIONE ---
// Questa logica deve essere presente anche qui per essere restituita al frontend.
const calculateShippingCost = (cart, allProducts) => {
    const SHIPPING_FEE = 9.90;
    if (!cart || cart.length === 0) return SHIPPING_FEE;

    let totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
    let largeBoxQuantity = cart.filter(item => {
        const productInfo = allProducts.find(p => p.name === item.name);
        return productInfo && productInfo.size === 'grande';
    }).reduce((sum, item) => sum + item.quantity, 0);
    
    if (largeBoxQuantity >= 2 || totalQuantity >= 3) {
        return 0; 
    }
    return SHIPPING_FEE;
};


exports.handler = async (event) => {
    // Controllo fondamentale: se la chiave del database non è configurata, fermati
    if (!mongoUri) {
        console.error("Errore: la variabile MONGODB_URI non è impostata.");
        return { statusCode: 500, body: JSON.stringify({ error: 'Errore di configurazione del server.' }) };
    }

    try {
        // --- LETTURA DEI FILE DI CONFIGURAZIONE E PRODOTTI ---
        const configPath = path.resolve(process.cwd(), 'config.json');
        const productsPath = path.resolve(process.cwd(), 'products.json');
        
        const configData = fs.readFileSync(configPath, 'utf8');
        const productsData = fs.readFileSync(productsPath, 'utf8');
        
        const config = JSON.parse(configData);
        const allProducts = JSON.parse(productsData);

        // Ora il frontend invia il carrello per calcolare il costo di spedizione
        const { cart } = JSON.parse(event.body || '{}');

        // --- CALCOLO DELLA DATA DI SPEDIZIONE CON LOGICA DI CHIUSURA ---
        const client = new MongoClient(mongoUri);
        await client.connect();
        const database = client.db('incantesimi-zucchero-db');
        const collection = database.collection('ordini_settimanali');

        let settimaneDiAttesa = 0;
        let postiLiberi = false;
        let boxOrdinate = 0;
        
        // Ciclo per trovare la prima settimana con posti disponibili
        while (!postiLiberi) {
            // Passiamo la configurazione alla funzione per il calcolo
            const targetDate = getNextWednesday(new Date(), settimaneDiAttesa, config);
            const weekIdentifier = targetDate.toISOString().split('T')[0];
            
            const weekData = await collection.findOne({ settimana: weekIdentifier });
            boxOrdinate = weekData ? weekData.boxOrdinate : 0;

            if (boxOrdinate < config.maxBoxPerSettimana) {
                postiLiberi = true;
            } else {
                settimaneDiAttesa++;
            }
        }
        await client.close();

        const finalShippingDate = getNextWednesday(new Date(), settimaneDiAttesa, config);
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const formattedDate = finalShippingDate.toLocaleDateString('it-IT', dateOptions);

        // --- CALCOLO COSTO SPEDIZIONE ---
        const shippingCost = calculateShippingCost(cart, allProducts);

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                dataSpedizione: formattedDate,
                postiRimasti: config.maxBoxPerSettimana - boxOrdinate,
                shippingCost: shippingCost // Restituiamo anche il costo di spedizione
            }),
        };

    } catch (error) {
        console.error("Errore nella funzione get-shipping-info:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Errore nel recupero dei dati di spedizione.' }) };
    } 
    // `finally` blocco non più necessario qui, la connessione viene chiusa prima
};