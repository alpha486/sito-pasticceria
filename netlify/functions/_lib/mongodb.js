// ... (codice precedente nel file)

// Funzione principale per ottenere i posti rimasti
async function getShippingSlots() {
    const client = await connectToDatabase();
    
    // --- VALORI CORRETTI INSERITI QUI ---
    const db = client.db('IncantesimiDiZucchero');
    const collection = db.collection('shipping_dates');
    // --- FINE ---

    const nextShippingDate = getNextShippingDate();
    const dateString = nextShippingDate.toISOString().split('T')[0]; // Formato YYYY-MM-DD

    let shippingDateData = await collection.findOne({ date: dateString });

    // Se non esiste un documento per la prossima data di spedizione, crealo.
    if (!shippingDateData) {
        const newDateEntry = {
            date: dateString,
            totalSlots: 25, // O il tuo valore di default
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