// --- INCLUSIONI E CONFIGURAZIONE INIZIALE ---
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Per massima sicurezza e coerenza, i dati dei prodotti sono definiti qui.
const allProducts = [
  { "id": 1, "name": "Box Grande Crunch", "price": 33.00, "size": "grande" },
  { "id": 2, "name": "Box Grande Gnammy", "price": 33.00, "size": "grande" },
  { "id": 3, "name": "Box Piccola Slurp", "price": 26.00, "size": "normale" }
];


/**
 * Funzione helper per calcolare il costo di spedizione in modo sicuro sul server.
 */
const calculateShippingCost = (cart) => {
    const SHIPPING_FEE = 9.90;
    
    let totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
    let largeBoxQuantity = cart.filter(item => {
        const productInfo = allProducts.find(p => p.name === item.name);
        return productInfo && productInfo.size === 'grande';
    }).reduce((sum, item) => sum + item.quantity, 0);
    
    if (largeBoxQuantity >= 2 || totalQuantity >= 3) {
        return 0; 
    }
    
    return SHIPPING_FEE;
};


/**
 * Funzione principale che Netlify eseguirà quando viene chiamata.
 */
exports.handler = async (event) => {
    try {
        if (!process.env.STRIPE_SECRET_KEY) {
            throw new Error("Variabile d'ambiente Stripe (STRIPE_SECRET_KEY) non configurata.");
        }

        const { cart: cartItems } = JSON.parse(event.body);
        
        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Richiesta non valida o carrello vuoto.' }) };
        }

        const lineItems = cartItems.map(item => {
            const product = allProducts.find(p => p.name === item.name);
            if (!product) throw new Error(`Prodotto non trovato nel catalogo server: ${item.name}`);
            
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

        const shippingCost = calculateShippingCost(cartItems);
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

        // Prepariamo il payload (l'insieme dei dati) da inviare a Stripe.
        const sessionPayload = {
            payment_method_types: ['card', 'paypal'],
            mode: 'payment',
            line_items: lineItems,
            shipping_address_collection: {
                allowed_countries: ['IT'],
            },
            // Abilitiamo il campo per i codici promozionali sulla pagina di checkout di Stripe.
            allow_promotion_codes: true,
            
            // Diciamo a Stripe che, dopo il pagamento, vogliamo recuperare l'oggetto Customer.
            customer_creation: 'always',

            // Manteniamo i metadati per il webhook, sono sempre utili.
            metadata: { 
                cart: JSON.stringify(cartItems)
            },
            success_url: `${process.env.URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.URL}/cancel.html`,
        };
        
        // Creiamo la sessione di checkout su Stripe con tutti i dati preparati.
        const session = await stripe.checkout.sessions.create(sessionPayload);
        
        // Restituiamo l'URL della pagina di pagamento al frontend.
        return { statusCode: 200, body: JSON.stringify({ url: session.url }) };

    } catch (error) {
        // Gestione centralizzata di tutti i possibili errori.
        console.error("Errore critico nella funzione di checkout:", error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Si è verificato un errore interno. Riprova più tardi." }) 
        };
    }
};