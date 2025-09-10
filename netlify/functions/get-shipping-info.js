const config = require('./_data/config.json');
const { getShippingSlots } = require('./mongodb.js');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { cart } = JSON.parse(event.body);
        if (!cart || !Array.isArray(cart)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Payload del carrello mancante o non valido.' }) };
        }

        // --- NUOVA LOGICA CON MONGODB ---
        const shippingData = await getShippingSlots();
        // --- FINE NUOVA LOGICA ---
        
        const totalBoxes = cart.reduce((sum, item) => sum + item.quantity, 0);
        let shippingCost = config.shipping.costoStandard;
        if (totalBoxes >= 2) {
            shippingCost = 0;
        }

        const response = {
            postiRimasti: shippingData.postiRimasti,
            dataSpedizione: shippingData.dataSpedizione,
            shippingCost: shippingCost
        };

        return {
            statusCode: 200,
            body: JSON.stringify(response),
        };
    } catch (error) {
        console.error("Errore nella funzione get-shipping-info:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Impossibile recuperare le informazioni sulla spedizione.' }),
        };
    }
};