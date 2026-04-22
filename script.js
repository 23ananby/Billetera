// ==========================================
// ESTADO GLOBAL (INICIA EN CERO)
// ==========================================
let state = {
    mainBalanceGTQ: 0.00,
    exchangeRateUSD: 0.128,
    activeCardId: null,
    visualOrder:[],
    cards:[], 
    selectedCardForOptions: null,
    pendingTransfer: null // Guarda datos de la transferencia cuando falta capital
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    await fetchExchangeRate();
    updateMainBalanceUI();
    renderCards();
    renderHistory();
    setupEventListeners();
});

async function fetchExchangeRate() {
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/GTQ');
        const data = await res.json();
        if(data && data.rates && data.rates.USD) state.exchangeRateUSD = data.rates.USD;
    } catch (error) { console.warn("API de divisas falló."); }
}

function formatGTQ(amount) { return 'Q ' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatUSD(amount) { return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD'; }

// Formato de hora perfeccionado (Ej: "22 Abr, 18:39")
function getFormattedDate() {
    const dateObj = new Date();
    const day = dateObj.getDate();
    const month = new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(dateObj);
    const time = dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${day} ${month.charAt(0).toUpperCase() + month.slice(1)}, ${time}`;
}

function updateMainBalanceUI() {
    const elGtq = document.getElementById('main-balance-gtq');
    const elUsd = document.getElementById('main-balance-usd');
    if(elGtq) elGtq.textContent = formatGTQ(state.mainBalanceGTQ);
    if(elUsd) {
        const usdValue = state.mainBalanceGTQ * state.exchangeRateUSD;
        elUsd.textContent = '$' + usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
}

// ==========================================
// RENDERIZADO DOM Y MOTOR DE TARJETAS
// ==========================================
function renderCards() {
    const container = document.getElementById('cards-container');
    if(!container) return;
    
    if(state.cards.length === 0) {
        container.style.height = '180px';
        container.innerHTML = `<div class="empty-cards-msg">Sin tarjetas</div>`;
        return;
    }

    const spacingY = 52; 
    container.style.height = `${180 + (state.visualOrder.length - 1) * spacingY}px`;
    
    // Solo fecha simple para la tarjeta
    const dateObj = new Date();
    const cardDateStr = `${dateObj.getDate()} ${new Intl.DateTimeFormat('es-ES', {month:'short'}).format(dateObj)}`;

    const emptyMsg = container.querySelector('.empty-cards-msg');
    if(emptyMsg) emptyMsg.remove();

    state.visualOrder.forEach((cardId, index) => {
        let cardEl = document.getElementById(`card-${cardId}`);
        const cardData = state.cards.find(c => c.id === cardId);

        if (!cardEl) {
            cardEl = document.createElement('div');
            cardEl.id = `card-${cardId}`;
            cardEl.className = 'card';
            setupCardEvents(cardEl, cardData.id);
            container.appendChild(cardEl);
        }

        cardEl.style.backgroundColor = cardData.color;
        if(cardData.bgImage) {
            cardEl.style.backgroundImage = `url(${cardData.bgImage})`;
            cardEl.style.backgroundSize = 'cover';
            cardEl.style.backgroundPosition = 'center';
        } else {
            cardEl.style.backgroundImage = 'none';
        }

        const yPos = index * spacingY;
        const scale = 1 - ((state.visualOrder.length - 1 - index) * 0.05);
        cardEl.style.zIndex = index;
        cardEl.style.transform = `translateY(${yPos}px) scale(${scale})`;

        const usdEquivalent = cardData.balance * state.exchangeRateUSD;

        cardEl.innerHTML = `
            <div class="delete-overlay">
                <button class="delete-icon-btn" id="del-btn-${cardData.id}">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
            <div class="card-header">
                <span class="card-title">${cardData.title}</span>
                <div class="card-icons">
                    ${cardData.isFavorite ? '<i data-lucide="star" class="star-icon"></i>' : ''}
                    <i data-lucide="wifi" class="nfc-icon"></i>
                </div>
            </div>
            <div class="card-footer">
                <div class="amount-group">
                    <span class="main-amount">${formatGTQ(cardData.balance)}</span>
                    <span class="sub-amount-usd">${formatUSD(usdEquivalent)}</span>
                </div>
                <span class="card-date">${cardDateStr}</span>
            </div>
        `;

        // Evento para el botón de eliminar animado
        const delBtn = cardEl.querySelector(`#del-btn-${cardData.id}`);
        if(delBtn) {
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                triggerDelete(cardData.id, cardEl);
            });
        }
    });

    Array.from(container.children).forEach(child => {
        if (child.classList.contains('card')) {
            const id = child.id.replace('card-', '');
            if (!state.visualOrder.includes(id)) child.remove();
        }
    });

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// ---- Control de Toques y Long Press (Eliminar) ----
function setupCardEvents(cardEl, cardId) {
    let lastClickTime = 0;
    let clickTimer;
    let pressTimer;

    // Detectar Long Press para Modo Eliminar (Solo la frontal)
    cardEl.addEventListener('pointerdown', (e) => {
        if(e.target.closest('.delete-overlay')) return; // No cancelar si toca el basurero
        
        pressTimer = setTimeout(() => {
            if(state.activeCardId === cardId) {
                cardEl.classList.add('delete-mode');
            }
        }, 550);
    });

    cardEl.addEventListener('pointermove', () => clearTimeout(pressTimer));

    cardEl.addEventListener('pointerup', (e) => {
        clearTimeout(pressTimer);
        
        // Evita abrir menús si está en modo eliminar
        if(cardEl.classList.contains('delete-mode')) return;

        const currentTime = new Date().getTime();
        
        // Doble toque (Favoritos)
        if (currentTime - lastClickTime < 300) {
            clearTimeout(clickTimer);
            const cardData = state.cards.find(c => c.id === cardId);
            if(cardData) {
                cardData.isFavorite = !cardData.isFavorite;
                renderCards();
            }
        } else {
            // Toque simple
            clickTimer = setTimeout(() => {
                if (state.activeCardId === cardId) {
                    openCardOptions(cardId); // Toca la frontal = Opciones
                } else {
                    bringCardToFront(cardId); // Toca de atrás = Traer al frente
                }
            }, 300);
        }
        lastClickTime = currentTime;
    });
}

