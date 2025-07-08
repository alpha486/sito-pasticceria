document.addEventListener('DOMContentLoaded', () => {

    // --- STATO GLOBALE DELL'APPLICAZIONE (UNITO) ---
    let cart = JSON.parse(localStorage.getItem('shoppingCart')) || [];
    let allProducts = [];
    let config = {}; // Oggetto per contenere la configurazione (da Versione 1)

    // --- FUNZIONI DI BASE (invariate, corrette) ---
    const saveCart = () => {
        localStorage.setItem('shoppingCart', JSON.stringify(cart));
    };
    
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

    // --- NUOVA FUNZIONE PER GESTIRE IL BANNER DI CHIUSURA (da Versione 1) ---
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
            bannerContainer.style.display = 'block'; // Assicurati che il banner sia visibile
        }
    };

    // --- FUNZIONI PER "DISEGNARE" LE PAGINE (invariate, corrette) ---
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

    const renderShopProducts = () => {
        const container = document.getElementById('product-list-container');
        if (!container) return;
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

        let optionsHTML = '';
        if (product.options) {
            optionsHTML = `
                <div class="product-options">
                    <label for="product-option-select">${product.options.label}</label>
                    <select id="product-option-select">
                        <option value="">-- Scegli un'opzione --</option>
                        ${product.options.choices.map(choice => `<option value="${choice}">${choice}</option>`).join('')}
                    </select>
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
                    <a href="#" class="cta-button" data-name="${product.name}" data-price="${product.price}" data-img="${product.image_url}">Aggiungi al Carrello</a>
                </div>
            </div>
        `;
        attachAddToCartListeners();
    };

    // --- FUNZIONE renderCartPage (UNITA) ---
    const renderCartPage = async () => {
        const container = document.getElementById('cart-container');
        if (!container) return;
        if (cart.length === 0) {
            container.innerHTML = '<p class="cart-empty-message">Il tuo carrello è vuoto.</p>';
            return;
        }

        try {
            // Messaggio di caricamento per una migliore UX
            container.innerHTML = '<p class="loading-message">Caricamento informazioni sulla spedizione...</p>';
            
            // Unica chiamata al backend per avere data E costo di spedizione
            const response = await fetch('/.netlify/functions/get-shipping-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cart: cart }) // Invia il carrello per il calcolo
            });
            if (!response.ok) throw new Error('Risposta non valida dal server delle spedizioni');
            const shippingInfo = await response.json();

            const shippingInfoHTML = `
                <div class="shipping-info-box">
                    <p>🚚 Posti rimasti per questa data: <strong>${shippingInfo.postiRimasti}</strong></p>
                    <span>Data di spedizione prevista:</span>
                    <span class="shipping-date">${shippingInfo.dataSpedizione}</span>
                    <p><strong>Stima di consegna:</strong> Entro 2 giorni lavorativi dalla data di spedizione.</p>
                </div>
            `;
            
            const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            
            // Usa il costo di spedizione calcolato dal server (da Versione 1)
            const shippingCost = shippingInfo.shippingCost;
            const shippingDisplay = shippingCost === 0 ? 'Gratuita' : `€ ${shippingCost.toFixed(2)}`;
            const grandTotal = subtotal + shippingCost;
            
            const cartItemsHTML = cart.map((item, index) => `
                <div class="cart-item">
                    <div class="cart-item-image"><img src="${item.img}" alt="${item.name}"></div>
                    <div class="cart-item-details"><h3>${item.name} ${item.option ? `(${item.option})` : ''}</h3><p>Prezzo: € ${item.price.toFixed(2)}</p><button class="remove-item-btn" data-index="${index}">Rimuovi</button></div>
                    <div class="cart-item-quantity"><button class="quantity-btn" data-index="${index}" data-change="-1">-</button><span>${item.quantity}</span><button class="quantity-btn" data-index="${index}" data-change="1">+</button></div>
                    <div class="cart-item-subtotal"><strong>€ ${(item.price * item.quantity).toFixed(2)}</strong></div>
                </div>
            `).join('');

            // Include il campo email obbligatorio (da Versione 2)
            const totalsHTML = `
                <div class="cart-totals">
                    <div class="cart-totals-row"><span>Subtotale:</span><span>€ ${subtotal.toFixed(2)}</span></div>
                    <div class="cart-totals-row"><span>Spedizione:</span><span>${shippingDisplay}</span></div>
                    ${shippingCost === 0 ? '<p class="free-shipping-text">Hai diritto alla spedizione gratuita!</p>' : ''}
                    <div class="cart-totals-row grand-total"><span>TOTALE:</span><span>€ ${grandTotal.toFixed(2)}</span></div>
                    
                    <div class="checkout-email-section">
                        <label for="customer-email">La tua email per completare l'ordine:</label>
                        <input type="email" id="customer-email" placeholder="lamiamail@esempio.com" required>
                    </div>

                    <a href="#" id="checkout-button" class="cta-button">Procedi al Pagamento</a>
                    <p class="cart-totals-note">Potrai inserire eventuali codici sconto nella pagina sicura di pagamento.</p>
                </div>
            `;

            container.innerHTML = shippingInfoHTML + cartItemsHTML + totalsHTML;
            attachCheckoutListener();

        } catch (error) {
            console.error("Errore nel caricare la pagina del carrello:", error);
            container.innerHTML = `<div class="shipping-info-box" style="background-color: #ffcdd2; border-color: #f44336;"><p><strong>Oops!</strong> Non è stato possibile caricare le informazioni sulla spedizione.</p></div>`;
        }
    };

    // --- FUNZIONI PER GLI ASCOLTATORI (unite e corrette) ---
    const attachAddToCartListeners = () => {
        document.querySelectorAll('.cta-button[data-name]').forEach(button => {
            if (button.dataset.listenerAttached) return;
            button.dataset.listenerAttached = 'true';
            
            button.addEventListener('click', event => {
                event.preventDefault();
                
                // 1. Calcoliamo la quantità attuale nel carrello
                const currentTotalBoxes = cart.reduce((sum, item) => sum + item.quantity, 0);

                // 2. Controlliamo se aggiungere un'altra box supera il limite
                if (currentTotalBoxes + 1 > MAX_BOXES_PER_ORDER) {
                    alert(`Spiacenti, non è possibile ordinare più di ${MAX_BOXES_PER_ORDER} box in un singolo ordine.\nPer ordini più grandi, contattaci direttamente!`);
                    return; // Interrompiamo l'esecuzione e non aggiungiamo nulla
                }

                // 3. Se il controllo passa, procediamo con la logica normale
                const { name, price, img } = button.dataset;
                let selectedOption = null;
                const optionSelect = document.getElementById('product-option-select');
                if (optionSelect) {
                    if (!optionSelect.value) {
                        alert('Per favore, seleziona un\'opzione prima di aggiungere al carrello.');
                        return;
                    }
                    selectedOption = optionSelect.value;
                }
                const cartItemId = selectedOption ? `${name}-${selectedOption}` : name;
                const existingProduct = cart.find(item => item.id === cartItemId);
                if (existingProduct) {
                    existingProduct.quantity++;
                } else {
                    const productInfo = allProducts.find(p => p.name === name);
                    cart.push({ id: cartItemId, name: name, price: parseFloat(price), img: img, quantity: 1, option: selectedOption, size: productInfo ? productInfo.size : 'normale' });
                }

                saveCart();
                updateCartIcon();
                renderCartPreview();
                showNotification(`Hai aggiunto: ${name} ${selectedOption ? `(${selectedOption})` : ''}!`);
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
                
                // Se stiamo cercando di aggiungere, applichiamo il controllo del limite
                if (change > 0) {
                    const currentTotalBoxes = cart.reduce((sum, item) => sum + item.quantity, 0);
                    if (currentTotalBoxes + 1 > MAX_BOXES_PER_ORDER) {
                        alert(`Spiacenti, il limite massimo per ordine è di ${MAX_BOXES_PER_ORDER} box.`);
                        return; // Non aggiungere se il limite è superato
                    }
                }

                if (cart[index]) {
                    cart[index].quantity += change;
                    if (cart[index].quantity === 0) {
                        cart.splice(index, 1);
                    }
                }
            }
            saveCart();
            updateCartIcon();
            renderCartPage();
            renderCartPreview();
        });
    };
    
    // Versione finale e robusta dell'ascoltatore di checkout (da Versione 2)
    const attachCheckoutListener = () => {
        const checkoutButton = document.getElementById('checkout-button');
        if (!checkoutButton) return;
        
        if (checkoutButton.dataset.listenerAttached) return;
        checkoutButton.dataset.listenerAttached = 'true';

        checkoutButton.addEventListener('click', async (event) => {
            event.preventDefault();
            
            const emailInput = document.getElementById('customer-email');
            const email = emailInput.value.trim();

            if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
                alert('Per favore, inserisci un indirizzo email valido per continuare.');
                emailInput.focus();
                return;
            }

            checkoutButton.disabled = true;
            checkoutButton.textContent = 'Attendi...';

            try {
                // Il payload è corretto e include sia carrello che email
                const payload = { 
                    cart: cart,
                    customerEmail: email
                };

                const response = await fetch('/.netlify/functions/create-checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Errore dal server durante la creazione del checkout.');
                }

                const data = await response.json();
                window.location.href = data.url;

            } catch (error) {
                console.error("Errore durante il processo di Checkout:", error);
                alert(`Si è verificato un errore: ${error.message}. Riprova.`);
                checkoutButton.disabled = false;
                checkoutButton.textContent = 'Procedi al Pagamento';
            }
        });
    };

    // --- FUNZIONE DI INIZIALIZZAZIONE (UNITA E MIGLIORATA) ---
    const init = async () => {
        try {
            // Caricamento in parallelo per massima efficienza (da Versione 1)
            const [productResponse, configResponse] = await Promise.all([
                fetch('products.json'),
                fetch('config.json')
            ]);

            if (!productResponse.ok) throw new Error('Catalogo prodotti non trovato.');
            if (!configResponse.ok) throw new Error('File di configurazione non trovato.');
            
            allProducts = await productResponse.json();
            config = await configResponse.json();

            // Una volta caricata la configurazione, gestiamo il banner
            handleClosureBanner();

        } catch (error) {
            console.error("Errore critico nel caricamento dei dati:", error);
            document.body.innerHTML = '<p style="text-align: center; padding: 2rem;">Oops! C\'è stato un problema nel caricare il sito. Riprova più tardi.</p>';
            return; // Interrompe l'esecuzione se i dati critici non vengono caricati
        }
        
        // Esegui il resto delle funzioni solo se i dati sono stati caricati
        renderShopProducts();
        renderProductDetailPage();
        renderCartPage();
        attachCartPageListeners();
        updateCartIcon();
        renderCartPreview();
    };

    // Avvia tutto
    init();
});