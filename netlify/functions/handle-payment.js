const { MongoClient } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// --- IMPORTAZIONE DIRETTA DEI DATI (METODO GARANTITO) ---
// Importiamo il file di configurazione direttamente.
// Il percorso relativo '..' esce dalla cartella corrente.
const config = require('../../config.json');

// Legge le variabili d'ambiente sicure
const mongoUri = process.env.MONGODB_URI;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// --- FUNZIONE HELPER getNextWednesday (invariata, ma ora usa `config` importato) ---
// È FONDAMENTALE che sia IDENTICA a quella in get-shipping-info.js
const getNextWednesday = (startDate, weeksToAdd = 0) => {
    let date = new Date(startDate);
    
    // Controlla prima se la data di partenza è in un periodo di chiusura
    if (config.chiusura && config.chiusura.start && config.chiusura.end) {
        const inizioChiusura = new Date(config.chiusura.start + "T00:00:00");
        const fineChiusura = new Date(config.chiusura.end + "T23:59:59");

        if (date >= inizioChiusura && date <= fineChiusura) {
            // Se siamo in chiusura, ripartiamo dal giorno dopo
            date = new Date(fineChiusura);
            date.setDate(date.getDate() + 1);
        }
    }
    
    // Aggiungi eventuali settimane di attesa
    date.setDate(date.getDate() + (weeksToAdd * 7));
    
    // Calcola il prossimo mercoledì da questa data
    const day = date.getDay();
    let daysUntilWednesday = (3 - day + 7) % 7;
    if (daysUntilWednesday === 0 && new Date().toDateString() === date.toDateString() && date.getHours() >= 12) {
        daysUntilWednesday = 7;
    }
    date.setDate(date.getDate() + daysUntilWednesday);

    return date;
};

// --- FUNZIONE HANDLER PRINCIPALE (semplificata) ---
exports.handler = async ({ body, headers }) => {
    if (!mongoUri || !webhookSecret) {
        console.error("Errore: variabili d'ambiente MONGODB_URI o STRIPE_WEBHOOK_SECRET non impostate.");
        return { statusCode: 500, body: 'Errore di configurazione del server.' };
    }

    try {
        const stripeEvent = stripe.webhooks.constructEvent(
            body,
            headers['stripe-signature'],
            webhookSecret
        );

        if (stripeEvent.type === 'checkout.session.completed') {
            // I dati di configurazione sono già disponibili grazie a `require` all'inizio del file.
            // Non c'è più bisogno di `fs.readFileSync` o `JSON.parse`.

            const session = stripeEvent.data.object;
            const cart = JSON.parse(session.metadata.cart);
            const totalBoxes = cart.reduce((sum, item) => sum + item.quantity, 0);

            const client = new MongoClient(mongoUri);
            await client.connect();
            const collection = client.db('incantesimi-zucchero-db').collection('ordini_settimanali');
            
            // LOGICA PER TROVARE LA SETTIMANA GIUSTA, ORA CONSAPEVOLE DELLA CONFIGURAZIONE
            let settimaneDiAttesa = 0;
            let postiLiberi = false;
            let weekIdentifier;

            while (!postiLiberi) {
                // Usiamo l'oggetto `config` importato all'inizio del file
                const targetDate = getNextWednesday(new Date(), settimaneDiAttesa, config);
                weekIdentifier = targetDate.toISOString().split('T')[0];
                
                const weekData = await collection.findOne({ settimana: weekIdentifier });
                const boxOrdinate = weekData ? weekData.boxOrdinate : 0;

                // Usiamo il valore dal file di configurazione invece di un numero fisso
                if (boxOrdinate + totalBoxes <= config.maxBoxPerSettimana) {
                    postiLiberi = true;
                } else {
                    settimaneDiAttesa++;
                }
            }
            
            // Aggiorna il database per la settimana corretta trovata
            await collection.updateOne(
                { settimana: weekIdentifier },
                { 
                    $inc: { boxOrdinate: totalBoxes },
                    $set: { settimana: weekIdentifier }
                },
                { upsert: true }
            );
            await client.close();
            
            console.log(`Ordine registrato con successo per la settimana: ${weekIdentifier}. Aggiunte ${totalBoxes} box.`);
        }

        return { statusCode: 200, body: JSON.stringify({ received: true }) };

    } catch (err) {
        console.error(`Errore webhook Stripe: ${err.message}`);
        return { statusCode: 400, body: `Webhook Error: ${err.message}` };
    }
};