const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { MongoClient } = require('mongodb'); // Carica la libreria base

// --- MODIFICA CHIAVE: Importiamo il nostro file di logica DB ---
// Definiamo una funzione di connessione qui perché _lib non è disponibile in questo contesto specifico
let cachedClient = null;
async function connectToDatabase() {
    if (cachedClient) {
        return cachedClient;
    }
    const client = new MongoClient(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });
    cachedClient = await client.connect();
    return cachedClient;
}

// Funzione per ottenere la prossima data di spedizione valida (deve essere identica a quella in _lib/mongodb.js)
const getNextShippingDate = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilTuesday = (2 - dayOfWeek + 7) % 7;
    const nextTuesday = new Date(today);
    nextTuesday.setDate(today.getDate() + daysUntilTuesday);
    nextTuesday.setHours(0, 0, 0, 0);
    return nextTuesday;
};
// --- FINE MODIFICA ---

exports.handler = async ({ body, headers }) => {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const stripeEvent = stripe.webhooks.constructEvent(
      body,
      headers['stripe-signature'],
      webhookSecret
    );

    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;

      // Recupera i dettagli degli articoli acquistati
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      
      const totalBoxes = lineItems.data
        .filter(item => item.description !== 'Costo di Spedizione')
        .reduce((sum, item) => sum + item.quantity, 0);

      // --- LOGICA DI AGGIORNAMENTO DATABASE ---
      const client = await connectToDatabase();
      const db = client.db('IncantesimiDiZucchero');
      
      // 1. Aggiorna i posti disponibili
      const shippingCollection = db.collection('shipping_dates');
      const nextShippingDate = getNextShippingDate();
      const dateString = nextShippingDate.toISOString().split('T')[0];

      await shippingCollection.updateOne(
        { date: dateString },
        { $inc: { bookedSlots: totalBoxes } },
        { upsert: true } // Crea il documento se non esiste
      );

      // 2. Salva il nuovo ordine
      const ordersCollection = db.collection('ordini_settimanali');
      const newOrder = {
        stripeSessionId: session.id,
        customerEmail: session.customer_details.email,
        amountTotal: session.amount_total / 100, // in euro
        currency: session.currency,
        status: 'pagato',
        shippingDate: dateString,
        items: lineItems.data.map(item => ({
          description: item.description,
          quantity: item.quantity,
          amount_total: item.amount_total / 100
        })),
        createdAt: new Date(),
      };

      await ordersCollection.insertOne(newOrder);
      // --- FINE LOGICA DATABASE ---

      console.log('Pagamento andato a buon fine e ordine salvato!', session.id);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true }),
    };
  } catch (err) {
    console.error(`Errore nel webhook Stripe: ${err.message}`);
    return {
      statusCode: 400,
      body: `Webhook Error: ${err.message}`,
    };
  }
};