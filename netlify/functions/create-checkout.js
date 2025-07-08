// --- INCLUSIONI E CONFIGURAZIONE INIZIALE ---
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// I tuoi dati prodotto specifici, correttamente mantenuti.
const allProducts = [
  { "id": 1, "name": "Box Grande Crunch", "price": 33.00, "size": "grande" },
  { "id": 2, "name": "Box Grande Gnammy", "price": 33.00, "size": "grande" },
  { "id": 3, "name": "Box Piccola Slurp", "price": 26.00, "size": "normale" }
];


/**
 * Funzione helper per calcolare il costo di spedizione. (Logica invariata)
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
 * Funzione principale che Netlify eseguirà.
 * VERSIONE DEFINITIVA CON GESTIONE ESPLICITA DEL CLIENTE.
 */
exports.handler = async (event) => {
    try {
        if (!process.env.STRIPE_SECRET_KEY) {
            throw new Error("Variabile d'ambiente Stripe (STRIPE_SECRET_KEY) non configurata.");
        }

        // --- MODIFICA 1: Riceviamo carrello E email ---
        const { cart: cartItems, customerEmail } = JSON.parse(event.body);
        
        // Controlli di validità sui dati ricevuti
        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Richiesta non valida o carrello vuoto.' }) };
        }
        if (!customerEmail) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Email del cliente mancante, impossibile procedere.' }) };
        }

        // --- MODIFICA 2: Logica robusta "Trova o Crea Cliente" ---
        // Cerca se un cliente con questa email esiste già su Stripe.
        const existingCustomers = await stripe.customers.list({
            email: customerEmail,
            limit: 1,
        });

        let customer;
        if (existingCustomers.data.length > 0) {
            // Se esiste, lo usiamo.
            customer = existingCustomers.data[0];
        } else {
            // Se non esiste, lo creiamo.
            customer = await stripe.customers.create({ email: customerEmail });
        }
        // Da questo punto in poi, abbiamo un ID cliente certo (customer.id).
        
        // Costruzione dei lineItems (logica invariata)
        const lineItems = cartItems.map(item => {
            const product = allProducts.find(p => p.name === item.name);
            if (!product) throw new Error(`Prodotto non trovato nel catalogo server: ${item.name}`);
            const productNameWithOptions = item.option ? `${item.name} (${item.option})` : item.name;
            const productDescription = item.option ? `Scelta: ${item.option}` : 'Prodotto standard';

            return {
                price_data: { currency: 'eur', product_data: { name: productNameWithOptions, description: productDescription }, unit_amount: Math.round(product.price * 100) },
                quantity: item.quantity,
            };
        });

        // Calcolo e aggiunta spedizione (logica invariata)
        const shippingCost = calculateShippingCost(cartItems);
        if (shippingCost > 0) {
            lineItems.push({
                price_data: { currency: 'eur', product_data: { name: 'Spedizione Standard' }, unit_amount: Math.round(shippingCost * 100) },
                quantity: 1,
            });
        }

        // Preparazione del payload finale per Stripe
        const sessionPayload = {
            payment_method_types: ['card', 'paypal'],
            mode: 'payment',
            line_items: lineItems,
            
            // --- MODIFICA 3: Leghiamo la sessione al cliente ---
            // Questo è il passo cruciale che dice a Stripe CHI sta pagando.
            // Rimuoviamo "customer_creation" e usiamo l'ID del cliente trovato/creato.
            customer: customer.id,
            
            shipping_address_collection: { allowed_countries: ['IT'] },
            allow_promotion_codes: true,
            metadata: { cart: JSON.stringify(cartItems) },
            success_url: `${process.env.URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.URL}/cancel.html`,
        };
        
        const session = await stripe.checkout.sessions.create(sessionPayload);
        
        return { statusCode: 200, body: JSON.stringify({ url: session.url }) };

    } catch (error) {
        // Gestione errori (logica invariata)
        console.error("Errore critico nella funzione di checkout:", error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Si è verificato un errore interno. Riprova più tardi." }) 
        };
    }
};