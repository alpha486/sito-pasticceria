const { MongoClient } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mongoUri = process.env.MONGODB_URI;

const getNextWednesday = (startDate, weeksToAdd = 0) => { /* ... identica a prima ... */ };

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
            
            // ... (logica per calcolare la data di spedizione corretta, identica a get-shipping-info) ...

            await collection.updateOne(
                { settimana: weekIdentifier },
                { $inc: { boxOrdinate: totalBoxes } },
                { upsert: true }
            );
            await client.close();
        }
        return { statusCode: 200, body: 'Evento ricevuto' };
    } catch (err) {
        console.log(`Errore webhook: ${err.message}`);
        return { statusCode: 400, body: `Errore webhook: ${err.message}` };
    }
};