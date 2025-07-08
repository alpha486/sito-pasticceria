const { MongoClient } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fs = require('fs');
const path = require('path');

const mongoUri = process.env.MONGODB_URI;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// --- FUNZIONE HELPER getNextWednesday AGGIORNATA ---
// È FONDAMENTALE che sia IDENTICA a quella in get-shipping-info.js
// per garantire che il calcolo della data sia coerente.
const getNextWednesday = (startDate, weeksToAdd = 0, config) => {
    let date = new Date(startDate);
    
    date.setDate(date.getDate() + (weeksToAdd * 7));

    if (date.getDay() === 3 && date.getHours() >= 12) {
        date.setDate(date.getDate() + 1);
    }
    
    const day = date.getDay();
    const daysUntilWednesday = (3 - day + 7) % 7;
    date.setDate(date.getDate() + daysUntilWednesday);

    if (config && config.chiusura && config.chiusura.start && config.chiusura.end) {
        const inizioChiusura = new Date(config.chiusura.start + "T00:00:00");
        const fineChiusura = new Date(config.chiusura.end + "T23:59:59");

        if (date >= inizioChiusura && date <= fineChiusura) {
            const ripartenza = new Date(fineChiusura);
            ripartenza.setDate(ripartenza.getDate() + 1);
            return getNextWednesday(ripartenza, 0, config);
        }
    }
    
    return date;
};

exports.handler = async ({ body, headers }) => {
    // Controlli di sicurezza sulle variabili d'ambiente
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
            // --- LETTURA DEL FILE DI CONFIGURAZIONE ---
            // Cerca il file nella sottocartella _data
// Cerca il file nella directory di esecuzione
// Cerca il file nella directory di esecuzione
const configPath = path.join(__dirname, '..', '..', 'config.json');
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);

            const session = stripeEvent.data.object;
            const cart = JSON.parse(session.metadata.cart);
            const totalBoxes = cart.reduce((sum, item) => sum + item.quantity, 0);

            const client = new MongoClient(mongoUri);
            await client.connect();
            const collection = client.db('incantesimi-zucchero-db').collection('ordini_settimanali');
            
            // --- LOGICA PER TROVARE LA SETTIMANA GIUSTA, ORA CONSAPEVOLE DELLA CONFIGURAZIONE ---
            let settimaneDiAttesa = 0;
            let postiLiberi = false;
            let weekIdentifier;

            while (!postiLiberi) {
                // Passiamo la configurazione alla funzione per il calcolo della data
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