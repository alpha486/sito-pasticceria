const { MongoClient } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// --- CONFIGURAZIONE INCORPORATA ---
const config = {
  "maxBoxPerSettimana": 25,
  "chiusura": {
    "start": "2025-08-01",
    "end": "2025-08-31"
  }
};

const mongoUri = process.env.MONGODB_URI;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// --- FUNZIONE HELPER getNextWednesday ---
const getNextWednesday = (startDate, weeksToAdd = 0) => {
  let date = new Date(startDate);
  date.setDate(date.getDate() + (weeksToAdd * 7));
  let day = date.getDay();
  let daysUntilWednesday = (3 - day + 7) % 7;
  if (daysUntilWednesday === 0 && new Date().toDateString() === date.toDateString() && new Date().getHours() >= 12) {
    daysUntilWednesday = 7;
  }
  date.setDate(date.getDate() + daysUntilWednesday);
  if (config.chiusura && config.chiusura.start && config.chiusura.end) {
    const inizioChiusura = new Date(config.chiusura.start + "T00:00:00");
    const fineChiusura = new Date(config.chiusura.end + "T23:59:59");
    if (date >= inizioChiusura && date <= fineChiusura) {
      const ripartenza = new Date(fineChiusura);
      ripartenza.setDate(ripartenza.getDate() + 1);
      return getNextWednesday(ripartenza, 0);
    }
  }
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
      if (totalBoxes === 0) {
        console.log("Webhook ricevuto per un ordine senza box. Nessun aggiornamento al DB.");
        return { statusCode: 200, body: JSON.stringify({ received: true }) };
      }
      const client = new MongoClient(mongoUri);
      await client.connect();
      const collection = client.db('incantesimi-zucchero-db').collection('ordini_settimanali');
      let settimaneDiAttesa = 0;
      let postiLiberi = false;
      let weekIdentifier;
      while (!postiLiberi) {
        const targetDate = getNextWednesday(new Date(), settimaneDiAttesa);
        weekIdentifier = targetDate.toISOString().split('T')[0];
        const weekData = await collection.findOne({ settimana: weekIdentifier });
        const boxOrdinate = weekData ? weekData.boxOrdinate : 0;
        if (boxOrdinate + totalBoxes <= config.maxBoxPerSettimana) {
          postiLiberi = true;
        } else {
          settimaneDiAttesa++;
        }
      }
      await collection.updateOne(
        { settimana: weekIdentifier },
        {
          $inc: { boxOrdinate: totalBoxes },
          $set: { settimana: weekIdentifier }
        },
        { upsert: true }
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
