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

    const renderCartPage = async () => {
        const container = document.getElementById('cart-container');
        if (!container) return;

        if (cart.length === 0) {
            container.innerHTML = '<p class="cart-empty-message">Il tuo carrello è vuoto.</p>';
            return;
        }

        // Il blocco try...catch ora gestisce l'errore in modo più granulare
        try {
            // Mostra un messaggio di caricamento iniziale
            container.innerHTML = '<p class="loading-message">Caricamento informazioni sulla spedizione...</p>';

            // Chiama la funzione per avere i dati di spedizione
            const response = await fetch('/.netlify/functions/get-shipping-info');
            if (!response.ok) throw new Error('Risposta non valida dal server delle spedizioni');
            const shippingInfo = await response.json();

            // Costruisce l'HTML del box informativo con i dati dal server
            const shippingInfoHTML = `
                <div class="shipping-info-box">
                    <p>🚚 Posti rimasti per questa data: <strong>${shippingInfo.postiRimasti}</strong></p>
                    <span>Data di spedizione prevista:</span>
                    <span class="shipping-date">${shippingInfo.dataSpedizione}</span>
                    <p><strong>Stima di consegna:</strong> Entro 2 giorni lavorativi dalla data di spedizione.</p>
                </div>
            `;
            
            // Calcolo totali (logica invariata)
            let subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const SHIPPING_FEE = 9.90;
            let shippingCost = SHIPPING_FEE;
            
            let totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
            let largeBoxQuantity = cart.filter(item => {
                const p = allProducts.find(prod => prod.name === item.name);
                return p && p.size === 'grande';
            }).reduce((sum, item) => sum + item.quantity, 0);
            
            let shippingDisplay = `€ ${SHIPPING_FEE.toFixed(2)}`;
            if (largeBoxQuantity >= 2 || totalQuantity >= 3) {
                shippingCost = 0;
                shippingDisplay = `Gratuita!`;
            }
            let grandTotal = subtotal + shippingCost;
            
            // Disegniamo l'intera pagina del carrello
            container.innerHTML = 
                shippingInfoHTML + 
                
                cart.map((item, index) => `
                    <div class="cart-item">
                        <div class="cart-item-image"><img src="${item.img}" alt="${item.name}"></div>
                        <div class="cart-item-details"><h3>${item.name}</h3><p>Prezzo: € ${item.price.toFixed(2)}</p><button class="remove-item-btn" data-index="${index}">Rimuovi</button></div>
                        <div class="cart-item-quantity"><button class="quantity-btn" data-index="${index}" data-change="-1">-</button><span>${item.quantity}</span><button class="quantity-btn" data-index="${index}" data-change="1">+</button></div>
                        <div class="cart-item-subtotal"><strong>€ ${(item.price * item.quantity).toFixed(2)}</strong></div>
                    </div>
                `).join('') + 
                
                `<div class="cart-totals">
                    <div class="cart-totals-row"><span>Subtotale:</span><span>€ ${subtotal.toFixed(2)}</span></div>
                    <div class="cart-totals-row"><span>Spedizione:</span><span>${shippingDisplay}</span></div>
                    ${shippingCost === 0 ? '<p class="free-shipping-text">Hai diritto alla spedizione gratuita!</p>' : ''}
                    <div class="cart-totals-row grand-total"><span>TOTALE:</span><span>€ ${grandTotal.toFixed(2)}</span></div>
                    <a href="#" id="checkout-button" class="cta-button">Procedi al Pagamento</a>
                </div>`;
            
            // MODIFICA CHIAVE: L'ascoltatore viene attivato DOPO che il bottone è stato disegnato
            attachCheckoutListener();

        } catch (error) {
            console.error("Errore nel caricare le info di spedizione:", error);
            // Il nuovo blocco di gestione errore, più specifico
            const errorHTML = `<div class="shipping-info-box" style="background-color: #ffcdd2; border-color: #f44336;">
                                <p><strong>Oops!</strong> Siamo spiacenti, non è stato possibile caricare le informazioni sulla spedizione.</p>
                                <p>Potrebbe essere un problema temporaneo. Per favore, prova a ricaricare la pagina.</p>
                             </div>`;
            // Mostra il messaggio di errore ma preserva il resto del carrello se già renderizzato (improbabile, ma è la logica del nuovo codice)
            container.innerHTML = errorHTML + (container.innerHTML || '');
        }
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
            // Richiama renderCartPage per ricalcolare totali e spedizione
            renderCartPage(); 
            renderCartPreview();
        });
    };
    
    // NUOVA FUNZIONE PER ATTIVARE IL BOTTONE DI CHECKOUT (più robusta e con debug)
    const attachCheckoutListener = () => {
        const checkoutButton = document.getElementById('checkout-button');
        if (!checkoutButton) {
            console.log("Debug: Bottone di checkout non trovato.");
            return;
        }

        // Aggiunge l'ascoltatore per il click
        checkoutButton.addEventListener('click', async (event) => {
            event.preventDefault();
            console.log("Debug: Bottone di checkout cliccato.");
            checkoutButton.textContent = 'Attendi...';
            try {
                const response = await fetch('/.netlify/functions/create-checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cart),
                });
                if (!response.ok) {
                    throw new Error(`Errore dal server: ${response.statusText}`);
                }
                const data = await response.json();
                console.log("Debug: Ricevuto URL da Stripe, reindirizzamento...");
                window.location.href = data.url;
            } catch (error) {
                console.error("Errore durante il checkout:", error);
                checkoutButton.textContent = 'Errore, riprova';
            }
        });
    };

    // --- INIZIALIZZAZIONE DEL SITO ---
    const init = async () => {
        try {
            // Usa il blocco try/catch più robusto del vecchio codice per il caricamento prodotti
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
        
        // NUOVO ORDINE DI INIZIALIZZAZIONE:
        // attachCheckoutListener non è più qui, viene chiamato da renderCartPage
        renderCartPage();
        attachCartPageListeners();
        updateCartIcon();
        renderCartPreview();
    };

    init();
});