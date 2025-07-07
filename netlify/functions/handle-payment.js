const { MongoClient } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mongoUri = process.env.MONGODB_URI;

// Funzione helper per calcolare la data del prossimo mercoledì
const getNextWednesday = (startDate, weeksToAdd = 0) => {
    const date = new Date(startDate);
    const day = date.getDay();
    let daysUntilWednesday = (3 - day + 7) % 7;
    // Se oggi è mercoledì e sono le 12:00 o più tardi, salta alla prossima settimana
    if (daysUntilWednesday === 0 && startDate.getHours() >= 12) {
        daysUntilWednesday = 7;
    }
    date.setDate(date.getDate() + daysUntilWednesday + (weeksToAdd * 7));
    return date;
};

exports.handler = async ({ body, headers }) => {
    try {
        const stripeEvent = stripe.webhooks.constructEvent(
            body,
            headers['stripe-signature'],
            process.env.STRIPE_WEBHOOK_SECRET
        );

        if (stripeEvent.type === 'checkout.session.completed') {
            const session = stripeEvent.data.object;
            const cart = JSON.parse(session.metadata.cart);
            const totalBoxes = cart.reduce((sum, item) => sum + item.quantity, 0);

            const client = new MongoClient(mongoUri);
            await client.connect();
            const collection = client.db('incantesimi-zucchero-db').collection('ordini_settimanali');
            
            // --- LOGICA CORRETTA PER TROVARE LA SETTIMANA GIUSTA ---
            let settimaneDiAttesa = 0;
            let postiLiberi = false;
            let weekIdentifier; // Dichiarata qui fuori per essere accessibile dopo

            while (!postiLiberi) {
                const targetDate = getNextWednesday(new Date(), settimaneDiAttesa);
                // Assegniamo il valore alla variabile dichiarata fuori
                weekIdentifier = targetDate.toISOString().split('T')[0]; 
                
                const weekData = await collection.findOne({ settimana: weekIdentifier });
                const boxOrdinate = weekData ? weekData.boxOrdinate : 0;

                if (boxOrdinate + totalBoxes <= 25) {
                    postiLiberi = true;
                } else {
                    settimaneDiAttesa++;
                }
            }
            
            // Aggiorna il database per la settimana corretta
            await collection.updateOne(
                { settimana: weekIdentifier },
                { 
                    $inc: { boxOrdinate: totalBoxes },
                    $set: { settimana: weekIdentifier } // Assicura che il campo esista
                },
                { upsert: true } // Crea il documento se non esiste
            );
            await client.close();
        }
        return { statusCode: 200, body: JSON.stringify({ received: true }) };
    } catch (err) {
        console.error(`Errore webhook Stripe: ${err.message}`);
        return { statusCode: 400, body: `Webhook Error: ${err.message}` };
    }
};