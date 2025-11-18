document.addEventListener('DOMContentLoaded', () => {

    // --- STATO GLOBALE DELL'APPLICAZIONE ---
    let cart = JSON.parse(localStorage.getItem('shoppingCart')) || [];
    let allProducts = [];
    let config = {}; // Oggetto che conterrà la configurazione (es. ferie)
    const MAX_BOXES_PER_ORDER = 25; // Limite massimo di box per ordine
    
    // NUOVA VARIABILE: Memorizza i dati di spedizione per il controllo al checkout
    let shippingInfoState = null; 

    // --- FUNZIONI DI BASE (salvataggio, icone, notifiche) ---
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

    // --- FUNZIONE PER GESTIRE IL BANNER DI CHIUSURA ---
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

    // --- FUNZIONI PER "DISEGNARE" LE PAGINE ---

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

    // Funzione per mostrare i prodotti della pagina SHOP
const renderShopProducts = () => {
    const container = document.getElementById('product-list-container');
    if (!container) return;

    // FILTRO CHIAVE: Mostra SOLO i prodotti che NON hanno categoria 'natale'
    const regularProducts = allProducts.filter(p => p.category !== 'natale');
    
    container.innerHTML = regularProducts.map(p => `
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

// NUOVA Funzione per mostrare i prodotti della pagina NATALE
const renderChristmasProducts = () => {
    const container = document.getElementById('christmas-product-list-container');
    if (!container) return;

    // FILTRO CHIAVE: Mostra SOLO i prodotti che hanno categoria 'natale'
    const christmasProducts = allProducts.filter(p => p.category === 'natale');

    if (christmasProducts.length === 0) {
        container.innerHTML = '<p>Nessun prodotto natalizio trovato al momento.</p>';
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
            container.innerHTML = `
        <div class="product-detail-content">
            <div class="product-detail-image"><img src="${product.image_url}" alt="${product.name}"></div>
            <div class="product-detail-info">
                <h2>${product.name}</h2>
                <div class="price">€ ${product.price.toFixed(2)}</div>
                
                <p class="free-shipping-hint">✨ Aggiungi un'altra box e la spedizione è gratis!</p>
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
    
    const attachFlavorSelectorListeners = (maxQuantity) => {
        const customizer = document.querySelector('.cookie-customizer-container');
        if (!customizer) return;

        const plusButtons = customizer.querySelectorAll('.plus');
        const minusButtons = customizer.querySelectorAll('.minus');
        const countDisplay = document.getElementById('current-selection-count');
        
        let totalCount = 0;

        const updateTotal = () => {
            totalCount = 0;
            customizer.querySelectorAll('.quantity-count').forEach(el => {
                totalCount += parseInt(el.textContent);
            });
            countDisplay.textContent = totalCount;

            // Abilita/Disabilita i pulsanti "+" se il totale è raggiunto
            plusButtons.forEach(btn => {
                btn.disabled = totalCount >= maxQuantity;
            });

            // Abilita/Disabilita i pulsanti "-"
            minusButtons.forEach(btn => {
                const currentCount = parseInt(btn.nextElementSibling.textContent);
                btn.disabled = currentCount === 0;
            });
        };

        plusButtons.forEach(button => {
            button.addEventListener('click', () => {
                if (totalCount < maxQuantity) {
                    const countEl = button.previousElementSibling;
                    countEl.textContent = parseInt(countEl.textContent) + 1;
                    updateTotal();
                }
            });
        });

        minusButtons.forEach(button => {
            button.addEventListener('click', () => {
                const countEl = button.nextElementSibling;
                const currentVal = parseInt(countEl.textContent);
                if (currentVal > 0) {
                    countEl.textContent = currentVal - 1;
                    updateTotal();
                }
            });
        });

        updateTotal(); // Inizializza lo stato dei pulsanti
    };


    // MODIFICATA: Ora memorizza anche i dati di spedizione
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
            if (!response.ok) throw new Error('Risposta non valida dal server delle spedizioni');
            
            const shippingInfo = await response.json();
            
            // --- MODIFICA CHIAVE ---
            // Salviamo i dati ricevuti nello stato globale per usarli al checkout
            shippingInfoState = shippingInfo; 

            const shippingInfoHTML = `
                <div class="shipping-info-box">
                    <p>🚚 Posti rimasti per questa data: <strong>${shippingInfo.postiRimasti}</strong></p>
                    <span>Data di spedizione prevista:</span>
                    <span class="shipping-date">${shippingInfo.dataSpedizione}</span>
                    <p><strong>Stima di consegna:</strong> Entro 2 giorni lavorativi dalla data di spedizione.</p>
                </div>
            `;
            
            const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            
            const shippingCost = shippingInfo.shippingCost;
            const shippingDisplay = shippingCost === 0 ? 'Gratuita!' : `€ ${shippingCost.toFixed(2)}`;
            const grandTotal = subtotal + shippingCost;
            
            const cartItemsHTML = cart.map((item, index) => `
                <div class="cart-item">
                    <div class="cart-item-image"><img src="${item.img}" alt="${item.name}"></div>
                    <div class="cart-item-details"><h3>${item.name} ${item.option ? `(${item.option})` : ''}</h3><p>Prezzo: € ${item.price.toFixed(2)}</p><button class="remove-item-btn" data-index="${index}">Rimuovi</button></div>
                    <div class="cart-item-quantity"><button class="quantity-btn" data-index="${index}" data-change="-1">-</button><span>${item.quantity}</span><button class="quantity-btn" data-index="${index}" data-change="1">+</button></div>
                    <div class="cart-item-subtotal"><strong>€ ${(item.price * item.quantity).toFixed(2)}</strong></div>
                </div>
            `).join('');

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
            shippingInfoState = null; // Resettiamo lo stato in caso di errore
            container.innerHTML = `<div class="shipping-info-box" style="background-color: #ffcdd2; border-color: #f44336;"><p><strong>Oops!</strong> Non è stato possibile caricare le informazioni sulla spedizione.</p></div>`;
        }
    };

    // --- FUNZIONI PER GLI ASCOLTATORI ---
    const attachAddToCartListeners = () => {
        document.querySelectorAll('.cta-button[data-name]').forEach(button => {
            if (button.dataset.listenerAttached) return;
            button.dataset.listenerAttached = 'true';
            
            button.addEventListener('click', event => {
                event.preventDefault();
                
                const currentTotalBoxes = cart.reduce((sum, item) => sum + item.quantity, 0);
                if (currentTotalBoxes >= MAX_BOXES_PER_ORDER) {
                    alert(`Spiacenti, non è possibile ordinare più di ${MAX_BOXES_PER_ORDER} box in un singolo ordine.\nPer ordini più grandi, contattaci direttamente!`);
                    return;
                }

                const productId = parseInt(button.dataset.productId);
                const productInfo = allProducts.find(p => p.id === productId);
                if (!productInfo) return;

                const { name, price, img } = button.dataset;
                let selectedOption = null;
                let cartItemId = name;

                if (productInfo.options) {
                    const optionSelect = document.getElementById('product-option-select');
                    if (!optionSelect.value) {
                        alert('Per favore, seleziona un\'opzione prima di aggiungere al carrello.');
                        return;
                    }
                    selectedOption = optionSelect.value;
                    cartItemId = `${name}-${selectedOption}`;

                } else if (productInfo.customizable_options) {
                    const { quantity } = productInfo.customizable_options;
                    const flavorItems = document.querySelectorAll('.flavor-item');
                    const selectedFlavors = [];
                    let totalSelected = 0;

                    flavorItems.forEach(item => {
                        const flavorName = item.dataset.flavor;
                        const count = parseInt(item.querySelector('.quantity-count').textContent);
                        if (count > 0) {
                            selectedFlavors.push(`${count}x ${flavorName}`);
                        }
                        totalSelected += count;
                    });
                    
                    if (totalSelected !== quantity) {
                        alert(`Devi selezionare esattamente ${quantity} cookie per completare la box. Ne hai selezionati ${totalSelected}.`);
                        return;
                    }

                    selectedOption = selectedFlavors.join(', ');
                    cartItemId = `${name}-${selectedOption}`; // Crea un ID univoco per questa combinazione
                }

                const existingProduct = cart.find(item => item.id === cartItemId);
                if (existingProduct) {
                    existingProduct.quantity++;
                } else {
                    cart.push({ id: cartItemId, name: name, price: parseFloat(price), img: img, quantity: 1, option: selectedOption, size: productInfo.size || 'normale' });
                }

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
                
                if (change > 0) {
                    const currentTotalBoxes = cart.reduce((sum, item) => sum + item.quantity, 0);
                    if (currentTotalBoxes >= MAX_BOXES_PER_ORDER) {
                        alert(`Spiacenti, il limite massimo per ordine è di ${MAX_BOXES_PER_ORDER} box.`);
                        return;
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
    
    // MODIFICATA: Ora include il controllo di sicurezza ("guardia del corpo")
    const attachCheckoutListener = () => {
        const checkoutButton = document.getElementById('checkout-button');
        if (!checkoutButton) return;
        
        if (checkoutButton.dataset.listenerAttached) return;
        checkoutButton.dataset.listenerAttached = 'true';

        checkoutButton.addEventListener('click', async (event) => {
            event.preventDefault();
            
            // --- INSERIMENTO DELLA LOGICA DAL PRIMO CODICE ---
            // 1. Calcoliamo la quantità totale di box nel carrello
            const cartTotalBoxes = cart.reduce((sum, item) => sum + item.quantity, 0);

            // 2. LA "GUARDIA DEL CORPO": controlla la disponibilità
            // Controlla se abbiamo le info sui posti rimasti e se la quantità nel carrello è maggiore
            if (shippingInfoState && cartTotalBoxes > shippingInfoState.postiRimasti) {
                alert(`Spiacenti, stai cercando di ordinare ${cartTotalBoxes} box, ma per la prossima data di spedizione ne sono rimaste solo ${shippingInfoState.postiRimasti}.\nPer favore, riduci la quantità nel carrello.`);
                return; // BLOCCHIAMO IL PROCESSO DI CHECKOUT
            }
            // --- FINE INSERIMENTO ---

            // 3. Se il controllo passa, procediamo con la validazione dell'email e il pagamento
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

    // --- FUNZIONE DI INIZIALIZZAZIONE ---
    const init = async () => {
        try {
            const [productResponse, configResponse] = await Promise.all([
                fetch('products.json'),
                fetch('config.json')
            ]);

            if (!productResponse.ok) throw new Error('Catalogo prodotti non trovato.');
            if (!configResponse.ok) throw new Error('File di configurazione non trovato.');
            
            allProducts = await productResponse.json();
            config = await configResponse.json();

            // Una volta caricati i dati, esegui il resto
            handleClosureBanner(); // Gestisce il banner ferie
            renderShopProducts();
            renderChristmasProducts();
            renderProductDetailPage();
            renderCartPage(); // Ora carica anche i dati di spedizione
            attachCartPageListeners();
            updateCartIcon();
            renderCartPreview();

        } catch (error) {
            console.error("Errore critico nell'inizializzazione:", error);
            document.body.innerHTML = '<p style="text-align: center; padding: 2rem;">Oops! C\'è stato un problema nel caricare il sito. Riprova più tardi.</p>';
        }
    };

    // Avvia l'intera applicazione.
    init();
});
