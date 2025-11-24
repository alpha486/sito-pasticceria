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

        // --- 1. CONFIGURAZIONE DATE BLACK FRIDAY ---
        const now = new Date();
        const currentYear = now.getFullYear();
        // Mese 10 = Novembre (Gennaio è 0)
        const promoStart = new Date(currentYear, 10, 24); 
        const promoEnd = new Date(currentYear, 10, 30, 23, 59, 59);
        const isPromoPeriod = now >= promoStart && now <= promoEnd;

        // --- 2. LOGICA SPEDIZIONE E SCONTI ---
        const totalBoxes = cart.reduce((sum, item) => sum + item.quantity, 0);
        
        // Spedizione: Gratuita se è il periodo Black Friday OPPURE se ci sono 2+ box (regola standard)
        let shippingCost = config.shipping.costoStandard;
        if (isPromoPeriod || totalBoxes >= 2) {
            shippingCost = 0;
        }

        // Sconto: Se periodo Black Friday E ci sono 2+ articoli -> applica coupon
        let discounts = [];
        if (isPromoPeriod && totalBoxes >= 2) {
            discounts = [{
                coupon: 'xdWh1tLh', // <--- IMPORTANTE: Incolla qui l'ID del coupon creato su Stripe
            }];
        }

        // --- CREAZIONE ELEMENTI CARRELLO ---
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

        // Aggiungi la spedizione come riga se c'è un costo
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
        
        // --- CREAZIONE SESSIONE STRIPE ---
                // --- CREAZIONE SESSIONE STRIPE ---
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            discounts: discounts, 
            success_url: `${config.websiteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${config.websiteUrl}/cancel.html`,
            customer_email: customerEmail,
            // MODIFICA QUI SOTTO:
            // Se ci sono sconti automatici (Black Friday), disabilita l'inserimento manuale
            allow_promotion_codes: discounts.length > 0 ? false : true, 
            shipping_address_collection: {allowed_countries: ['IT'],},
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
