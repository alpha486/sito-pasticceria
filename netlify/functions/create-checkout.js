// --- INCLUSIONI E CONFIGURAZIONE INIZIALE ---
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// La tua mappa di ID Prezzi, che è il metodo corretto per la modalità Live.
// Assicurati che questi ID corrispondano a quelli nella tua dashboard di Stripe LIVE.
const productPriceMap = {
    "Box Grande Crunch": "price_1Riud8BIB1UTN6OS7Nl0MrBu",
    "Box Grande Gnammy": "price_1RiuebBIB1UTN6OSbWaOLZQ3",
    "Box Piccola Slurp": "price_1RiufWBIB1UTN6OSXsrBeXPo",
};
const shippingPriceId = "price_1Riuh1BIB1UTN6OSWeMIrf5f";

// La tua lista di prodotti, usata solo per la logica di spedizione interna.
const allProducts = [
  { "name": "Box Grande Crunch", "size": "grande" },
  { "name": "Box Grande Gnammy", "size": "grande" },
  { "name": "Box Piccola Slurp", "size": "normale" }
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
        // Controllo di sicurezza fondamentale: la chiave di Stripe deve esistere.
        if (!process.env.STRIPE_SECRET_KEY) {
            throw new Error("Variabile d'ambiente Stripe (STRIPE_SECRET_KEY) non configurata.");
        }

        // Riceviamo il carrello E l'email del cliente dal frontend.
        const { cart: cartItems, customerEmail } = JSON.parse(event.body);

        // Controlli di validità sui dati ricevuti.
        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Carrello vuoto o richiesta non valida.' }) };
        }
        if (!customerEmail) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Email del cliente mancante.' }) };
        }

        // --- LOGICA DI GESTIONE CLIENTE ESPLICITA ---
        // 1. Cerca se un cliente con questa email esiste già su Stripe.
        const existingCustomers = await stripe.customers.list({
            email: customerEmail,
            limit: 1,
        });

        let customer;
        if (existingCustomers.data.length > 0) {
            // 2. Se esiste, usiamo il suo ID.
            customer = existingCustomers.data[0];
        } else {
            // 3. Se non esiste, lo creiamo ora.
            customer = await stripe.customers.create({
                email: customerEmail,
            });
        }
        // Da questo punto in poi, abbiamo un `customer.id` garantito.
        // --- FINE LOGICA CLIENTE ---

        const lineItems = cartItems.map(item => {
            const priceId = productPriceMap[item.name];
            if (!priceId) throw new Error(`ID Prezzo non trovato per il prodotto: ${item.name}`);
            
            return {
                price: priceId,
                quantity: item.quantity,
            };
        });

        const shippingCost = calculateShippingCost(cartItems);
        if (shippingCost > 0) {
            lineItems.push({
                price: shippingPriceId,
                quantity: 1,
            });
        }

        // Prepariamo il payload (l'insieme dei dati) da inviare a Stripe.
        const sessionPayload = {
            payment_method_types: ['card', 'paypal'],
            mode: 'payment',
            line_items: lineItems,
            // LEGA LA SESSIONE ALL'ID DEL CLIENTE TROVATO O CREATO.
            // Questo è il passaggio chiave per far funzionare i limiti del coupon.
            customer: customer.id,
            shipping_address_collection: { allowed_countries: ['IT'] },
            allow_promotion_codes: true,
            metadata: { cart: JSON.stringify(cartItems) },
            success_url: `${process.env.URL}/success.html`,
            cancel_url: `${process.env.URL}/cancel.html`,
        };
        
        // Creiamo la sessione di checkout su Stripe.
        const session = await stripe.checkout.sessions.create(sessionPayload);
        
        // Restituiamo l'URL della pagina di pagamento al frontend.
        return { statusCode: 200, body: JSON.stringify({ url: session.url }) };

    } catch (error) {
        // Gestione centralizzata di tutti i possibili errori.
        console.error("Errore checkout live:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};