// Quitar modo eliminar al tocar en cualquier otro lado
document.addEventListener('pointerdown', (e) => {
    if(!e.target.closest('.delete-icon-btn')) {
        document.querySelectorAll('.card.delete-mode').forEach(c => c.classList.remove('delete-mode'));
    }
});

function bringCardToFront(cardId) {
    if (state.activeCardId === cardId) return;
    state.visualOrder = state.visualOrder.filter(id => id !== cardId);
    state.visualOrder.push(cardId);
    state.activeCardId = cardId;
    renderCards();
    renderHistory();
}

function renderHistory() {
    const container = document.getElementById('history-container');
    if(!container) return;
    container.innerHTML = '';
    
    if(state.cards.length === 0) {
        container.innerHTML = `<p class="empty-history">Agrega una tarjeta para ver tu historial.</p>`;
        return;
    }

    const activeCardData = state.cards.find(c => c.id === state.activeCardId);
    if(!activeCardData || activeCardData.history.length === 0) {
        container.innerHTML = `<p class="empty-history">No hay transacciones registradas.</p>`;
        return;
    }

    activeCardData.history.slice().reverse().forEach(tx => {
        const item = document.createElement('div');
        item.className = 'history-item';
        const isExpense = tx.amount < 0;
        
        item.innerHTML = `
            <div class="item-left">
                <div class="item-icon">
                    <i data-lucide="${isExpense ? 'shopping-bag' : 'arrow-down-left'}" style="width:20px; color:white;"></i>
                </div>
                <div class="item-details">
                    <p class="item-name">${tx.name}</p>
                    <p class="item-time">${tx.time}</p> <!-- Hora mejorada inyectada aquí -->
                </div>
            </div>
            <div class="item-right">
                <p class="item-amount" style="color: ${isExpense ? '#222' : '#2e7d32'}">
                    ${isExpense ? '' : '+'}${formatGTQ(tx.amount)}
                </p>
            </div>
        `;
        container.appendChild(item);
    });
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// ==========================================
// EVENTOS Y LÓGICA DE NEGOCIO
// ==========================================
function setupEventListeners() {
    const btnCapital = document.getElementById('btn-add-capital');
    if(btnCapital) btnCapital.addEventListener('click', () => openModal('modal-addcapital'));
    
    const submitCapital = document.getElementById('submit-addcapital');
    if(submitCapital) submitCapital.addEventListener('click', handleAddCapital);

    const btnTx = document.getElementById('btn-add-tx');
    if(btnTx) btnTx.addEventListener('click', () => {
        if(state.cards.length === 0) return alert("Crea una tarjeta primero.");
        openModal('modal-tx');
    });
    
    const submitTx = document.getElementById('submit-tx');
    if(submitTx) submitTx.addEventListener('click', handleAddTransaction);

    const btnTransfer = document.getElementById('btn-transfer');
    if(btnTransfer) btnTransfer.addEventListener('click', openTransferModal);
    
    const submitTransfer = document.getElementById('submit-transfer');
    if(submitTransfer) submitTransfer.addEventListener('click', handleTransfer);
    
    const confirmBorrow = document.getElementById('confirm-borrow');
    if(confirmBorrow) confirmBorrow.addEventListener('click', confirmBorrowTransfer);

    const btnAddCard = document.getElementById('btn-add-card');
    if(btnAddCard) btnAddCard.addEventListener('click', () => openModal('modal-addcard'));
    
    const submitNewCard = document.getElementById('submit-newcard');
    if(submitNewCard) submitNewCard.addEventListener('click', handleAddCard);

    // Cambiar color/fondo de tarjeta (iOS Style)
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            updateCardBackground(e.target.getAttribute('data-color'), null);
        });
    });
    
    const btnUpload = document.getElementById('btn-upload-bg');
    if(btnUpload) btnUpload.addEventListener('click', () => { 
        const input = document.getElementById('card-bg-upload');
        if(input) input.click(); 
    });
    
    const inputBg = document.getElementById('card-bg-upload');
    if(inputBg) inputBg.addEventListener('change', handleImageUpload);

    // Cerrar modales tocando la pantalla fuera de la ventana
    const overlay = document.getElementById('modal-overlay');
    if(overlay) overlay.addEventListener('pointerdown', (e) => {
        if (e.target.id === 'modal-overlay') closeModals();
    });
}

