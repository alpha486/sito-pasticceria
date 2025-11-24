const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const products = require('./_data/products.json');
const config = require('./_data/config.json');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { cart, customerEmail } = JSON.parse(event.body);
        
        // Controllo validità dati
        if (!cart || !Array.isArray(cart) || !customerEmail) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Dati mancanti o non validi.' }) };
        }

        // --- 1. CONFIGURAZIONE DATE BLACK FRIDAY ---
        const now = new Date();
        const currentYear = now.getFullYear();
        const promoStart = new Date(currentYear, 10, 24); // 24 Novembre
        const promoEnd = new Date(currentYear, 10, 30, 23, 59, 59); // 30 Novembre
        
        // Verifica se siamo nel periodo promo
        const isPromoPeriod = now >= promoStart && now <= promoEnd;

        // --- 2. LOGICA SPEDIZIONE E SCONTI ---
        const totalBoxes = cart.reduce((sum, item) => sum + item.quantity, 0);
        
        // SPEDIZIONE: Gratuita se è Black Friday OPPURE se 2+ box
        let shippingCost = config.shipping.costoStandard;
        if (isPromoPeriod || totalBoxes >= 2) {
            shippingCost = 0;
        }

        // SCONTO: Se periodo Black Friday E ci sono 2+ articoli
        let discounts = [];
        if (isPromoPeriod && totalBoxes >= 2) {
            // ID preso dal tuo screenshot
            discounts = [{ coupon: 'xdWh1tLh' }]; 
        }

        // --- 3. CREAZIONE ELEMENTI CARRELLO ---
        const lineItems = cart.map(item => {
            const product = products.find(p => p.name === item.name);
            // Fallback immagine sicura
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

        // Aggiungi riga spedizione solo se > 0
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
        
        // --- 4. CREAZIONE SESSIONE STRIPE ---
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            discounts: discounts, 
            
            // *** LA CORREZIONE FONDAMENTALE ***
            // Se abbiamo applicato sconti automatici (discounts ha elementi), 
            // DOBBIAMO disabilitare allow_promotion_codes (false).
            allow_promotion_codes: discounts.length > 0 ? false : true, 
            
            success_url: `${config.websiteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${config.websiteUrl}/cancel.html`,
            customer_email: customerEmail,
            shipping_address_collection: { allowed_countries: ['IT'] },
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ url: session.url }),
        };

    } catch (error) {
        console.error('Errore Stripe:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: 'Impossibile creare la sessione di pagamento.', 
                details: error.message 
            }),
        };
    }
};
