// --- INCLUSIONI E CONFIGURAZIONE INIZIALE ---
const stripePackage = require('stripe');

// --- LOGICA PER SELEZIONARE LE CHIAVI STRIPE CORRETTE (LIVE O TEST) ---
const isProduction = process.env.CONTEXT === 'production';

const stripeKey = isProduction
  ? process.env.STRIPE_SECRET_KEY       // Se in produzione, usa la chiave live
  : process.env.TEST_STRIPE_SECRET_KEY; // Altrimenti (test, develop), usa la nuova chiave di test

// Aggiungiamo un log per essere sicuri al 100% di quale chiave stiamo usando
console.log(`CONTEXT: ${process.env.CONTEXT}. Using ${isProduction ? 'LIVE' : 'TEST'} Stripe key.`);

// ...
const stripe = stripePackage(stripeKey);

// --- MAPPA DEGLI ID PREZZO DIVISA PER AMBIENTE ---

// 1. Mappa dei prezzi VERI (dalla tua modalità LIVE, già li hai)
const livePriceMap = {
  "Box Grande Crunch": "price_1Riud8BIB1UTN6OS7Nl0MrBu",
  "Box Grande Gnammy": "price_1RiuebBIB1UTN6OSbWaOLZQ3",
  "Box Piccola Slurp": "price_1RiufWBIB1UTN6OSXsrBeXPo"
};
const liveShippingPriceId = "price_1Riuh1BIB1UTN6OSWeMlrf5f";

// 2. Mappa dei prezzi di TEST (devi ottenerli dalla tua dashboard Stripe in modalità TEST)
const testPriceMap = {
  "Box Grande Crunch": "price_1Rm2fVBIB1UTN6OSA2B10udE",
  "Box Grande Gnammy": "price_1Rm2fvBIB1UTN6OSqQiYJs06",
  "Box Piccola Slurp": "price_1Rm2gIBIB1UTN6OSEMNo2OTb"
};
const testShippingPriceId = "price_1Rm2ufBIB1UTN6OSjOb6Mu81";

// 3. Scegli la mappa e l'ID corretti in base al contesto
//    La variabile 'isProduction' l'abbiamo già definita sopra!
const productPriceMap = isProduction ? livePriceMap : testPriceMap;
const shippingPriceId = isProduction ? liveShippingPriceId : testShippingPriceId;
// ---------------------------------------------------

// La tua lista di prodotti, usata solo per la logica di spedizione interna.
// ...

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