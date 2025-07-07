const { MongoClient } = require('mongodb');

// Legge la variabile d'ambiente sicura di MongoDB
const mongoUri = process.env.MONGODB_URI;

// Funzione helper per calcolare la data del prossimo mercoledì
const getNextWednesday = (startDate, weeksToAdd = 0) => {
    const date = new Date(startDate);
    const day = date.getDay(); // 0=Domenica, 1=Lunedì...
    let daysUntilWednesday = (3 - day + 7) % 7;
    
    // Se oggi è mercoledì e sono le 12:00 o più tardi, salta alla settimana successiva
    if (daysUntilWednesday === 0 && startDate.getHours() >= 12) {
        daysUntilWednesday = 7;
    }
    
    date.setDate(date.getDate() + daysUntilWednesday + (weeksToAdd * 7));
    return date;
};

exports.handler = async () => {
    // Controllo fondamentale: se la chiave del database non è configurata, fermati
    if (!mongoUri) {
        console.error("Errore: la variabile MONGODB_URI non è impostata.");
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Errore di configurazione del server.' })
        };
    }

    const client = new MongoClient(mongoUri);

    try {
        await client.connect();
        const database = client.db('incantesimi-zucchero-db');
        const collection = database.collection('ordini_settimanali');

        let settimaneDiAttesa = 0;
        let postiLiberi = false;
        let weekIdentifier;
        let boxOrdinate = 0;

        // Ciclo per trovare la prima settimana con posti disponibili
        while (!postiLiberi) {
            const targetDate = getNextWednesday(new Date(), settimaneDiAttesa);
            weekIdentifier = targetDate.toISOString().split('T')[0];
            
            const weekData = await collection.findOne({ settimana: weekIdentifier });
            boxOrdinate = weekData ? weekData.boxOrdinate : 0;

            if (boxOrdinate < 25) {
                postiLiberi = true;
            } else {
                settimaneDiAttesa++;
            }
        }

        const finalShippingDate = getNextWednesday(new Date(), settimaneDiAttesa);
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const formattedDate = finalShippingDate.toLocaleDateString('it-IT', dateOptions);

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                dataSpedizione: formattedDate,
                postiRimasti: 25 - boxOrdinate,
            }),
        };

    } catch (error) {
        console.error("Errore nella funzione get-shipping-info:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Errore nel recupero dei dati di spedizione.' }) };
    } finally {
        await client.close();
    }
};