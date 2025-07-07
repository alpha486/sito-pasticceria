// Funzione Netlify: create-checkout.js

// --- INCLUSIONI ---
const { MongoClient } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mongoUri = process.env.MONGODB_URI;
const products = require('../../products.json');

/**
 * Funzione helper per calcolare il costo di spedizione in modo sicuro sul server.
 * (Logica invariata)
 */
const calculateShippingCost = (cart, allProducts) => {
    const SHIPPING_FEE = 9.90;
    let totalQuantity = 0;
    let largeBoxQuantity = 0;
    cart.forEach(item => {
        totalQuantity += item.quantity;
        const productData = allProducts.find(p => p.name === item.name);
        if (productData && productData.size === 'grande') {
            largeBoxQuantity += item.quantity;
        }
    });
    if (largeBoxQuantity >= 2 || totalQuantity >= 3) {
        return 0; // Spedizione gratuita
    }
    return SHIPPING_FEE;
};

/**
 * Funzione principale che Netlify eseguirà per creare una sessione di checkout Stripe.
 */
exports.handler = async (event) => {
    try {
        // Controllo di sicurezza: verifica che le chiavi segrete siano configurate
        if (!process.env.STRIPE_SECRET_KEY || !mongoUri) {
            throw new Error("Una o più variabili d'ambiente (Stripe o MongoDB) non sono configurate.");
        }

        // --- MODIFICA CHIAVE: Estrae l'oggetto complesso dal corpo della richiesta ---
        const { cart: cartItems, discountCode } = JSON.parse(event.body);
        
        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Richiesta non valida o carrello vuoto.' }) };
        }

        // Costruisce la lista degli articoli per Stripe, validando ogni prodotto
        // e includendo le opzioni scelte nel nome e nella descrizione (logica esistente)
        const lineItems = cartItems.map(item => {
            const product = products.find(p => p.name === item.name);
            if (!product) throw new Error(`Prodotto non trovato nel catalogo: ${item.name}`);
            const productNameWithOptions = item.option ? `${item.name} (${item.option})` : item.name;
            const productDescription = item.option ? `Scelta: ${item.option}` : 'Prodotto standard';

            return {
                price_data: {
                    currency: 'eur',
                    product_data: { 
                        name: productNameWithOptions,
                        description: productDescription,
                    },
                    unit_amount: Math.round(product.price * 100),
                },
                quantity: item.quantity,
            };
        });

        // Calcola e aggiunge il costo di spedizione (logica esistente)
        const shippingCost = calculateShippingCost(cartItems, products);
        if (shippingCost > 0) {
            lineItems.push({
                price_data: {
                    currency: 'eur',
                    product_data: { name: 'Spedizione Standard' },
                    unit_amount: Math.round(shippingCost * 100),
                },
                quantity: 1,
            });
        }

        // --- MODIFICA CHIAVE: Prepara il payload per la sessione di Stripe ---
        const sessionPayload = {
            payment_method_types: ['card', 'paypal'],
            mode: 'payment',
            line_items: lineItems,
            shipping_address_collection: {
                allowed_countries: ['IT'],
            },
            metadata: {
                cart: JSON.stringify(cartItems) // Fondamentale da mantenere per il webhook
            },
            success_url: `${process.env.URL}/success.html`,
            cancel_url: `${process.env.URL}/cancel.html`,
        };
        
        // --- MODIFICA CHIAVE: Applica il codice sconto alla sessione se esiste ---
        if (discountCode) {
            sessionPayload.discounts = [{
                // NOTA: il "discountCode" deve essere l'ID del "Promotion Code" di Stripe
                promotion_code: discountCode, 
            }];
        }

        // Chiedi a Stripe di creare la sessione di pagamento usando il payload costruito
        const session = await stripe.checkout.sessions.create(sessionPayload);

        // Restituisce l'URL di pagamento al browser
        return {
            statusCode: 200,
            body: JSON.stringify({ url: session.url }),
        };

    } catch (error) {
        // Gestione centralizzata degli errori
        console.error("Errore nella funzione di checkout:", error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Si è verificato un errore interno. Riprova più tardi." }) 
        };
    }
};