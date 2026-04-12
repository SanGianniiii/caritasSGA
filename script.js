const GAS_URL = "https://script.google.com/macros/s/AKfycbyii0LB2JBDbe_oS2wTon6bdQXm2zQwgtq6WffvXkXyRIOfetG8jkK2qjUOlNsVpPvd/exec";

let html5QrCode;
let currentProduct = null;
let fullInventoryData = [];
let cachedCategories = []; // Memoria locale per velocizzare l'app
let isInventoryView = false;

// 🚀 VELOCIZZAZIONE: Carichiamo le categorie appena si apre l'app
window.onload = () => {
    fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'getCategories' }) })
    .then(r => r.json())
    .then(data => { cachedCategories = data; })
    .catch(e => console.log("Errore pre-caricamento"));
};

function showLoading(show, text = "Elaborazione...") {
    document.getElementById('loading-text').innerText = text;
    document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

function showToast(msg, type = "success") {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerText = msg;
    container.appendChild(t);
    // Sparisce più velocemente per dinamismo
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 2500);
}

function goToHome() { 
    closeModals();
    document.getElementById('scanner-container').style.display = 'none';
    document.getElementById('inventory-container').style.display = 'none';
    document.getElementById('main-menu').style.display = 'block';
    isInventoryView = false;
    showLoading(false);
}

function closeModals() { 
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); 
}

// SCANNER VELOCIZZATO
async function showScanner() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('scanner-container').style.display = 'block';
    if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
    
    try {
        // Aumentati i FPS per una lettura più rapida
        await html5QrCode.start({ facingMode: "environment" }, { fps: 20, qrbox: 250 }, onScanSuccess);
    } catch (e) {
        showToast("Errore fotocamera", "error");
        goToHome();
    }
}

async function hideScanner() {
    if(html5QrCode) {
        try { await html5QrCode.stop(); await html5QrCode.clear(); } catch(e) {}
    }
    goToHome();
}

async function onScanSuccess(barcode) {
    const cleanBarcode = barcode.toString().trim();
    if (navigator.vibrate) navigator.vibrate(50); // Feedback tattile
    
    showLoading(true, "Ricerca...");
    if(html5QrCode) { try { await html5QrCode.stop(); } catch(e) {} }
    document.getElementById('scanner-container').style.display = 'none';
    
    try {
        let r = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'checkProduct', barcode: cleanBarcode }) });
        let p = await r.json();
        showLoading(false);
        
        if (p && p.name) {
            currentProduct = { barcode: cleanBarcode, name: p.name, category: p.category, quantity: p.quantity, isNew: false };
            openQtyModal("carico");
        } else {
            currentProduct = { barcode: cleanBarcode, isNew: true };
            openNewProductModal();
        }
    } catch (e) { showToast("Errore rete", "error"); goToHome(); }
}

// INVENTARIO
async function loadInventory() {
    showLoading(true, "Caricamento...");
    isInventoryView = true;
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('inventory-container').style.display = 'flex';
    
    try {
        // Usiamo le categorie già in memoria se disponibili
        const respInv = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'getInventory' }) });
        fullInventoryData = await respInv.json();
        
        const f = document.getElementById('category-filter');
        f.innerHTML = '<option value="ALL">📦 Tutte le categorie</option>';
        cachedCategories.forEach(c => f.innerHTML += `<option value="${c}">${c}</option>`);
        
        renderInventory();
    } catch (e) { showToast("Errore", "error"); }
    showLoading(false);
}

