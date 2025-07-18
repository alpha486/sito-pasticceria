const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// La nostra fonte di verità per prezzi e taglie, per sicurezza
const allProducts = [
  { "id": 1, "name": "Box Grande Crunch", "price": 33.00, "size": "grande" },
  { "id": 2, "name": "Box Grande Gnammy", "price": 33.00, "size": "grande" },
  { "id": 3, "name": "Box Piccola Slurp", "price": 26.00, "size": "normale" }
];
// L'ID del prezzo della spedizione è ancora utile
const shippingPriceId = "price_1Riuh1BIB1UTN6OSWeMIrf5f"; // <-- Assicurati che questo sia l'ID LIVE


const calculateShippingCost = (cart) => {
    const SHIPPING_FEE = 9.90;
    let totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
    let largeBoxQuantity = cart.filter(item => {
        const productInfo = allProducts.find(p => p.name === item.name);
        return productInfo && productInfo.size === 'grande';
    }).reduce((sum, item) => sum + item.quantity, 0);
    if (largeBoxQuantity >= 2 || totalQuantity >= 3) return 0;
    return SHIPPING_FEE;
};

exports.handler = async (event) => {
    try {
        if (!process.env.STRIPE_SECRET_KEY) throw new Error("Chiave Stripe non configurata.");

        const { cart: cartItems, customerEmail } = JSON.parse(event.body);
        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Carrello vuoto.' }) };
        }
        if (!customerEmail) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Email del cliente mancante.' }) };
        }

        // --- GESTIONE CLIENTE ESPLICITA (INVARIATA) ---
        const existingCustomers = await stripe.customers.list({ email: customerEmail, limit: 1 });
        let customer;
        if (existingCustomers.data.length > 0) {
            customer = existingCustomers.data[0];
        } else {
            customer = await stripe.customers.create({ email: customerEmail });
        }

        // --- MODIFICA CHIAVE: Torniamo a usare `price_data` ---
        const lineItems = cartItems.map(item => {
            const product = allProducts.find(p => p.name === item.name);
            if (!product) throw new Error(`Prodotto non trovato: ${item.name}`);

            const productNameWithOptions = item.option ? `${item.name} (${item.option})` : item.name;

            return {
                price_data: {
                    currency: 'eur',
                    // Creiamo il prodotto al volo con il nome personalizzato
                    product_data: { 
                        name: productNameWithOptions,
                    },
                    unit_amount: Math.round(product.price * 100),
                },
                quantity: item.quantity,
            };
        });

        const shippingCost = calculateShippingCost(cartItems);
        if (shippingCost > 0) {
            // Per la spedizione, continuiamo a usare l'ID del prezzo, è più pulito
            lineItems.push({
                price: shippingPriceId,
                quantity: 1,
            });
        }

        const sessionPayload = {
            payment_method_types: ['card', 'paypal'],
            mode: 'payment',
            line_items: lineItems,
            customer: customer.id,
            shipping_address_collection: { allowed_countries: ['IT'] },
            allow_promotion_codes: true,
            metadata: { cart: JSON.stringify(cartItems) },
            success_url: `${process.env.URL}/success.html`,
            cancel_url: `${process.env.URL}/cancel.html`,
        };
        
        const session = await stripe.checkout.sessions.create(sessionPayload);
        return { statusCode: 200, body: JSON.stringify({ url: session.url }) };

    } catch (error)
        console.error("Errore checkout:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};