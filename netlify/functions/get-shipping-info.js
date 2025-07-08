const { MongoClient } = require('mongodb');

// --- IMPORTAZIONE DIRETTA DEI DATI (METODO GARANTITO) ---
// Node.js importa e parsa automaticamente i file JSON.
// Il percorso relativo '..' esce dalla cartella corrente.
// Usciamo da /functions, poi da /netlify per arrivare alla root del progetto, dove si trovano i file.
const config = require('../../config.json');
const allProducts = require('../../products.json');

// Legge la variabile d'ambiente sicura di MongoDB
const mongoUri = process.env.MONGODB_URI;

// --- FUNZIONE HELPER getNextWednesday (invariata, ma ora usa `config` importato) ---
const getNextWednesday = (startDate, weeksToAdd = 0, currentConfig) => {
    let date = new Date(startDate);
    
    date.setDate(date.getDate() + (weeksToAdd * 7));

    if (date.getDay() === 3 && date.getHours() >= 12) {
        date.setDate(date.getDate() + 1);
    }
    
    const day = date.getDay();
    const daysUntilWednesday = (3 - day + 7) % 7;
    date.setDate(date.getDate() + daysUntilWednesday);

    if (currentConfig && currentConfig.chiusura && currentConfig.chiusura.start && currentConfig.chiusura.end) {
        const inizioChiusura = new Date(currentConfig.chiusura.start + "T00:00:00");
        const fineChiusura = new Date(currentConfig.chiusura.end + "T23:59:59");

        if (date >= inizioChiusura && date <= fineChiusura) {
            const ripartenza = new Date(fineChiusura);
            ripartenza.setDate(ripartenza.getDate() + 1);
            return getNextWednesday(ripartenza, 0, currentConfig);
        }
    }
    
    return date;
};

// --- FUNZIONE HELPER PER CALCOLARE IL COSTO DI SPEDIZIONE (invariata, usa `allProducts` importato) ---
const calculateShippingCost = (cart, productsList) => {
    const SHIPPING_FEE = 9.90;
    if (!cart || cart.length === 0) return SHIPPING_FEE;

    let totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
    let largeBoxQuantity = cart.filter(item => {
        const productInfo = productsList.find(p => p.name === item.name);
        return productInfo && productInfo.size === 'grande';
    }).reduce((sum, item) => sum + item.quantity, 0);
    
    if (largeBoxQuantity >= 2 || totalQuantity >= 3) {
        return 0; 
    }
    return SHIPPING_FEE;
};


// --- FUNZIONE HANDLER PRINCIPALE (semplificata) ---
exports.handler = async (event) => {
    if (!mongoUri) {
        console.error("Errore: MONGODB_URI non impostato.");
        return { statusCode: 500, body: JSON.stringify({ error: 'Errore di configurazione.' }) };
    }

    const client = new MongoClient(mongoUri);

    try {
        await client.connect();
        const collection = client.db('incantesimi-zucchero-db').collection('ordini_settimanali');

        let settimaneDiAttesa = 0;
        let postiLiberi = false;
        let boxOrdinate = 0;
        
        while (!postiLiberi) {
            const targetDate = getNextWednesday(new Date(), settimaneDiAttesa, config);
            const weekIdentifier = targetDate.toISOString().split('T')[0];
            
            const weekData = await collection.findOne({ settimana: weekIdentifier });
            boxOrdinate = weekData ? weekData.boxOrdinate : 0;

            // Ora questo controllo funzionerà!
            if (boxOrdinate < config.maxBoxPerSettimana) {
                postiLiberi = true;
            } else {
                settimaneDiAttesa++;
            }
        }

        const finalShippingDate = getNextWednesday(new Date(), settimaneDiAttesa, config);
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const formattedDate = finalShippingDate.toLocaleDateString('it-IT', dateOptions);
        
        await client.close();

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                dataSpedizione: formattedDate,
                postiRimasti: config.maxBoxPerSettimana - boxOrdinate
            }),
        };

    } catch (error) {
        console.error("Errore in get-shipping-info:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Errore nel recupero dati.' }) };
    } 
};