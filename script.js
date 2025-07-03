document.addEventListener('DOMContentLoaded', () => {

    // --- STATO GLOBALE DELL'APPLICAZIONE ---
    let cart = JSON.parse(localStorage.getItem('shoppingCart')) || [];
    let allProducts = [];

    // --- FUNZIONI DI BASE (salvataggio, icone, notifiche) ---
    const saveCart = () => localStorage.setItem('shoppingCart', JSON.stringify(cart));
    
    const updateCartIcon = () => {
        const cartCountElement = document.getElementById('cart-count');
        if (!cartCountElement) return;
        const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 0), 0);
        cartCountElement.textContent = totalItems;
    };
    
    const showNotification = (message) => {
        const notificationElement = document.getElementById('notification');
        if (!notificationElement) return;
        clearTimeout(window.notificationTimeout);
        notificationElement.textContent = message;
        notificationElement.classList.add('show');
        window.notificationTimeout = setTimeout(() => {
            notificationElement.classList.remove('show');
        }, 3000);
    };

    // --- FUNZIONI PER "DISEGNARE" LE PAGINE ---

    const renderCartPreview = () => {
        const cartPreviewContainer = document.getElementById('cart-preview-content');
        if (!cartPreviewContainer) return;
        cartPreviewContainer.innerHTML = cart.length === 0 
            ? '<p class="cart-empty-message">Il tuo carrello è vuoto.</p>'
            : cart.map(item => `<div class="preview-item"><div class="preview-item-image"><img src="${item.img}" alt="${item.name}"></div><div class="preview-item-details"><h4>${item.name}</h4><p>Quantità: ${item.quantity}</p></div><div class="preview-item-price"><strong>€ ${(item.price * item.quantity).toFixed(2)}</strong></div></div>`).join('');
    };

    const renderShopProducts = () => {
        const container = document.getElementById('product-list-container');
        if (!container) return; // Esegui solo se siamo nella pagina dello shop
        container.innerHTML = allProducts.map(p => `
            <a href="prodotto.html?id=${p.id}" class="product-card-link">
                <div class="box-card">
                    <img src="${p.image_url}" alt="${p.name}">
                    <h3>${p.name}</h3>
                    <p>${p.description.substring(0, 100)}...</p>
                    <div class="secondary-button">Vedi Dettagli</div>
                </div>
            </a>
        `).join('');
    };
    
    const renderProductDetailPage = () => {
        const container = document.getElementById('product-detail-container');
        if (!container || !allProducts.length) return;

        const urlParams = new URLSearchParams(window.location.search);
        const productId = parseInt(urlParams.get('id'));
        const product = allProducts.find(p => p.id === productId);

        if (!product) {
            container.innerHTML = '<p class="cart-empty-message">Prodotto non trovato. <a href="shop.html">Torna allo shop</a>.</p>';
            return;
        }

        document.title = `${product.name} - Incantesimi di Zucchero`;
        container.innerHTML = `
            <div class="product-detail-content">
                <div class="product-detail-image"><img src="${product.image_url}" alt="${product.name}"></div>
                <div class="product-detail-info">
                    <h2>${product.name}</h2>
                    <div class="price">€ ${product.price.toFixed(2)}</div>
                    ${product.size === 'grande' ? `<p class="free-shipping-hint">✨ Aggiungi un'altra box grande e la spedizione è gratis!</p>` : ''}
                    <p>${product.description}</p>
                    <div class="product-allergens-detail">
                        <strong>Allergeni Presenti:</strong>
                        <p>${product.allergens.join(', ')}</p>
                    </div>
                    <a href="#" class="cta-button" data-name="${product.name}" data-price="${product.price}" data-img="${product.image_url}">Aggiungi al Carrello</a>
                </div>
            </div>
        `;
        attachAddToCartListeners();
    };

    const renderCartPage = () => {
        const container = document.getElementById('cart-container');
        if (!container) return;
        if (cart.length === 0) {
            container.innerHTML = '<p class="cart-empty-message">Il tuo carrello è vuoto.</p>';
            return;
        }
        let subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const SHIPPING_FEE = 9.90;
        let shippingCost = SHIPPING_FEE;
        let totalQuantity = 0;
        let largeBoxQuantity = 0;
        cart.forEach(item => {
            totalQuantity += item.quantity;
            const productData = allProducts.find(p => p.name === item.name);
            if (productData && productData.size === 'grande') {
                largeBoxQuantity += item.quantity;
            }
        });
        let shippingDisplay = `€ ${SHIPPING_FEE.toFixed(2)}`;
        if (largeBoxQuantity >= 2 || totalQuantity >= 3) {
            shippingCost = 0;
            shippingDisplay = `Gratuita!`;
        }
        let grandTotal = subtotal + shippingCost;
        container.innerHTML = cart.map((item, index) => `
            <div class="cart-item">
                <div class="cart-item-image"><img src="${item.img}" alt="${item.name}"></div>
                <div class="cart-item-details"><h3>${item.name}</h3><p>Prezzo: € ${item.price.toFixed(2)}</p><button class="remove-item-btn" data-index="${index}">Rimuovi</button></div>
                <div class="cart-item-quantity"><button class="quantity-btn" data-index="${index}" data-change="-1">-</button><span>${item.quantity}</span><button class="quantity-btn" data-index="${index}" data-change="1">+</button></div>
                <div class="cart-item-subtotal"><strong>€ ${(item.price * item.quantity).toFixed(2)}</strong></div>
            </div>
        `).join('') + `<div class="cart-totals"><div class="cart-totals-row"><span>Subtotale:</span><span>€ ${subtotal.toFixed(2)}</span></div><div class="cart-totals-row"><span>Spedizione:</span><span>${shippingDisplay}</span></div>${shippingCost === 0 ? '<p class="free-shipping-text">Hai diritto alla spedizione gratuita!</p>' : ''}<div class="cart-totals-row grand-total"><span>TOTALE:</span><span>€ ${grandTotal.toFixed(2)}</span></div><a href="#" id="checkout-button" class="cta-button">Procedi al Pagamento</a></div>`;
    };

    // --- FUNZIONI PER GLI ASCOLTATORI ---
    const attachAddToCartListeners = () => {
        document.querySelectorAll('.cta-button[data-name]').forEach(button => {
            if (button.dataset.listenerAttached) return;
            button.dataset.listenerAttached = 'true';
            button.addEventListener('click', event => {
                event.preventDefault();
                const { name, price, img } = button.dataset;
                const existingProduct = cart.find(item => item.name === name);
                if (existingProduct) existingProduct.quantity++;
                else cart.push({ name: name, price: parseFloat(price), img: img, quantity: 1 });
                saveCart();
                updateCartIcon();
                renderCartPreview();
                showNotification(`Hai aggiunto: ${name}!`);
            });
        });
    };

    const attachCartPageListeners = () => {
        const container = document.getElementById('cart-container');
        if (!container) return;
        container.addEventListener('click', event => {
            const target = event.target;
            if (!target.matches('.quantity-btn') && !target.matches('.remove-item-btn')) return;
            const index = target.dataset.index;
            if (index === undefined) return;
            if (target.matches('.remove-item-btn')) {
                cart.splice(index, 1);
            }
            if (target.matches('.quantity-btn')) {
                const change = parseInt(target.dataset.change);
                if (cart[index]) {
                    cart[index].quantity += change;
                    if (cart[index].quantity === 0) cart.splice(index, 1);
                }
            }
            saveCart();
            updateCartIcon();
            renderCartPage();
            renderCartPreview();
        });
    };
    
    const attachCheckoutListener = () => {
        const checkoutButton = document.getElementById('checkout-button');
        if (!checkoutButton) return;
        checkoutButton.addEventListener('click', async (event) => {
            event.preventDefault();
            checkoutButton.textContent = 'Attendi...';
            try {
                const response = await fetch('/.netlify/functions/create-checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cart),
                });
                if (!response.ok) throw new Error('Errore dal server');
                const data = await response.json();
                window.location.href = data.url;
            } catch (error) {
                console.error("Errore Checkout:", error);
                checkoutButton.textContent = 'Errore, riprova';
            }
        });
    };

    // --- INIZIALIZZAZIONE DEL SITO ---
    const init = async () => {
        try {
            const response = await fetch('products.json');
            if (!response.ok) throw new Error('Catalogo products.json non trovato.');
            allProducts = await response.json();
            renderShopProducts();
            renderProductDetailPage();
        } catch (error) {
            console.error("Errore critico nel caricamento dei prodotti:", error);
            const shopContainer = document.getElementById('product-list-container');
            if(shopContainer) shopContainer.innerHTML = '<p class="cart-empty-message">Oops! Impossibile caricare i nostri incantesimi. Riprova più tardi.</p>';
        }
        
        renderCartPage();
        attachCartPageListeners();
        attachCheckoutListener();
        updateCartIcon();
        renderCartPreview();
    };

    init();
});