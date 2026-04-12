const GAS_URL = "https://script.google.com/macros/s/AKfycbyii0LB2JBDbe_oS2wTon6bdQXm2zQwgtq6WffvXkXyRIOfetG8jkK2qjUOlNsVpPvd/exec";

let html5QrCode;
let currentProduct = null;
let globalCategories = [];
let fullInventoryData = [];

// Funzione Messaggi (Toast)
function showToast(msg, type = "success") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 3000);
}

function showLoading(s) { document.getElementById('loading-overlay').style.display = s ? 'flex' : 'none'; }
function closeModals() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }
function showMenu() { location.reload(); } // Modo più sicuro per resettare tutto al menu

async function fetchCategories() {
    try {
        const r = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'getCategories' }) });
        globalCategories = await r.json();
        const f = document.getElementById('category-filter');
        const n = document.getElementById('new-prod-category');
        f.innerHTML = '<option value="ALL">📦 Tutte le categorie</option>';
        n.innerHTML = '<option value="" disabled selected>Scegli...</option>';
        globalCategories.forEach(c => {
            f.innerHTML += `<option value="${c}">${c}</option>`;
            n.innerHTML += `<option value="${c}">${c}</option>`;
        });
        n.innerHTML += `<option value="NEW">➕ Aggiungi nuova...</option>`;
    } catch (e) { showToast("Errore caricamento categorie", "error"); }
}

function showScanner() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('scanner-container').style.display = 'block';
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 15, qrbox: 250 }, onScanSuccess)
    .catch(err => { showToast("Fotocamera non trovata", "error"); showMenu(); });
}

async function hideScanner() {
    if(html5QrCode) {
        await html5QrCode.stop();
        await html5QrCode.clear();
    }
    showMenu();
}

async function onScanSuccess(barcode) {
    if(html5QrCode) await html5QrCode.stop();
    document.getElementById('scanner-container').style.display = 'none';
    showLoading(true);
    try {
        let r = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'checkProduct', barcode: barcode }) });
        let p = await r.json();
        if (p && p.name) {
            currentProduct = { ...p, isNew: false };
            openQtyModal("carico");
        } else {
            currentProduct = { barcode: barcode, isNew: true };
            openNewProductModal("");
        }
    } catch (e) { showToast("Errore di rete", "error"); showMenu(); }
    showLoading(false);
}

function openNewProductModal(name) {
    document.getElementById('new-prod-name').value = name;
    document.getElementById('modal-new-product').style.display = 'flex';
    fetchCategories();
}

function saveNewProductAnagrafica() {
    const n = document.getElementById('new-prod-name').value;
    const c = document.getElementById('new-prod-category').value;
    if (!n || !c) { showToast("Compila tutti i campi", "error"); return; }
    currentProduct.name = n; currentProduct.category = c; currentProduct.row = null;
    currentProduct.quantity = 0; // Nuovo prodotto parte da zero
    closeModals(); openQtyModal("carico");
}

function openQtyModal(tipo) {
    document.getElementById('modal-title').innerText = tipo === "carico" ? "📦 Carico" : "📤 Scarico";
    document.getElementById('prod-category-badge').innerText = currentProduct.category;
    document.getElementById('prod-name-display').innerText = currentProduct.name;
    document.getElementById('qty-input').value = "1";
    document.getElementById('modal-qty').style.display = 'flex';
    document.getElementById('btn-conferma-azione').onclick = () => submitOperation(tipo);
}

function changeQty(v) {
    const i = document.getElementById('qty-input');
    let val = parseInt(i.value) || 0;
    val += v; if (val < 1) val = 1;
    i.value = val;
}

async function submitOperation(tipo) {
    const q = parseInt(document.getElementById('qty-input').value);
    
    // CONTROLLO GIACENZA NEGATIVA
    if (tipo === "scarico" && q > currentProduct.quantity) {
        showToast(`Errore: ne hai solo ${currentProduct.quantity}!`, "error");
        return;
    }

    closeModals();
    showLoading(true);
    try {
        let resp = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateStock',
                barcode: currentProduct.barcode,
                name: currentProduct.name,
                category: currentProduct.category,
                quantity: tipo === "carico" ? q : -q,
                row: currentProduct.row
            })
        });
        let result = await resp.json();
        if(result.success) {
            showToast(tipo === "carico" ? `Aggiunti ${q} pezzi` : `Tolti ${q} pezzi`, "success");
            setTimeout(showMenu, 1500);
        } else {
            showToast(result.error, "error");
        }
    } catch (e) { showToast("Errore connessione", "error"); }
    showLoading(false);
}

async function loadInventory() {
    showLoading(true);
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('inventory-container').style.display = 'flex';
    await fetchCategories();
    try {
        const r = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'getInventory' }) });
        fullInventoryData = await r.json();
        renderInventory();
    } catch (e) { showToast("Errore dati", "error"); }
    showLoading(false);
}

function renderInventory() {
    const list = document.getElementById('inventory-list');
    const filter = document.getElementById('category-filter').value;
    list.innerHTML = "";
    
    let sorted = [...fullInventoryData].sort((a,b) => (a[2] || "").localeCompare(b[2] || ""));
    let lastCat = null;

    sorted.forEach((item, index) => {
        if (filter !== "ALL" && item[2] !== filter) return;
        if (item[2] !== lastCat) {
            const h = document.createElement('div');
            h.className = "cat-header"; h.innerText = item[2] || "Varie";
            list.appendChild(h); lastCat = item[2];
        }
        const li = document.createElement('li');
        li.className = "inventory-card";
        li.innerHTML = `
            <div><b>${item[1]}</b><br><small>Giacenza: ${item[3]}</small></div>
            <div class="btn-quick-group">
                <button class="btn-q btn-minus" onclick="quickAction('${item[0]}','${item[1]}','${item[2]}', ${item[3]}, 'scarico', ${fullInventoryData.indexOf(item)})">-</button>
                <button class="btn-q btn-plus" onclick="quickAction('${item[0]}','${item[1]}','${item[2]}', ${item[3]}, 'carico', ${fullInventoryData.indexOf(item)})">+</button>
            </div>`;
        list.appendChild(li);
    });
}

function quickAction(b, n, c, q, t, idx) {
    currentProduct = { barcode: b, name: n, category: c, quantity: q, row: idx + 2 };
    openQtyModal(t);
}

document.addEventListener("DOMContentLoaded", fetchCategories);
