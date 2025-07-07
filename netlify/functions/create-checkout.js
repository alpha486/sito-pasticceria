// Funzione Netlify: create-checkout.js

// --- INCLUSIONI ---
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// Caricamento del catalogo prodotti per una validazione sicura lato server
const products = require('../../products.json');

/**
 * Funzione helper per calcolare il costo di spedizione in modo sicuro sul server.
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
        // Controllo di sicurezza
        if (!process.env.STRIPE_SECRET_KEY) {
            throw new Error("Variabile d'ambiente Stripe non configurata.");
        }

        // Estraiamo solo il carrello. Non ci interessa più ricevere lo sconto dal client.
        const { cart: cartItems } = JSON.parse(event.body);
        
        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Richiesta non valida o carrello vuoto.' }) };
        }

        // Costruisce la lista degli articoli per Stripe
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

        // Calcola e aggiunge il costo di spedizione
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

        // Prepara il payload per la sessione di Stripe
        const sessionPayload = {
            payment_method_types: ['card', 'paypal'],
            mode: 'payment',
            line_items: lineItems,
            shipping_address_collection: {
                allowed_countries: ['IT'],
            },
            
            // --- LA MODIFICA CHIAVE CHE SEMPLIFICA TUTTO ---
            // Diciamo a Stripe di mostrare il campo per i codici promozionali.
            allow_promotion_codes: true,
            
            // Manteniamo i metadati per il webhook di salvataggio ordine
            metadata: {
                cart: JSON.stringify(cartItems)
            },
            
            success_url: `${process.env.URL}/success.html`,
            cancel_url: `${process.env.URL}/cancel.html`,
        };
        
        // La vecchia logica `sessionPayload.discounts` è stata correttamente rimossa.

        const session = await stripe.checkout.sessions.create(sessionPayload);
        return { statusCode: 200, body: JSON.stringify({ url: session.url }) };

    } catch (error) {
        console.error("Errore nella funzione di checkout:", error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Si è verificato un errore interno. Riprova più tardi." }) 
        };
    }
};