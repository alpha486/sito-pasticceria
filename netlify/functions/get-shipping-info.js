const { MongoClient } = require('mongodb');

// --- CONFIGURAZIONE INCORPORATA ---
const config = {
  "maxBoxPerSettimana": 25,
  "chiusura": {
    "start": "2025-08-01",
    "end": "2025-08-31"
  }
};

// --- DATI PRODOTTI INCORPORATI ---
const allProducts = [
  { "name": "Box Grande Crunch", "size": "grande" },
  { "name": "Box Grande Gnammy", "size": "grande" },
  { "name": "Box Piccola Slurp", "size": "normale" }
];

const mongoUri = process.env.MONGODB_URI;

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

// --- FUNZIONE HELPER PER CALCOLARE IL COSTO DI SPEDIZIONE ---
const calculateShippingCost = (cart) => {
  const SHIPPING_FEE = 9.90;
  if (!cart || cart.length === 0) return SHIPPING_FEE;
  let totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  let largeBoxQuantity = cart.filter(item => {
    const productInfo = allProducts.find(p => p.name === item.name);
    return productInfo && productInfo.size === 'grande';
  }).reduce((sum, item) => sum + item.quantity, 0);
  if (largeBoxQuantity >= 2 || totalQuantity >= 3) return 0;
  return SHIPPING_FEE;
};

// --- FUNZIONE HANDLER PRINCIPALE ---
exports.handler = async (event) => {
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
    while (!postiLiberi) {
      const targetDate = getNextWednesday(new Date(), settimaneDiAttesa);
      const weekIdentifier = targetDate.toISOString().split('T')[0];
      const weekData = await collection.findOne({ settimana: weekIdentifier });
      boxOrdinate = weekData ? weekData.boxOrdinate : 0;
      if (boxOrdinate < config.maxBoxPerSettimana) {
        postiLiberi = true;
      } else {
        settimaneDiAttesa++;
      }
    }
    const finalShippingDate = getNextWednesday(new Date(), settimaneDiAttesa);
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = finalShippingDate.toLocaleDateString('it-IT', dateOptions);
    const shippingCost = calculateShippingCost(cart);
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
    await client.close();
  }
};