// ---- Controladores ----
function handleAddCapital() {
    const amountVal = document.getElementById('addcapital-amount');
    const amount = parseFloat(amountVal ? amountVal.value : 0);
    if(isNaN(amount) || amount <= 0) return alert("Monto inválido");
    state.mainBalanceGTQ += amount;
    closeModals(); updateMainBalanceUI();
    if(amountVal) amountVal.value = '';
}

function handleAddTransaction() {
    const elName = document.getElementById('tx-name');
    const elAmount = document.getElementById('tx-amount');
    const name = elName ? elName.value : '';
    const amount = parseFloat(elAmount ? elAmount.value : 0);
    
    if(!name || isNaN(amount) || amount <= 0) return alert("Datos inválidos");
    
    const activeCard = state.cards.find(c => c.id === state.activeCardId);
    if(!activeCard) return;
    if(activeCard.balance < amount) return alert("Saldo insuficiente en la tarjeta actual.");

    activeCard.balance -= amount;
    activeCard.history.push({
        id: Date.now(), name: name, time: getFormattedDate(), amount: -amount
    });

    closeModals(); renderCards(); renderHistory();
    if(elName) elName.value = ''; 
    if(elAmount) elAmount.value = '';
}

function handleAddCard() {
    const elTitle = document.getElementById('newcard-title');
    const elAmount = document.getElementById('newcard-amount');
    const title = elTitle ? elTitle.value.toUpperCase() : '';
    const amount = parseFloat(elAmount ? elAmount.value : 0) || 0;

    if(!title) return alert("Escribe un título");
    if(state.mainBalanceGTQ < amount) return alert("Capital insuficiente para monto inicial.");

    state.mainBalanceGTQ -= amount;
    const newId = Date.now().toString();
    
    state.cards.push({
        id: newId, title: title, color: '#1a1aeb', bgImage: null, balance: amount, isFavorite: false,
        history: amount > 0 ?[{ id: Date.now(), name: 'Depósito Inicial', time: getFormattedDate(), amount: amount }] :[]
    });
    
    state.visualOrder.push(newId);
    state.activeCardId = newId;
    
    closeModals(); updateMainBalanceUI(); renderCards(); renderHistory();
    if(elTitle) elTitle.value = ''; 
    if(elAmount) elAmount.value = '';
}

// ---- Función Eliminar Animada ----
function triggerDelete(cardId, cardEl) {
    cardEl.classList.add('deleting');
    
    setTimeout(() => {
        const cardIndex = state.cards.findIndex(c => c.id === cardId);
        if(cardIndex === -1) return;
        const card = state.cards[cardIndex];
        
        state.mainBalanceGTQ += card.balance; // Devolver el dinero al capital
        state.cards.splice(cardIndex, 1);
        state.visualOrder = state.visualOrder.filter(id => id !== cardId);
        state.activeCardId = state.visualOrder.length > 0 ? state.visualOrder[state.visualOrder.length - 1] : null;
        
        updateMainBalanceUI(); renderCards(); renderHistory();
    }, 300); // 300ms espera a que termine la animación css shrink
}

