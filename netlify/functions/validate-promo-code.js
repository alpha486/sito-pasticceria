const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
    try {
        if (!process.env.STRIPE_SECRET_KEY) {
            throw new Error("Chiave segreta di Stripe non configurata.");
        }
        
        const { code } = JSON.parse(event.body);
        if (!code) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Codice non fornito.' }) };
        }

        // Chiediamo a Stripe di elencare i codici promozionali attivi con quel codice
        const promotionCodes = await stripe.promotionCodes.list({
            active: true,
            code: code.toUpperCase(), // Confronta sempre in maiuscolo per evitare errori
            limit: 1,
            expand: ['data.coupon'] // Chiediamo a Stripe di includere i dettagli del coupon associato
        });

        if (promotionCodes.data.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Codice sconto non valido o scaduto.' }) };
        }
        
        const promoCode = promotionCodes.data[0];
        const coupon = promoCode.coupon;

        // Se troviamo il codice, restituiamo i suoi dettagli
        return {
            statusCode: 200,
            body: JSON.stringify({
                code: promoCode.code,
                percent_off: coupon.percent_off,
                id: promoCode.id // Restituiamo anche l'ID, fondamentale per il checkout
            }),
        };

    } catch (error) {
        console.error("Errore nella validazione del codice:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Errore interno del server.' }) };
    }
};