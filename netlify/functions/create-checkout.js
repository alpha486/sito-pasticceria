// --- INCLUSIONI E CONFIGURAZIONE INIZIALE ---
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// I tuoi dati prodotto specifici, correttamente mantenuti.
const productPriceMap = {
    "Box Grande Crunch": "price_1Riud8BIB1UTN6OS7Nl0MrBu", // <-- INCOLLA QUI L'ID PREZZO REALE
    "Box Grande Gnammy": "price_1RiuebBIB1UTN6OSbWaOLZQ3", // <-- INCOLLA QUI L'ID PREZZO REALE
    "Box Piccola Slurp": "price_1RiufWBIB1UTN6OSXsrBeXPo", // <-- INCOLLA QUI L'ID PREZZO REALE
};
const shippingPriceId = "price_1Riuh1BIB1UTN6OSWeMIrf5f"; // <-- INCOLLA QUI L'ID PREZZO DELLA SPEDIZIONE

const allProducts = [
  { "name": "Box Grande Crunch", "size": "grande" },
  { "name": "Box Grande Gnammy", "size": "grande" },
  { "name": "Box Piccola Slurp", "size": "normale" }
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
        if (!process.env.STRIPE_SECRET_KEY) throw new Error("Chiave Stripe non configurata.");

        const { cart: cartItems } = JSON.parse(event.body);
        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Carrello vuoto.' }) };
        }

        const lineItems = cartItems.map(item => {
            const priceId = productPriceMap[item.name];
            if (!priceId) throw new Error(`ID Prezzo non trovato per il prodotto: ${item.name}`);
            
            // NON inviamo più i dati del prodotto, ma solo l'ID del prezzo.
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

        const sessionPayload = {
            payment_method_types: ['card', 'paypal', 'google_pay', 'apple_pay', 'satispay'],
            mode: 'payment',
            line_items: lineItems,
            shipping_address_collection: { allowed_countries: ['IT'] },
            allow_promotion_codes: true,
            customer_creation: 'always',
            metadata: { cart: JSON.stringify(cartItems) },
            success_url: `${process.env.URL}/success.html`,
            cancel_url: `${process.env.URL}/cancel.html`,
        };
        
        const session = await stripe.checkout.sessions.create(sessionPayload);
        return { statusCode: 200, body: JSON.stringify({ url: session.url }) };

    } catch (error) {
        console.error("Errore checkout live:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}