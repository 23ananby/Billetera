// ==========================================
// ESTADO GLOBAL
// ==========================================
let state = {
    exchangeRateUSD: 0.128,
    activeCardId: null,
    visualOrder:[],
    cards:[], 
    selectedCardForDeletion: null,
    pendingTransfer: null,
    filterMode: 'live', // 'live', 'month', 'year', 'custom'
    customFilterRange: { start: null, end: null }
};

const COLOR_PALETTE = ['#007aff', '#ff3b30', '#34c759', '#5856d6', '#ff9500', '#af52de', '#5ac8fa', '#ff2d55'];

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
    await fetchExchangeRate();
    
    // Configurar año dinámico en botón
    const yearBtn = document.getElementById('filter-year-btn');
    if(yearBtn) yearBtn.textContent = new Date().getFullYear();

    renderCards();
    updateMainUI();
    setupEventListeners();
});

async function fetchExchangeRate() {
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/GTQ');
        const data = await res.json();
        if(data && data.rates && data.rates.USD) state.exchangeRateUSD = data.rates.USD;
    } catch (error) { console.warn("API falló."); }
}

function formatGTQ(amount) { return 'Q ' + Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatUSD(amount) { return Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD'; }

function getFormattedDate() {
    const d = new Date();
    const day = d.getDate();
    const month = new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(d);
    const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${day} ${month.charAt(0).toUpperCase() + month.slice(1)}, ${time}`;
}

// ==========================================
// LÓGICA DE FILTRADO
// ==========================================
function isTxInRange(txDate) {
    if (state.filterMode === 'live') return true;
    
    const d = new Date(txDate);
    const now = new Date();

    if (state.filterMode === 'month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (state.filterMode === 'year') {
        return d.getFullYear() === now.getFullYear();
    }
    if (state.filterMode === 'custom') {
        if (!state.customFilterRange.start || !state.customFilterRange.end) return true;
        const start = new Date(state.customFilterRange.start);
        const end = new Date(state.customFilterRange.end);
        end.setHours(23, 59, 59); // Incluir todo el día final
        return d >= start && d <= end;
    }
    return true;
}

function calculateFilteredIncomes() {
    let totalIncomes = 0;
    state.cards.forEach(card => {
        card.history.forEach(tx => {
            if (tx.type === 'deposit' && isTxInRange(tx.timestamp)) {
                totalIncomes += tx.amount;
            }
        });
    });
    return totalIncomes;
}

function updateMainUI() {
    const totalIncomes = calculateFilteredIncomes();
    const elGtq = document.getElementById('main-balance-gtq');
    const elUsd = document.getElementById('main-balance-usd');
    const elLabel = document.getElementById('balance-label-text');

    if (elGtq) elGtq.textContent = 'Q ' + totalIncomes.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (elUsd) {
        const usdValue = totalIncomes * state.exchangeRateUSD;
        elUsd.textContent = '$' + usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD';
    }

    if (elLabel) {
        const labels = { live: 'Ingresos Totales', month: 'Ingresos del Mes', year: 'Ingresos del Año', custom: 'Ingresos en Rango' };
        elLabel.textContent = labels[state.filterMode];
    }

    renderHistory();
}

// ==========================================
// RENDERIZADO
// ==========================================
function renderCards() {
    const container = document.getElementById('cards-container');
    if(!container) return;
    
    // Limpiar mensaje vacío si existe
    const emptyMsg = container.querySelector('.empty-cards-msg');
    
    if(state.cards.length === 0) {
        container.style.height = '180px';
        if (!emptyMsg) container.innerHTML = `<div class="empty-cards-msg">Billetera vacía</div>`;
        return;
    } else {
        if (emptyMsg) emptyMsg.remove();
    }

    const spacingY = 52; 
    container.style.height = `${180 + (state.visualOrder.length - 1) * spacingY}px`;
    
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
        const yPos = index * spacingY;
        const scale = 1 - ((state.visualOrder.length - 1 - index) * 0.05);
        cardEl.style.zIndex = index;
        cardEl.style.transform = `translateY(${yPos}px) scale(${scale})`;

        const usdEquivalent = cardData.balance * state.exchangeRateUSD;

        cardEl.innerHTML = `
            <div class="card-header">
                <span class="card-title">${cardData.title}</span>
                <div class="card-icons">
                    ${cardData.isFavorite ? '<i data-lucide="star" class="star-icon"></i>' : ''}
                    <i data-lucide="wifi" class="nfc-icon"></i>
                </div>
            </div>
            <div class="card-footer">
                <div class="amount-group">
                    <span class="main-amount">Q ${cardData.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span class="sub-amount-usd">${formatUSD(usdEquivalent)}</span>
                </div>
                <span class="card-date">Real-Time</span>
            </div>
        `;
    });

    Array.from(container.children).forEach(child => {
        if (child.classList.contains('card')) {
            const id = child.id.replace('card-', '');
            if (!state.visualOrder.includes(id)) child.remove();
        }
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderHistory() {
    const container = document.getElementById('history-container');
    if(!container) return;
    container.innerHTML = '';
    
    const activeCardData = state.cards.find(c => c.id === state.activeCardId);
    if(state.cards.length === 0 || !activeCardData) {
        container.innerHTML = `<p class="empty-history">Selecciona una tarjeta</p>`;
        return;
    }

    const filteredHistory = activeCardData.history.filter(tx => isTxInRange(tx.timestamp));

    if (filteredHistory.length === 0) {
        container.innerHTML = `<p class="empty-history">Sin registros en este rango</p>`;
        return;
    }

    filteredHistory.slice().reverse().forEach(tx => {
        const item = document.createElement('div');
        item.className = 'history-item';
        const isExpense = tx.amount < 0 && tx.type !== 'transfer_receive';
        let iconName = tx.type === 'deposit' ? 'chevron-up' : (tx.type === 'expense' ? 'chevron-down' : (tx.type === 'transfer_send' ? 'chevron-right' : 'chevron-left'));

        item.innerHTML = `
            <div class="item-left">
                <div class="item-icon" style="background: ${tx.type === 'deposit' ? '#e5f9e7' : '#f2f2f7'}">
                    <i data-lucide="${iconName}" style="width:20px; color: ${tx.type === 'deposit' ? '#34c759' : '#000'};"></i>
                </div>
                <div class="item-details">
                    <p class="item-name">${tx.name}</p>
                    <p class="item-time">${tx.time}</p>
                </div>
            </div>
            <div class="item-right text-right">
                <p class="item-amount" style="color: ${tx.amount < 0 ? '#000' : '#34c759'}">
                    ${tx.amount < 0 ? '-' : '+'}${formatGTQ(tx.amount)}
                </p>
            </div>
        `;
        container.appendChild(item);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ==========================================
// EVENTOS
// ==========================================
function setupCardEvents(cardEl, cardId) {
    let lastTap = 0;
    let pressTimer;

    cardEl.addEventListener('pointerdown', (e) => {
        const now = Date.now();
        if (now - lastTap < 300) {
            // Doble Tap
            toggleFavorite(cardId);
            clearTimeout(pressTimer);
            return;
        }
        lastTap = now;

        pressTimer = setTimeout(() => {
            state.selectedCardForDeletion = cardId;
            openModal('modal-delete-confirm');
        }, 600);
    });

    cardEl.addEventListener('pointermove', () => clearTimeout(pressTimer));
    cardEl.addEventListener('pointerup', () => {
        clearTimeout(pressTimer);
        if (state.activeCardId !== cardId) bringCardToFront(cardId);
    });
}

function toggleFavorite(cardId) {
    const card = state.cards.find(c => c.id === cardId);
    if(card) {
        card.isFavorite = !card.isFavorite;
        renderCards();
    }
}

function setupEventListeners() {
    // Botones de Acción (Abrir Modales)
    document.getElementById('btn-add-tx').onclick = () => { if(state.cards.length > 0) openModal('modal-tx'); else alert("Crea una tarjeta"); };
    document.getElementById('btn-transfer').onclick = openTransferModal;
    document.getElementById('btn-add-capital').onclick = () => { if(state.cards.length > 0) openModal('modal-addcapital'); else alert("Crea una tarjeta"); };
    document.getElementById('btn-add-card').onclick = () => openModal('modal-addcard');

    // Envío de Formularios
    document.getElementById('submit-addcapital').addEventListener('click', handleAddCapital);
    document.getElementById('submit-tx').addEventListener('click', handleAddTransaction);
    document.getElementById('submit-transfer').addEventListener('click', handleTransfer);
    document.getElementById('confirm-borrow').addEventListener('click', confirmBorrowTransfer);
    document.getElementById('submit-newcard').addEventListener('click', handleAddCard);
    document.getElementById('btn-confirm-delete').addEventListener('click', () => triggerDelete(state.selectedCardForDeletion));

    document.getElementById('modal-overlay').onclick = (e) => { if(e.target.id === 'modal-overlay') closeModals(); };
    
    document.querySelectorAll('.filter-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const mode = e.target.getAttribute('data-mode');
            // Toggle: Si ya está activo, volver a 'live'
            const targetMode = (state.filterMode === mode) ? 'live' : mode;

            if (targetMode === 'custom' && state.filterMode !== 'custom') {
                openModal('modal-custom-range');
            } else {
                updateFilterMode(targetMode);
            }
        });
    });

    document.getElementById('btn-reset-app').onclick = handleResetApp;
    document.getElementById('submit-custom-range').addEventListener('click', handleCustomRange);
}

function handleResetApp() {
    if(!confirm("¿Estás seguro de que quieres empezar desde cero? Se borrarán todas las tarjetas y registros.")) return;
    
    state = {
        exchangeRateUSD: 0.128,
        activeCardId: null,
        visualOrder:[],
        cards:[], 
        selectedCardForDeletion: null,
        pendingTransfer: null,
        filterMode: 'live',
        customFilterRange: { start: null, end: null }
    };

    document.getElementById('cards-container').innerHTML = '';
    updateFilterMode('live'); // Esto ya llama a updateMainUI y renderHistory
    renderCards();
    alert("Aplicación reseteada.");
}

function updateFilterMode(mode, range = { start: null, end: null }) {
    state.filterMode = mode;
    state.customFilterRange = range;
    
    document.querySelectorAll('.filter-pill').forEach(p => {
        p.classList.toggle('active', p.getAttribute('data-mode') === mode);
    });

    updateMainUI();
    closeModals();
}

function handleCustomRange() {
    const start = document.getElementById('filter-start-date').value;
    const end = document.getElementById('filter-end-date').value;
    if (!start || !end) return alert("Elige fechas");
    updateFilterMode('custom', { start, end });
}

// ---- Controladores ----
function handleAddCapital() {
    const el = document.getElementById('addcapital-amount');
    const amount = parseFloat(el.value);
    if(isNaN(amount) || amount <= 0) return;
    
    const activeCard = state.cards.find(c => c.id === state.activeCardId);
    if(!activeCard) return alert("Crea una tarjeta primero");

    activeCard.balance += amount;
    activeCard.history.push({
        id: Date.now(), name: 'Recarga Capital', time: getFormattedDate(), 
        timestamp: Date.now(), amount: amount, type: 'deposit'
    });

    closeModals(); updateMainUI(); el.value = ''; renderCards();
}

function handleAddTransaction() {
    const elName = document.getElementById('tx-name');
    const elAmount = document.getElementById('tx-amount');
    const amount = parseFloat(elAmount.value);
    if(!elName.value || isNaN(amount) || amount <= 0) return;
    
    const card = state.cards.find(c => c.id === state.activeCardId);
    if(!card || card.balance < amount) return alert("Saldo insuficiente");

    card.balance -= amount;
    card.history.push({
        id: Date.now(), name: elName.value, time: getFormattedDate(), 
        timestamp: Date.now(), amount: -amount, type: 'expense'
    });

    closeModals(); updateMainUI(); renderCards();
    elName.value = ''; elAmount.value = '';
}

function handleAddCard() {
    const elTitle = document.getElementById('newcard-title');
    const elAmount = document.getElementById('newcard-amount');
    const amount = parseFloat(elAmount.value) || 0;
    if(!elTitle.value) return;

    if(state.cards.length >= 4) {
        alert("Límite de tarjetas alcanzado (Máximo 4)");
        closeModals();
        return;
    }

    const newId = Date.now().toString();
    let color = COLOR_PALETTE[state.cards.length % COLOR_PALETTE.length];

    state.cards.push({
        id: newId, title: elTitle.value.toUpperCase(), color: color, balance: amount, isFavorite: false,
        history: amount > 0 ?[{ id: Date.now(), name: 'Capital Inicial', time: getFormattedDate(), timestamp: Date.now(), amount: amount, type: 'deposit' }] :[]
    });
    
    state.visualOrder.push(newId);
    state.activeCardId = newId;
    
    closeModals(); updateMainUI(); renderCards();
    elTitle.value = ''; elAmount.value = '';
}

function triggerDelete(cardId) {
    const cardEl = document.getElementById(`card-${cardId}`);
    if(cardEl) cardEl.classList.add('deleting');
    setTimeout(() => {
        state.cards = state.cards.filter(c => c.id !== cardId);
        state.visualOrder = state.visualOrder.filter(id => id !== cardId);
        state.activeCardId = state.visualOrder.length > 0 ? state.visualOrder[state.visualOrder.length - 1] : null;
        closeModals(); updateMainUI(); renderCards();
    }, 300);
}

function bringCardToFront(id) {
    state.visualOrder = state.visualOrder.filter(x => x !== id);
    state.visualOrder.push(id);
    state.activeCardId = id;
    renderCards(); renderHistory();
}

function openTransferModal() {
    if(state.cards.length < 2) return alert("Mínimo 2 tarjetas");
    const select = document.getElementById('transfer-target');
    select.innerHTML = '<option value="" disabled selected>Destino</option>';
    state.cards.forEach(c => { if(c.id !== state.activeCardId) select.innerHTML += `<option value="${c.id}">${c.title}</option>`; });
    openModal('modal-transfer');
}

function handleTransfer() {
    const targetId = document.getElementById('transfer-target').value;
    const amount = parseFloat(document.getElementById('transfer-amount').value);
    if(!targetId || isNaN(amount) || amount <= 0) return;
    
    const source = state.cards.find(c => c.id === state.activeCardId);
    const target = state.cards.find(c => c.id === targetId);
    
    if (source.balance >= amount) {
        executeTransfer(source, target, amount, 0);
    } else {
        alert("Sin fondos suficientes");
    }
}

function confirmBorrowTransfer() {} // No se usa en este nuevo flujo de capital directo

function executeTransfer(source, target, amount, borrowed) {
    const time = getFormattedDate();
    const stamp = Date.now();
    source.balance -= amount;
    source.history.push({ id: stamp, name: 'Envío a ' + target.title, time, timestamp: stamp, amount: -amount, type: 'transfer_send' });
    target.balance += amount;
    target.history.push({ id: stamp+1, name: 'De ' + source.title, time, timestamp: stamp, amount, type: 'transfer_receive' });
    closeModals(); updateMainUI(); renderCards();
}

function openModal(id) {
    document.querySelectorAll('.modal-content').forEach(m => m.classList.remove('active'));
    document.getElementById('modal-overlay').classList.add('active');
    document.getElementById(id).classList.add('active');
}

function closeModals() {
    document.getElementById('modal-overlay').classList.remove('active');
    document.querySelectorAll('.modal-content').forEach(m => m.classList.remove('active'));
    state.selectedCardForDeletion = null;
}