function renderInventory() {
    const list = document.getElementById('inventory-list');
    const filter = document.getElementById('category-filter').value;
    list.innerHTML = "";
    
    let sorted = fullInventoryData
        .filter(item => item[1] && item[1].toString().trim() !== "")
        .sort((a,b) => (a[2] || "").localeCompare(b[2] || ""));

    let lastCat = null;
    sorted.forEach((item) => {
        if (filter !== "ALL" && item[2] !== filter) return;
        if (item[2] !== lastCat) {
            const h = document.createElement('div');
            h.style = "padding:10px 15px; background:#f1f5f9; font-weight:bold; color:var(--blue); font-size:0.9rem;";
            h.innerText = item[2] || "VARIE";
            list.appendChild(h);
            lastCat = item[2];
        }
        const li = document.createElement('li');
        li.className = "inventory-card";
        li.innerHTML = `
            <div><b>${item[1]}</b><br><small>Giacenza: ${item[3]}</small></div>
            <div style="display:flex; gap:10px;">
                <button class="btn-q btn-minus" onclick="quickAction('${item[0]}','${item[1]}','${item[2]}', ${item[3]}, 'scarico')">-</button>
                <button class="btn-q btn-plus" onclick="quickAction('${item[0]}','${item[1]}','${item[2]}', ${item[3]}, 'carico')">+</button>
            </div>`;
        list.appendChild(li);
    });
}

// OPERAZIONI
function changeQty(amount) {
    const input = document.getElementById('qty-input');
    let val = parseInt(input.value) || 0;
    val = Math.max(1, val + amount);
    input.value = val;
}

function openQtyModal(tipo) {
    document.getElementById('modal-title').innerText = tipo === "carico" ? "📦 CARICO" : "📤 SCARICO";
    document.getElementById('prod-category-badge').innerText = currentProduct.category || "Nuovo";
    document.getElementById('prod-name-display').innerText = currentProduct.name;
    document.getElementById('qty-input').value = "1";
    document.getElementById('modal-qty').style.display = 'flex';
    document.getElementById('btn-conferma-azione').onclick = () => submitOperation(tipo);
}

async function submitOperation(tipo) {
    const q = parseInt(document.getElementById('qty-input').value);
    const barcodeStr = String(currentProduct.barcode).trim();
    
    // UI OTTIMISTICA: Chiudiamo il modale subito
    closeModals();
    showLoading(true, "Salvataggio...");

    try {
        const resp = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateStock',
                barcode: barcodeStr,
                name: currentProduct.name,
                category: currentProduct.category,
                quantity: tipo === "carico" ? q : -q
            })
        });
        const res = await resp.json();
        if(res.success) {
            showToast(res.message);
            if(isInventoryView) loadInventory(); else setTimeout(goToHome, 1200);
        } else { showToast(res.error, "error"); showLoading(false); }
    } catch (e) { showToast("Errore connessione", "error"); showLoading(false); }
}

function quickAction(b, n, c, q, t) {
    currentProduct = { barcode: b, name: n, category: c, quantity: q };
    openQtyModal(t);
}

function openNewProductModal() {
    const n = document.getElementById('new-prod-category');
    // Caricamento istantaneo dalle categorie in cache
    n.innerHTML = '<option value="" disabled selected>Scegli...</option>';
    cachedCategories.forEach(c => n.innerHTML += `<option value="${c}">${c}</option>`);
    n.innerHTML += `<option value="NEW">➕ Nuova categoria...</option>`;
    document.getElementById('modal-new-product').style.display = 'flex';
}

function checkNewCategory(selectObj) {
    if (selectObj.value === "NEW") {
        let newCat = prompt("Inserisci nuova categoria:");
        if (newCat) {
            newCat = newCat.trim().toUpperCase();
            const opt = document.createElement("option");
            opt.text = newCat; opt.value = newCat;
            selectObj.add(opt, selectObj.options[selectObj.options.length - 1]);
            selectObj.value = newCat;
            if (!cachedCategories.includes(newCat)) cachedCategories.push(newCat);
        }
    }
}

function saveNewProductAnagrafica() {
    const n = document.getElementById('new-prod-name').value;
    const c = document.getElementById('new-prod-category').value;
    if(!n || !c) { showToast("Dati mancanti", "error"); return; }
    currentProduct.name = n; currentProduct.category = c;
    closeModals();
    openQtyModal("carico");
}
