document.addEventListener('DOMContentLoaded', () => {

    // --- STATO GLOBALE DELL'APPLICAZIONE ---
    let cart = JSON.parse(localStorage.getItem('shoppingCart')) || [];
    let allProducts = [];
    let config = {}; 
    const MAX_BOXES_PER_ORDER = 25;
    let shippingInfoState = null; 

    // --- FUNZIONI DI BASE ---
    const saveCart = () => {
        localStorage.setItem('shoppingCart', JSON.stringify(cart));
    };
    
    const updateCartIcon = () => {
        const cartCountElement = document.getElementById('cart-count');
        if (cartCountElement) {
            const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 0), 0);
            cartCountElement.textContent = totalItems;
        }
    };
    
    const showNotification = (message) => {
        const notificationElement = document.getElementById('notification');
        if (notificationElement) {
            clearTimeout(window.notificationTimeout);
            notificationElement.textContent = message;
            notificationElement.classList.add('show');
            window.notificationTimeout = setTimeout(() => {
                notificationElement.classList.remove('show');
            }, 3000);
        }
    };

    // --- GESTIONE BANNER CHIUSURA ---
    const handleClosureBanner = () => {
        const bannerContainer = document.getElementById('closure-banner-container');
        if (!bannerContainer || !config.chiusura || !config.chiusura.start || !config.chiusura.end) return;

        const oggi = new Date();
        const inizioChiusura = new Date(config.chiusura.start + "T00:00:00");
        const fineChiusura = new Date(config.chiusura.end + "T23:59:59");

        if (oggi >= inizioChiusura && oggi <= fineChiusura) {
            bannerContainer.innerHTML = `
                <div class="closure-banner">
                    Attenzione: Siamo chiusi per ferie! Gli ordini ricevuti verranno spediti dopo il ${new Date(config.chiusura.end).toLocaleDateString('it-IT', {day: 'numeric', month: 'long'})}.
                </div>
            `;
        }
    };

    // --- RENDERING PAGINE ---

    const renderCartPreview = () => {
        const cartPreviewContainer = document.getElementById('cart-preview-content');
        if (!cartPreviewContainer) return;

        if (cart.length === 0) {
            cartPreviewContainer.innerHTML = '<p class="cart-empty-message">Il tuo carrello è vuoto.</p>';
            return;
        }
        
        cartPreviewContainer.innerHTML = cart.map(item => `
            <div class="preview-item">
                <div class="preview-item-image"><img src="${item.img}" alt="${item.name}"></div>
                <div class="preview-item-details">
                    <h4>${item.name} ${item.option ? `(${item.option})` : ''}</h4>
                    <p>Quantità: ${item.quantity}</p>
                </div>
                <div class="preview-item-price">
                    <strong>€ ${(item.price * item.quantity).toFixed(2)}</strong>
                </div>
            </div>
        `).join('');
    };

    // 1. FUNZIONE SHOP (Mostra tutto TRANNE Natale)
    const renderShopProducts = () => {
        const container = document.getElementById('product-list-container');
        if (!container) return;

        // FILTRO: Escludi i prodotti con categoria 'natale'
        const shopProducts = allProducts.filter(p => p.category !== 'natale');

        container.innerHTML = shopProducts.map(p => `
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

    // 2. FUNZIONE NATALE (Mostra SOLO Natale)
    const renderChristmasProducts = () => {
        const container = document.getElementById('christmas-product-list-container');
        if (!container) return; // Se non siamo nella pagina natale, non fare nulla

        // FILTRO: Includi SOLO i prodotti con categoria 'natale'
        const christmasProducts = allProducts.filter(p => p.category === 'natale');

        if (christmasProducts.length === 0) {
            container.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Nessun prodotto natalizio trovato. Controlla il file products.json!</p>';
            console.warn("Attenzione: Nessun prodotto con 'category': 'natale' trovato nel JSON.");
            return;
        }

        container.innerHTML = christmasProducts.map(p => `
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
            container.innerHTML = '<p>Prodotto non trovato.</p>';
            return;
        }

        document.title = `${product.name} - Incantesimi di Zucchero`;

        let optionsHTML = '';
        
        // --- MODIFICA PER CASELLE MULTIPLE (CORRETTO) ---
        if (product.custom_text_inputs) {
            const inputsHTML = product.custom_text_inputs.map((label) => `
                <div style="margin-bottom: 10px;">
                    <label style="display:block; font-size:0.9rem; margin-bottom:2px; font-weight:bold;">${label}</label>
                    <input type="text" class="product-custom-text-multi" data-label="${label}" placeholder="Scrivi nome..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                </div>
            `).join('');

            optionsHTML = `
                <div class="product-options" id="custom-inputs-container" style="background: #f9f9f9; padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                    <strong style="display:block; margin-bottom:10px; color: #c0392b;">Personalizza qui:</strong>
                    ${inputsHTML}
                </div>
            `;
        }
        else if (product.options) {
            optionsHTML = `
                <div class="product-options">
                    <label for="product-option-select">${product.options.label}</label>
                    <select id="product-option-select">
                        <option value="">-- Scegli un'opzione --</option>
                        ${product.options.choices.map(choice => `<option value="${choice}">${choice}</option>`).join('')}
                    </select>
                </div>
            `;
        } else if (product.customizable_options) {
            const { quantity, label, choices } = product.customizable_options;
            const flavorsHTML = choices.map(flavor => `
                <div class="flavor-item" data-flavor="${flavor}">
                    <span class="flavor-name">${flavor}</span>
                    <div class="quantity-controls">
                        <button class="quantity-btn-selector minus" disabled>-</button>
                        <span class="quantity-count">0</span>
                        <button class="quantity-btn-selector plus">+</button>
                    </div>
                </div>
            `).join('');

            optionsHTML = `
                <div class="cookie-customizer-container">
                    <label class="customizer-label">${label}</label>
                    <div class="selection-counter">
                        <span>Selezionati:</span>
                        <span id="current-selection-count">0</span> / ${quantity}
                    </div>
                    <div class="flavor-grid-container">
                        ${flavorsHTML}
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="product-detail-content">
                <div class="product-detail-image"><img src="${product.image_url}" alt="${product.name}"></div>
                <div class="product-detail-info">
                    <h2>${product.name}</h2>
                    <div class="price">€ ${product.price.toFixed(2)}</div>
                    ${product.size === 'grande' ? `<p class="free-shipping-hint">✨ Aggiungi un'altra box grande e la spedizione è gratis!</p>` : ''}
                    <p>${product.description}</p>
                    ${optionsHTML}
                    <div class="product-allergens-detail">
                        <strong>Allergeni Presenti:</strong>
                        <p>${product.allergens.join(', ')}</p>
                    </div>
                    <a href="#" class="cta-button" data-product-id="${product.id}" data-name="${product.name}" data-price="${product.price}" data-img="${product.image_url}">Aggiungi al Carrello</a>
                </div>
            </div>
        `;

        if (product.customizable_options) {
            attachFlavorSelectorListeners(product.customizable_options.quantity);
        }
        attachAddToCartListeners();
    };
    
    // Funzioni helper per la pagina dettaglio (selector e add to cart) rimangono invariate o quasi
    const attachFlavorSelectorListeners = (maxQuantity) => {
        const customizer = document.querySelector('.cookie-customizer-container');
        if (!customizer) return;
        const plusButtons = customizer.querySelectorAll('.plus');
        const minusButtons = customizer.querySelectorAll('.minus');
        const countDisplay = document.getElementById('current-selection-count');
        let totalCount = 0;

        const updateTotal = () => {
            totalCount = 0;
            customizer.querySelectorAll('.quantity-count').forEach(el => totalCount += parseInt(el.textContent));
            countDisplay.textContent = totalCount;
            plusButtons.forEach(btn => btn.disabled = totalCount >= maxQuantity);
            minusButtons.forEach(btn => btn.disabled = parseInt(btn.nextElementSibling.textContent) === 0);
        };
        plusButtons.forEach(button => button.addEventListener('click', () => { if (totalCount < maxQuantity) { button.previousElementSibling.textContent++; updateTotal(); } }));
        minusButtons.forEach(button => button.addEventListener('click', () => { const el = button.nextElementSibling; if (parseInt(el.textContent) > 0) { el.textContent--; updateTotal(); } }));
        updateTotal(); 
    };

    // --- CARRELLO E CHECKOUT ---
    // --- CARRELLO E CHECKOUT (MODIFICATA PER BLACK FRIDAY) ---
    const renderCartPage = async () => {
        const container = document.getElementById('cart-container');
        if (!container) return;
        
        if (cart.length === 0) {
            container.innerHTML = '<p class="cart-empty-message">Il tuo carrello è vuoto.</p>';
            return;
        }

        try {
            container.innerHTML = '<p class="loading-message">Caricamento informazioni sulla spedizione...</p>';
            const response = await fetch('/.netlify/functions/get-shipping-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cart: cart })
            });
            if (!response.ok) throw new Error('Errore server spedizioni');
            const shippingInfo = await response.json();
            shippingInfoState = shippingInfo; 

            // --- LOGICA PROMOZIONI BLACK FRIDAY (AGGIORNATA) ---
            const now = new Date();
            const currentYear = now.getFullYear();
            const promoStart = new Date(currentYear, 10, 24); 
            const promoEnd = new Date(currentYear, 10, 30, 23, 59, 59);
            const isPromoPeriod = now >= promoStart && now <= promoEnd;

            const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
            
            // Logica Base
            let shippingCost = shippingInfo.shippingCost; // Prende il costo standard dal server
            let discountAmount = 0;
            let promoMessage = "";

            if (isPromoPeriod) {
                if (totalQuantity === 1) {
                    // CASO 1: Solo 1 box -> Spedizione Gratis, Niente Sconto
                    shippingCost = 0;
                    promoMessage = `<div style="color: #27ae60; font-weight: bold; margin-bottom: 10px;">
                        🎉 BLACK FRIDAY: Spedizione Gratuita attiva su questa Box!
                    </div>`;
                } else if (totalQuantity >= 2) {
                    // CASO 2: 2 o più box -> Sconto 25%, Spedizione STANDARD (si paga)
                    // shippingCost rimane quello standard caricato sopra
                    discountAmount = subtotal * 0.25;
                    promoMessage = `<div style="color: #e67e22; font-weight: bold; margin-bottom: 10px;">
                        🔥 BLACK FRIDAY: Sconto del 25% applicato! (Spedizione standard)
                    </div>`;
                }
            }
            // --- FINE LOGICA PROMO ---

            const grandTotal = subtotal - discountAmount + shippingCost;
            
            const html = `
                <div class="shipping-info-box">
                    <p>🚚 Posti rimasti: <strong>${shippingInfo.postiRimasti}</strong></p>
                    <span>Spedizione prevista: </span><span class="shipping-date">${shippingInfo.dataSpedizione}</span>
                </div>
                
                ${promoMessage}

                ${cart.map((item, i) => `
                    <div class="cart-item">
                        <div class="cart-item-image"><img src="${item.img}" alt="${item.name}"></div>
                        <div class="cart-item-details">
                            <h3>${item.name} ${item.option ? `(${item.option})` : ''}</h3>
                            <p>€ ${item.price.toFixed(2)}</p>
                            <button class="remove-item-btn" data-index="${i}">Rimuovi</button>
                        </div>
                        <div class="cart-item-quantity">
                            <button class="quantity-btn" data-index="${i}" data-change="-1">-</button>
                            <span>${item.quantity}</span>
                            <button class="quantity-btn" data-index="${i}" data-change="1">+</button>
                        </div>
                        <div class="cart-item-subtotal"><strong>€ ${(item.price * item.quantity).toFixed(2)}</strong></div>
                    </div>
                `).join('')}
                
                <div class="cart-totals">
                    <div class="cart-totals-row"><span>Subtotale:</span><span>€ ${subtotal.toFixed(2)}</span></div>
                    
                    ${discountAmount > 0 ? `
                    <div class="cart-totals-row" style="color: #c0392b;">
                        <span>Sconto Black Friday (25%):</span>
                        <span>- € ${discountAmount.toFixed(2)}</span>
                    </div>` : ''}

                    <div class="cart-totals-row">
                        <span>Spedizione:</span>
                        <span>${shippingCost === 0 ? '<strong style="color:#27ae60">GRATIS</strong>' : `€ ${shippingCost.toFixed(2)}`}</span>
                    </div>
                    
                    <div class="cart-totals-row grand-total"><span>TOTALE:</span><span>€ ${grandTotal.toFixed(2)}</span></div>
                    <div class="checkout-email-section">
                        <label>Email:</label><input type="email" id="customer-email" required>
                    </div>
                    <a href="#" id="checkout-button" class="cta-button">Procedi al Pagamento</a>
                </div>
            `;
            container.innerHTML = html;
            attachCheckoutListener();
        } catch (error) {
            console.error(error);
            container.innerHTML = `<p>Errore caricamento carrello. Riprova.</p>`;
        }
    };

    const attachAddToCartListeners = () => {
        document.querySelectorAll('.cta-button[data-name]').forEach(button => {
            button.addEventListener('click', event => {
                event.preventDefault();
                const currentTotal = cart.reduce((sum, item) => sum + item.quantity, 0);
                if (currentTotal >= MAX_BOXES_PER_ORDER) { alert(`Massimo ${MAX_BOXES_PER_ORDER} box per ordine.`); return; }

                const productId = parseInt(button.dataset.productId);
                const pInfo = allProducts.find(p => p.id === productId);
                if (!pInfo) return;

                let selectedOption = null;
                let cartItemId = pInfo.name;
                // --- INIZIO MODIFICA: SALVATAGGIO MULTIPLO ---
                if (pInfo.custom_text_inputs) {
                    const inputFields = document.querySelectorAll('.product-custom-text-multi');
                    let collectedNames = [];
                    let allFilled = true;

                    // Raccogliamo i dati da tutte le caselle
                    inputFields.forEach(input => {
                        const val = input.value.trim();
                        if (!val) allFilled = false;
                        collectedNames.push(`${input.dataset.label}: ${val}`);
                    });
                    
                    if (!allFilled) {
                        alert('Per favore, compila tutti i nomi richiesti.');
                        return; // Blocca se manca anche solo un nome
                    }
                    
                    // Uniamo tutto in una stringa lunga per Stripe
                    // Esempio risultato: "Nome 1: Giulia, Nome 2: Marco, ..."
                    selectedOption = collectedNames.join(', ');
                    
                    // Creiamo un ID univoco per il carrello
                    cartItemId += `-${selectedOption.replace(/\s+/g, '').substring(0, 20)}`; 
                }
                else if (pInfo.options) {
                    const sel = document.getElementById('product-option-select');
                    if (!sel.value) { alert('Seleziona un\'opzione.'); return; }
                    selectedOption = sel.value;
                    cartItemId += `-${selectedOption}`;
                } else if (pInfo.customizable_options) {
                    // Logica custom cookies semplificata per brevità, assicurati di mantenerla se serve
                     const flavorItems = document.querySelectorAll('.flavor-item');
                     let totalSel = 0;
                     let selFlavs = [];
                     flavorItems.forEach(item => {
                         const c = parseInt(item.querySelector('.quantity-count').textContent);
                         if(c>0) selFlavs.push(`${c}x ${item.dataset.flavor}`);
                         totalSel += c;
                     });
                     if(totalSel !== pInfo.customizable_options.quantity) { alert(`Seleziona esattamente ${pInfo.customizable_options.quantity} gusti.`); return; }
                     selectedOption = selFlavs.join(', ');
                     cartItemId += `-${selectedOption}`;
                }

                const existing = cart.find(item => item.id === cartItemId);
                if (existing) existing.quantity++;
                else cart.push({ id: cartItemId, name: pInfo.name, price: pInfo.price, img: pInfo.image_url, quantity: 1, option: selectedOption, size: pInfo.size || 'normale' });

                saveCart();
                updateCartIcon();
                renderCartPreview();
                showNotification(`Aggiunto: ${pInfo.name}`);
            });
        });
    };

    const attachCartPageListeners = () => {
        const container = document.getElementById('cart-container');
        if (!container) return;
        container.addEventListener('click', e => {
            const t = e.target;
            const idx = t.dataset.index;
            if (!idx) return;
            
            if (t.matches('.remove-item-btn')) cart.splice(idx, 1);
            if (t.matches('.quantity-btn')) {
                const change = parseInt(t.dataset.change);
                const newTotal = cart.reduce((s, i) => s + i.quantity, 0) + change;
                if (change > 0 && newTotal > MAX_BOXES_PER_ORDER) { alert('Limite raggiunto.'); return; }
                cart[idx].quantity += change;
                if (cart[idx].quantity <= 0) cart.splice(idx, 1);
            }
            saveCart();
            renderCartPage();
            updateCartIcon();
            renderCartPreview();
        });
    };

    const attachCheckoutListener = () => {
        const btn = document.getElementById('checkout-button');
        if (!btn) return;
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const cartTotal = cart.reduce((s, i) => s + i.quantity, 0);
            if (shippingInfoState && cartTotal > shippingInfoState.postiRimasti) {
                alert(`Rimasti solo ${shippingInfoState.postiRimasti} posti.`); return;
            }
            const email = document.getElementById('customer-email').value.trim();
            if (!email || !/^\S+@\S+\.\S+$/.test(email)) { alert('Email non valida.'); return; }
            
            btn.textContent = 'Attendi...';
            try {
                const res = await fetch('/.netlify/functions/create-checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cart, customerEmail: email })
                });
                const data = await res.json();
                // Se c'è un dettaglio dell'errore, mostriamo quello, altrimenti l'errore generico
                if (!res.ok) throw new Error(data.details || data.error);
                window.location.href = data.url;
            } catch (err) {
                console.error(err);
                alert('Errore checkout: ' + err.message);
                btn.textContent = 'Procedi al Pagamento';
            }
        });
    };

    // --- INIT ---
    const init = async () => {
        try {
            const [prodRes, confRes] = await Promise.all([fetch('products.json'), fetch('config.json')]);
            if (!prodRes.ok) throw new Error('Prodotti non trovati');
            
            allProducts = await prodRes.json();
            if (confRes.ok) config = await confRes.json();

            console.log("Prodotti caricati:", allProducts); // DEBUG: Guarda la console del browser

            handleClosureBanner();
            renderShopProducts();       // Carica i prodotti standard
            renderChristmasProducts();  // Carica i prodotti di Natale
            renderProductDetailPage();
            renderCartPage();
            attachCartPageListeners();
            updateCartIcon();
            renderCartPreview();

        } catch (error) {
            console.error("Errore Init:", error);
        }
    };

    init();
});
