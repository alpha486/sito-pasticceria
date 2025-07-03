// Legge la variabile d'ambiente sicura fornita da Netlify.
const stripeKey = process.env.STRIPE_SECRET_KEY;

// Inizializza la libreria di Stripe con la chiave.
const stripe = require('stripe')(stripeKey);

// Carica il nostro catalogo prodotti per verificare prezzi e dati.
const products = require('../../products.json');

// Funzione helper per calcolare il costo di spedizione in modo sicuro sul server.
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

    // Applica le regole: spedizione gratuita se vengono acquistate 2 box grandi o 3 box qualsiasi.
    if (largeBoxQuantity >= 2 || totalQuantity >= 3) {
        return 0; 
    }
    
    return SHIPPING_FEE;
};


// Questa è la funzione principale che Netlify eseguirà (il nostro "postino").
exports.handler = async (event) => {

    // Aggiungiamo un blocco try...catch per gestire qualsiasi errore in modo pulito.
    try {
        // Controllo fondamentale: se la chiave di Stripe non è stata trovata, fermati subito.
        if (!stripeKey) {
            throw new Error("La chiave segreta di Stripe non è configurata correttamente.");
        }

        const cartItems = JSON.parse(event.body);
        if (!cartItems || cartItems.length === 0) {
            return { statusCode: 400, body: 'Carrello vuoto.' };
        }

        // Crea la lista degli articoli per Stripe, verificando i dati con il nostro catalogo.
        const lineItems = cartItems.map(item => {
            const product = products.find(p => p.name === item.name);
            if (!product) throw new Error(`Prodotto non trovato nel catalogo: ${item.name}`);
            return {
                price_data: {
                    currency: 'eur',
                    product_data: { name: product.name },
                    unit_amount: Math.round(product.price * 100),
                },
                quantity: item.quantity,
            };
        });

        // Calcola il costo di spedizione usando la nostra funzione sicura.
        const shippingCost = calculateShippingCost(cartItems, products);

        // Aggiungi la spedizione come articolo solo se il costo è maggiore di zero.
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

        // Chiedi a Stripe di creare la sessione di pagamento.
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'paypal'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${process.env.URL}/success.html`,
            cancel_url: `${process.env.URL}/cancel.html`,
        });

        // Rispedisci al browser l'URL della pagina di pagamento.
        return { statusCode: 200, body: JSON.stringify({ url: session.url }) };

    } catch (error) {
        // Se qualcosa va storto in qualsiasi punto, lo registreremo nel log di Netlify
        // e invieremo una risposta di errore generica per sicurezza.
        console.error("Errore nella funzione di checkout:", error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Si è verificato un errore interno. Riprova più tardi." }) 
        };
    }
};