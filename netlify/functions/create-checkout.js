// Funzione Netlify: create-checkout.js

// --- INCLUSIONI ---
// Inclusione del client per MongoDB (per usi futuri come il webhook)
const { MongoClient } = require('mongodb');
// Inclusione della libreria Stripe, inizializzata con la chiave segreta
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// Lettura della URI di connessione a MongoDB dalle variabili d'ambiente
const mongoUri = process.env.MONGODB_URI;
// Caricamento del catalogo prodotti per una validazione sicura lato server
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
        // La validazione si basa sempre sul nome base del prodotto
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

    // Struttura di gestione degli errori robusta
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

        // --- MODIFICA CHIAVE INTEGRATA QUI ---
        // Costruisce la lista degli articoli per Stripe, validando ogni prodotto
        // e includendo le opzioni scelte nel nome e nella descrizione.
        const lineItems = cartItems.map(item => {
            // La validazione del prezzo avviene sempre sul prodotto base
            const product = products.find(p => p.name === item.name);
            if (!product) throw new Error(`Prodotto non trovato nel catalogo: ${item.name}`);

            // Creiamo un nome dinamico e una descrizione per la pagina di checkout di Stripe
            const productNameWithOptions = item.option ? `${item.name} (${item.option})` : item.name;
            const productDescription = item.option ? `Scelta: ${item.option}` : 'Prodotto standard';

            return {
                price_data: {
                    currency: 'eur',
                    product_data: { 
                        name: productNameWithOptions,    // USA IL NOME COMPLETO CON L'OPZIONE
                        description: productDescription, // AGGIUNGE L'OPZIONE COME DESCRIZIONE
                    },
                    unit_amount: Math.round(product.price * 100), // Prezzo in centesimi, dal prodotto validato
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

        // Chiedi a Stripe di creare la sessione di pagamento
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'paypal'],
            mode: 'payment',
            line_items: lineItems,
            
            // Richiesta dell'indirizzo di spedizione
            shipping_address_collection: {
                allowed_countries: ['IT'],
            },
            
            // Aggiungiamo i metadati alla sessione. Questo è FONDAMENTALE.
            // Salviamo il carrello originale completo (con le opzioni) per poterlo 
            // registrare nel nostro database dopo il pagamento (tramite webhook).
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
        // Gestione centralizzata degli errori
        console.error("Errore nella funzione di checkout:", error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Si è verificato un errore interno. Riprova più tardi." }) 
        };
    }
};