const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const products = require('./_data/products.json');
const config = require('./_data/config.json');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { cart, customerEmail } = JSON.parse(event.body);
        if (!cart || !Array.isArray(cart) || !customerEmail) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Payload del carrello o email mancante/non valido.' }) };
        }
        
        // --- LOGICA MODIFICATA ---
        const totalBoxes = cart.reduce((sum, item) => sum + item.quantity, 0);
        let shippingCost = config.shipping.costoStandard;
        if (totalBoxes >= 2) {
            shippingCost = 0;
        }
        // --- FINE MODIFICA ---

        const lineItems = cart.map(item => {
            const product = products.find(p => p.name === item.name);
            if (!product) throw new Error(`Prodotto non trovato: ${item.name}`);
            return {
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: `${item.name}${item.option ? ` (${item.option})` : ''}`,
                        images: [config.websiteUrl + product.image_url], // URL completo dell'immagine
                    },
                    unit_amount: Math.round(item.price * 100), // Prezzo in centesimi
                },
                quantity: item.quantity,
            };
        });

        if (shippingCost > 0) {
            lineItems.push({
                price_data: {
                    currency: 'eur',
                    product_data: { name: 'Costo di Spedizione' },
                    unit_amount: Math.round(shippingCost * 100),
                },
                quantity: 1,
            });
        }
        
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${config.websiteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${config.websiteUrl}/cancel.html`,
            customer_email: customerEmail,
            allow_promotion_codes: true,
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ url: session.url }),
        };

    } catch (error) {
        console.error('Errore durante la creazione della sessione di Checkout:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Impossibile creare la sessione di pagamento.', details: error.message }),
        };
    }
};