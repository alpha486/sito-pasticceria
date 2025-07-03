const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const products = require('../../products.json');

// Funzione helper per calcolare la spedizione in modo sicuro
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

    // Applica le regole: spedizione gratuita se vengono acquistate 2 box grandi o 3 box qualsiasi
    if (largeBoxQuantity >= 2 || totalQuantity >= 3) {
        return 0; 
    }
    
    return SHIPPING_FEE;
};

exports.handler = async (event) => {
    const cartItems = JSON.parse(event.body);

    const lineItems = cartItems.map(item => {
        const product = products.find(p => p.name === item.name);
        return {
            price_data: {
                currency: 'eur',
                product_data: { name: product.name },
                unit_amount: Math.round(product.price * 100),
            },
            quantity: item.quantity,
        };
    });

    // Calcola il costo di spedizione usando la nostra funzione sicura
    const shippingCost = calculateShippingCost(cartItems, products);

    // Aggiungi la spedizione come articolo solo se il costo è maggiore di zero
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

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card', 'paypal'],
        line_items: lineItems,
        mode: 'payment',
        success_url: `${process.env.URL || 'http://localhost:8888'}/success.html`,
        cancel_url: `${process.env.URL || 'http://localhost:8888'}/cancel.html`,
    });

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
};