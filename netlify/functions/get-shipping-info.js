const { MongoClient } = require('mongodb');

// URI di connessione sicuro dalle variabili d'ambiente
const mongoUri = process.env.MONGODB_URI;

// Funzione helper per calcolare la data del prossimo mercoledì
const getNextWednesday = (startDate, weeksToAdd = 0) => {
    const date = new Date(startDate);
    const day = date.getDay();
    const daysUntilWednesday = (3 - day + 7) % 7;
    date.setDate(date.getDate() + daysUntilWednesday + (weeksToAdd * 7));
    if (daysUntilWednesday === 0 && weeksToAdd === 0 && startDate.getHours() >= 12) {
        date.setDate(date.getDate() + 7);
    }
    return date;
};

exports.handler = async () => {
    const client = new MongoClient(mongoUri);

    try {
        await client.connect();
        const database = client.db('incantesimi-zucchero-db');
        const collection = database.collection('ordini_settimanali');

        const nextShippingDate = getNextWednesday(new Date());
        const weekIdentifier = nextShippingDate.toISOString().split('T')[0];

        let weekData = await collection.findOne({ settimana: weekIdentifier });
        
        let boxCount = weekData ? weekData.boxOrdinate : 0;
        let settimaneDiAttesa = 0;

        // Se il limite è raggiunto, calcola la settimana successiva
        while (boxCount >= 25) {
            settimaneDiAttesa++;
            const futureDate = getNextWednesday(new Date(), settimaneDiAttesa);
            const futureWeekIdentifier = futureDate.toISOString().split('T')[0];
            weekData = await collection.findOne({ settimana: futureWeekIdentifier });
            boxCount = weekData ? weekData.boxOrdinate : 0;
        }

        const finalShippingDate = getNextWednesday(new Date(), settimaneDiAttesa);
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const formattedDate = finalShippingDate.toLocaleDateString('it-IT', dateOptions);

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                dataSpedizione: formattedDate,
                postiRimasti: 25 - boxCount,
            }),
        };

    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Errore nel recupero dati' }) };
    } finally {
        await client.close();
    }
};