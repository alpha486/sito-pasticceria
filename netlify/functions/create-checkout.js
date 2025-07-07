// --- INCLUSIONI E CONFIGURAZIONE INIZIALE ---
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Per massima sicurezza e coerenza, i dati dei prodotti sono definiti qui,
// direttamente nella funzione, invece di essere letti da un file esterno.
// Questa è la "fonte della verità" per i prezzi e le taglie.
const allProducts = [
  { "id": 1, "name": "Box Grande Crunch", "price": 25.00, "size": "grande" },
  { "id": 2, "name": "Box Grande Gnammy", "price": 22.00, "size": "grande" },
  { "id": 3, "name": "Box Fantasia di Sapori", "price": 28.00, "size": "normale" }
];


/**
 * Funzione helper per calcolare il costo di spedizione in modo sicuro sul server.
 * Prende il carrello come input e restituisce il costo di spedizione.
 */
const calculateShippingCost = (cart) => {
    const SHIPPING_FEE = 9.90;
    
    // Calcoliamo la quantità totale di box e quante di esse sono "grandi"
    let totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
    let largeBoxQuantity = cart.filter(item => {
        const productInfo = allProducts.find(p => p.name === item.name);
        return productInfo && productInfo.size === 'grande';
    }).reduce((sum, item) => sum + item.quantity, 0);
    
    // Applichiamo le regole di business per la spedizione gratuita
    if (largeBoxQuantity >= 2 || totalQuantity >= 3) {
        return 0; 
    }
    
    return SHIPPING_FEE;
};


/**
 * Funzione principale che Netlify eseguirà quando viene chiamata.
 * Crea una sessione di checkout su Stripe.
 */
exports.handler = async (event) => {
    try {
        // Controllo di sicurezza fondamentale: la chiave di Stripe deve esistere.
        if (!process.env.STRIPE_SECRET_KEY) {
            throw new Error("Variabile d'ambiente Stripe (STRIPE_SECRET_KEY) non configurata.");
        }

        // Estraiamo i dati inviati dal frontend (il carrello e l'eventuale codice sconto).
        const { cart: cartItems, discountCode } = JSON.parse(event.body);
        
        // Controllo di validità dei dati ricevuti.
        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Richiesta non valida o carrello vuoto.' }) };
        }

        // Costruisce la lista degli articoli (line_items) da passare a Stripe.
        const lineItems = cartItems.map(item => {
            // Per ogni articolo nel carrello, troviamo il prodotto corrispondente nella nostra lista sicura.
            const product = allProducts.find(p => p.name === item.name);
            if (!product) throw new Error(`Prodotto non trovato nel catalogo server: ${item.name}`);
            
            // Creiamo un nome e una descrizione personalizzati se ci sono opzioni (es. gusti).
            const productNameWithOptions = item.option ? `${item.name} (${item.option})` : item.name;
            const productDescription = item.option ? `Scelta: ${item.option}` : 'Prodotto standard';

            return {
                price_data: {
                    currency: 'eur',
                    product_data: { 
                        name: productNameWithOptions,
                        description: productDescription,
                    },
                    unit_amount: Math.round(product.price * 100), // Prezzo in centesimi.
                },
                quantity: item.quantity,
            };
        });

        // Calcoliamo e aggiungiamo il costo di spedizione come un articolo separato.
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
            metadata: { // Salviamo i dati del carrello per usarli nel webhook dopo il pagamento
                cart: JSON.stringify(cartItems)
            },
            success_url: `${process.env.URL}/success.html`,
            cancel_url: `${process.env.URL}/cancel.html`,
        };
        
        // Logica finale e robusta per la gestione dei codici sconto.
        if (discountCode) {
            // Se l'utente ha inserito un codice, lo cerchiamo su Stripe.
            const promotionCodes = await stripe.promotionCodes.list({
                active: true,
                code: discountCode.trim().toUpperCase(),
                limit: 1,
            });

            if (promotionCodes.data.length > 0) {
                // Se il codice è valido, lo aggiungiamo alla sessione.
                sessionPayload.discounts = [{
                    promotion_code: promotionCodes.data[0].id,
                }];
            } else {
                // Se il codice non è valido, abilitiamo comunque il campo su Stripe.
                sessionPayload.allow_promotion_codes = true;
            }
        } else {
            // Se non è stato inviato alcun codice, abilitiamo il campo su Stripe.
            sessionPayload.allow_promotion_codes = true;
        }

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