// ---- Sistema Avanzado de Transferencia (Préstamo) ----
function openTransferModal() {
    if(state.cards.length < 2) return alert("Necesitas al menos 2 tarjetas creadas para poder transferir.");
    
    const targetSelect = document.getElementById('transfer-target');
    if(!targetSelect) return;
    targetSelect.innerHTML = '<option value="" disabled selected>Selecciona destino...</option>';
    
    state.cards.forEach(c => {
        if(c.id !== state.activeCardId) {
            targetSelect.innerHTML += `<option value="${c.id}">${c.title} (${formatGTQ(c.balance)})</option>`;
        }
    });
    openModal('modal-transfer');
}

function handleTransfer() {
    const elTarget = document.getElementById('transfer-target');
    const elAmount = document.getElementById('transfer-amount');
    const targetId = elTarget ? elTarget.value : '';
    const amount = parseFloat(elAmount ? elAmount.value : 0);
    
    if(!targetId || isNaN(amount) || amount <= 0) return alert("Completa los datos correctamente.");
    
    const sourceCard = state.cards.find(c => c.id === state.activeCardId);
    const targetCard = state.cards.find(c => c.id === targetId);
    
    if(!sourceCard || !targetCard) return;

    if (sourceCard.balance >= amount) {
        // Transferencia directa normal
        executeTransfer(sourceCard, targetCard, amount, 0);
    } else {
        // Necesita préstamo del capital principal
        const missingAmount = amount - sourceCard.balance;
        if (state.mainBalanceGTQ >= missingAmount) {
            state.pendingTransfer = { sourceCard, targetCard, amount, missingAmount };
            const borrowText = document.getElementById('borrow-text');
            if(borrowText) borrowText.textContent = `La tarjeta actual no tiene suficiente saldo. ¿Deseas tomar el monto faltante (${formatGTQ(missingAmount)}) de tu Billetera?`;
            openModal('modal-borrow-confirm');
        } else {
            alert("No tienes fondos suficientes ni en la tarjeta ni en la Billetera para completar esta transferencia.");
        }
    }
}

function confirmBorrowTransfer() {
    if(!state.pendingTransfer) return;
    const { sourceCard, targetCard, amount, missingAmount } = state.pendingTransfer;
    executeTransfer(sourceCard, targetCard, amount, missingAmount);
    state.pendingTransfer = null;
}

function executeTransfer(sourceCard, targetCard, amount, borrowed) {
    const timeStr = getFormattedDate();
    
    if (borrowed > 0) {
        state.mainBalanceGTQ -= borrowed;
        sourceCard.balance = 0; // Se vació por completo
        sourceCard.history.push({ id: Date.now(), name: 'Transferencia a ' + targetCard.title, time: timeStr, amount: -(amount - borrowed) });
    } else {
        sourceCard.balance -= amount;
        sourceCard.history.push({ id: Date.now(), name: 'Transferencia a ' + targetCard.title, time: timeStr, amount: -amount });
    }
    
    targetCard.balance += amount;
    targetCard.history.push({ id: Date.now()+1, name: 'Transferencia de ' + sourceCard.title, time: timeStr, amount: amount });
    
    closeModals(); updateMainBalanceUI(); renderCards(); renderHistory();
    const elAmount = document.getElementById('transfer-amount');
    if(elAmount) elAmount.value = '';
}

// Imagen Canvas
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 600; 
            const scaleSize = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH; canvas.height = img.height * scaleSize;
            const ctx = canvas.getContext('2d');
            if(ctx) {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                updateCardBackground(null, dataUrl);
            }
        }
        img.src = e.target.result;
    }
    reader.readAsDataURL(file);
}

function updateCardBackground(color, bgImage) {
    if(!state.selectedCardForOptions) return;
    const card = state.cards.find(c => c.id === state.selectedCardForOptions);
    if(color) { card.color = color; card.bgImage = null; }
    if(bgImage) { card.bgImage = bgImage; }
    renderCards(); closeModals();
}

// ---- Modales ----
function openModal(modalId) {
    document.querySelectorAll('.modal-content').forEach(m => m.classList.remove('active'));
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById(modalId);
    if(overlay) overlay.classList.add('active');
    if(modal) modal.classList.add('active');
}

function openCardOptions(cardId) {
    state.selectedCardForOptions = cardId;
    openModal('modal-cardoptions');
}

function closeModals() {
    const overlay = document.getElementById('modal-overlay');
    if(overlay) overlay.classList.remove('active');
    document.querySelectorAll('.modal-content').forEach(m => m.classList.remove('active'));
}
