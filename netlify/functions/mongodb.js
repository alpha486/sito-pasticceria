const { MongoClient } = require('mongodb');

// Memorizza la connessione per riutilizzarla tra le chiamate della funzione
let cachedClient = null;

async function connectToDatabase() {
    if (cachedClient) {
        return cachedClient;
    }

    // Si connette usando la variabile d'ambiente sicura di Netlify
    const client = new MongoClient(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });

    cachedClient = await client.connect();
    return cachedClient;
}

// Funzione per ottenere la prossima data di spedizione valida (es. il prossimo martedì)
const getNextShippingDate = () => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // Domenica = 0, Lunedì = 1, Martedì = 2...
    const daysUntilTuesday = (2 - dayOfWeek + 7) % 7;
    const nextTuesday = new Date(today);
    nextTuesday.setDate(today.getDate() + daysUntilTuesday);
    nextTuesday.setHours(0, 0, 0, 0); // Azzera l'orario per avere solo la data
    return nextTuesday;
};

// Funzione principale per ottenere i posti rimasti
async function getShippingSlots() {
    const client = await connectToDatabase();
    const db = client.db('IncantesimiDiZucchero'); // Nome del database corretto
    const collection = db.collection('shipping_dates'); // Nome della collection corretto

    const nextShippingDate = getNextShippingDate();
    const dateString = nextShippingDate.toISOString().split('T')[0]; // Formato YYYY-MM-DD

    let shippingDateData = await collection.findOne({ date: dateString });

    // Se non esiste un documento per la prossima data di spedizione, lo crea.
    if (!shippingDateData) {
        const newDateEntry = {
            date: dateString,
            totalSlots: 25, // Valore di default, puoi cambiarlo se necessario
            bookedSlots: 0,
        };
        await collection.insertOne(newDateEntry);
        shippingDateData = newDateEntry;
    }

    const postiRimasti = shippingDateData.totalSlots - shippingDateData.bookedSlots;
    
    return {
        postiRimasti: postiRimasti > 0 ? postiRimasti : 0,
        dataSpedizione: nextShippingDate.toLocaleDateString('it-IT', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        })
    };
}

module.exports = { getShippingSlots };