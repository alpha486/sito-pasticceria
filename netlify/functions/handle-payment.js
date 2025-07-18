const { MongoClient } = require('mongodb');
const stripePackage = require('stripe');

// --- LOGICA PER SELEZIONARE LE CHIAVI STRIPE CORRETTE (LIVE O TEST) ---
const isProduction = process.env.CONTEXT === 'production';

const stripeKey = isProduction
  ? process.env.STRIPE_SECRET_KEY       // Se in produzione, usa la chiave live
  : process.env.TEST_STRIPE_SECRET_KEY; // Altrimenti (test, develop), usa la nuova chiave di test

// Aggiungiamo un log per essere sicuri al 100% di quale chiave stiamo usando
console.log(`CONTEXT: ${process.env.CONTEXT}. Using ${isProduction ? 'LIVE' : 'TEST'} Stripe key.`);

const stripe = stripePackage(stripeKey);
// -----------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

// --- METODO ROBUSTO PER LEGGERE IL FILE DI CONFIGURAZIONE ---
const configPath = path.resolve(__dirname, '..', '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// --- LOGICA PER SELEZIONARE IL DATABASE CORRETTO (PRODUZIONE O TEST) ---
const isProduction = process.env.CONTEXT === 'production';

// Assegna il valore alla variabile 'mongouri' come usata nel resto del file
const mongouri = isProduction
  ? process.env.MONGODB_URI       // Se in produzione, usa la variabile live
  : process.env.TEST_MONGODB_URI; // Altrimenti (test, develop), usa la nuova variabile di test

// Aggiungiamo un log per essere sicuri al 100% di quale DB stiamo usando
console.log(`CONTEXT: ${process.env.CONTEXT}. Using ${isProduction ? 'PRODUCTION' : 'TEST'} database.`);
// ------------------------------------------------------------------------
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// --- FUNZIONE HELPER getNextWednesday (VERSIONE FINALE - IDENTICA A get-shipping-info.js) ---
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


// --- FUNZIONE HANDLER PRINCIPALE ---
exports.handler = async ({ body, headers }) => {
    try {
        // Verifica la firma del webhook per sicurezza
        const stripeEvent = stripe.webhooks.constructEvent(
            body,
            headers['stripe-signature'],
            webhookSecret
        );

        // Gestisci solo l'evento che ci interessa: il completamento del checkout
        if (stripeEvent.type === 'checkout.session.completed') {
            const session = stripeEvent.data.object;
            const cart = JSON.parse(session.metadata.cart);
            const totalBoxes = cart.reduce((sum, item) => sum + item.quantity, 0);

            // Se non ci sono box, non c'è nulla da registrare
            if (totalBoxes === 0) {
                console.log("Webhook ricevuto per un ordine senza box. Nessun aggiornamento al DB.");
                return { statusCode: 200, body: JSON.stringify({ received: true }) };
            }

            const client = new MongoClient(mongoUri);
            await client.connect();
            const collection = client.db('incantesimi-zucchero-db').collection('ordini_settimanali');
            
            // LOGICA PER TROVARE LA SETTIMANA GIUSTA IN CUI INSERIRE L'ORDINE
            // Questa logica DEVE rispecchiare quella in get-shipping-info
            let settimaneDiAttesa = 0;
            let postiLiberi = false;
            let weekIdentifier;

            while (!postiLiberi) {
                // Usa la funzione getNextWednesday aggiornata e corretta
                const targetDate = getNextWednesday(new Date(), settimaneDiAttesa);
                weekIdentifier = targetDate.toISOString().split('T')[0];
                
                const weekData = await collection.findOne({ settimana: weekIdentifier });
                const boxOrdinate = weekData ? weekData.boxOrdinate : 0;

                // Controlla se c'è spazio per le NUOVE box in questa settimana
                if (boxOrdinate + totalBoxes <= config.maxBoxPerSettimana) {
                    postiLiberi = true;
                } else {
                    settimaneDiAttesa++;
                }
            }
            
            // Aggiorna il database per la settimana corretta trovata
            console.log(`Tentativo di aggiornamento per la settimana: ${weekIdentifier}, aggiungendo ${totalBoxes} box.`);
            await collection.updateOne(
                { settimana: weekIdentifier },
                { 
                    $inc: { boxOrdinate: totalBoxes },
                    $set: { settimana: weekIdentifier }
                },
                { upsert: true } // Crea il documento se non esiste
            );
            await client.close();
            
            console.log(`Ordine registrato con successo per la settimana: ${weekIdentifier}.`);
        }

        return { statusCode: 200, body: JSON.stringify({ received: true }) };

    } catch (err) {
        console.error(`Errore webhook Stripe: ${err.message}`);
        return { statusCode: 400, body: `Webhook Error: ${err.message}` };
    }
};