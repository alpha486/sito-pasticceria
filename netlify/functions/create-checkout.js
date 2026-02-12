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
            return { statusCode: 400, body: JSON.stringify({ error: 'Dati mancanti.' }) };
        }

        // --- 1. CALCOLO LOGICA SPEDIZIONE (ALLINEATA AL SITO) ---
        
        // Calcolo totale box
        const totalBoxes = cart.reduce((sum, item) => sum + item.quantity, 0);

        // Calcolo box "grandi". 
        // Nota: È più sicuro verificare la grandezza dal file products.json invece che fidarsi del frontend
        const largeBoxes = cart.reduce((sum, item) => {
            const product = products.find(p => p.name === item.name);
            if (product && product.size === 'grande') {
                return sum + item.quantity;
            }
            return sum;
        }, 0);
        
        // Default: si paga la spedizione standard
        let shippingCost = config.shipping.costoStandard;

        // REGOLA: Gratis se hai almeno 3 box totali OPPURE almeno 2 box grandi
        if (totalBoxes >= 3 || largeBoxes >= 2) {
            shippingCost = 0;
        }

        // --- 2. CREAZIONE ELEMENTI CARRELLO ---
        const lineItems = cart.map(item => {
            const product = products.find(p => p.name === item.name);
            const imageUrl = (product && product.image_url) 
                ? config.websiteUrl + product.image_url 
                : 'https://via.placeholder.com/150';
            
            return {
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: `${item.name}${item.option ? ` (${item.option})` : ''}`,
                        images: [imageUrl],
                    },
                    unit_amount: Math.round(item.price * 100),
                },
                quantity: item.quantity,
            };
        });

        // Aggiungi la spedizione come riga ordine se il costo è maggiore di 0
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
        
        // --- 3. COSTRUZIONE SESSIONE ---
        const sessionParams = {
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${config.websiteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${config.websiteUrl}/cancel.html`,
            customer_email: customerEmail,
            shipping_address_collection: { allowed_countries: ['IT'] },
            allow_promotion_codes: true // Riabilitiamo i codici promozionali generici
        };

        const session = await stripe.checkout.sessions.create(sessionParams);

        return {
            statusCode: 200,
            body: JSON.stringify({ url: session.url }),
        };

    } catch (error) {
        console.error('Errore Stripe:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: 'Errore Checkout', 
                details: error.raw ? error.raw.message : error.message 
            }),
        };
    }
};
