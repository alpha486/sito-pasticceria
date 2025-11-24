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

        // --- 1. DATA E PERIODO ---
        const now = new Date();
        const currentYear = now.getFullYear();
        const promoStart = new Date(currentYear, 10, 24); 
        const promoEnd = new Date(currentYear, 10, 30, 23, 59, 59);
        const isPromoPeriod = now >= promoStart && now <= promoEnd;

        // --- 2. CALCOLI ---
        const totalBoxes = cart.reduce((sum, item) => sum + item.quantity, 0);
        
        // Spedizione
        let shippingCost = config.shipping.costoStandard;
        if (isPromoPeriod || totalBoxes >= 2) {
            shippingCost = 0;
        }

        // Sconto
        let discounts = [];
        if (isPromoPeriod && totalBoxes >= 2) {
            discounts = [{ coupon: 'xdWh1tLh' }]; // Il tuo ID corretto
        }

        // --- 3. LINE ITEMS ---
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
        
        // --- 4. COSTRUZIONE DINAMICA DELLA SESSIONE (IL FIX REALE) ---
        // Creiamo l'oggetto base SENZA i codici promozionali
        const sessionParams = {
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${config.websiteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${config.websiteUrl}/cancel.html`,
            customer_email: customerEmail,
            shipping_address_collection: { allowed_countries: ['IT'] },
        };

        // Aggiungiamo O lo sconto automatico O la possibilità di inserire codici. MAI ENTRAMBI.
        if (discounts.length > 0) {
            sessionParams.discounts = discounts;
            // NON aggiungiamo proprio la proprietà 'allow_promotion_codes'
        } else {
            sessionParams.allow_promotion_codes = true;
        }

        const session = await stripe.checkout.sessions.create(sessionParams);

        return {
            statusCode: 200,
            body: JSON.stringify({ url: session.url }),
        };

    } catch (error) {
        console.error('Errore Stripe:', error);
        // Qui mandiamo indietro l'errore VERO (details)
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: 'Errore Checkout Stripe', 
                details: error.raw ? error.raw.message : error.message 
            }),
        };
    }
};
