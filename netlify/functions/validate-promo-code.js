const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
    try {
        const { code } = JSON.parse(event.body);
        if (!code) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Codice non fornito.' }) };
        }

        // Chiediamo a Stripe di elencare i codici promozionali attivi con quel codice
        const promotionCodes = await stripe.promotionCodes.list({
            active: true,
            code: code.toUpperCase(), // Confronta in maiuscolo
            limit: 1
        });

        if (promotionCodes.data.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Codice sconto non valido o scaduto.' }) };
        }
        
        // Se troviamo il codice, restituiamo i suoi dettagli (es. la percentuale di sconto)
        const promoCode = promotionCodes.data[0];
        const coupon = promoCode.coupon;

        return {
            statusCode: 200,
            body: JSON.stringify({
                code: promoCode.code,
                percent_off: coupon.percent_off
            }),
        };

    } catch (error) {
        console.error("Errore nella validazione del codice:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Errore interno del server.' }) };
    }
};