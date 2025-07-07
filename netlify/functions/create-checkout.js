// Funzione Netlify: create-checkout-session.js

// --- INCLUSIONI DAL NUOVO CODICE ---
// 1. Inclusione del client per MongoDB
// Questa riga prepara la connessione al database, che verrà usata in un'altra funzione
// (il webhook) per salvare l'ordine dopo il pagamento.
const { MongoClient } = require('mongodb');

// 2. Inclusione della libreria Stripe, inizializzata con la chiave segreta
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// --- INCLUSIONI DAL VECCHIO CODICE (E NUOVO) ---
// 3. Lettura della URI di connessione a MongoDB dalle variabili d'ambiente
const mongoUri = process.env.MONGODB_URI;

// 4. Caricamento del catalogo prodotti per una validazione sicura lato server
const products = require('../../products.json');

/**
 * Funzione helper per calcolare il costo di spedizione in modo sicuro sul server.
 * Questa logica è identica a quella del vecchio codice.
 * @param {Array} cart - Il carrello inviato dal client.
 * @param {Array} allProducts - Il catalogo prodotti completo per la validazione.
 * @returns {number} - Il costo della spedizione.
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

    // Struttura di gestione degli errori robusta (dal vecchio codice)
    try {
        // Controllo di sicurezza: verifica che le chiavi segrete siano configurate
        if (!process.env.STRIPE_SECRET_KEY || !mongoUri) {
            throw new Error("Una o più variabili d'ambiente (Stripe o MongoDB) non sono configurate.");
        }

        // Estrae e analizza il carrello dal corpo della richiesta
        const cartItems = JSON.parse(event.body);
        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Richiesta non valida o carrello vuoto.' }) };
        }

        // Costruisce la lista degli articoli per Stripe, validando ogni prodotto
        // contro il nostro catalogo `products.json` per evitare manomissioni
        const lineItems = cartItems.map(item => {
            const product = products.find(p => p.name === item.name);
            if (!product) throw new Error(`Prodotto non trovato nel catalogo: ${item.name}`);
            return {
                price_data: {
                    currency: 'eur',
                    product_data: { name: product.name },
                    unit_amount: Math.round(product.price * 100), // Prezzo in centesimi
                },
                quantity: item.quantity,
            };
        });

        // Calcola il costo di spedizione usando la funzione sicura sul server
        const shippingCost = calculateShippingCost(cartItems, products);

        // Aggiunge la spedizione come articolo solo se il costo è maggiore di zero
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

        // Chiedi a Stripe di creare la sessione di pagamento, unendo tutte le configurazioni
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'paypal'],
            mode: 'payment',
            line_items: lineItems,
            
            // Richiesta dell'indirizzo di spedizione (dal vecchio codice)
            shipping_address_collection: {
                allowed_countries: ['IT'],
            },
            
            // --- INCLUSIONE CHIAVE DAL NUOVO CODICE ---
            // Aggiungiamo i metadati alla sessione. Questo è FONDAMENTALE per poter
            // salvare i dettagli dell'ordine nel nostro database DOPO il pagamento.
            metadata: {
                cart: JSON.stringify(cartItems)
            },
            
            // URL di reindirizzamento
            success_url: `${process.env.URL}/success.html`,
            cancel_url: `${process.env.URL}/cancel.html`,
        });

        // Restituisce al browser l'URL della pagina di pagamento di Stripe
        return {
            statusCode: 200,
            body: JSON.stringify({ url: session.url }),
        };

    } catch (error) {
        // Gestione centralizzata degli errori (dal vecchio codice)
        console.error("Errore nella funzione di checkout:", error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Si è verificato un errore interno. Riprova più tardi." }) 
        };
    }
};