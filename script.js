const GAS_URL = "https://script.google.com/macros/s/AKfycbyii0LB2JBDbe_oS2wTon6bdQXm2zQwgtq6WffvXkXyRIOfetG8jkK2qjUOlNsVpPvd/exec";

let html5QrCode;
let currentProduct = null;
let fullInventoryData = [];
let isInventoryView = false;

// Gestione Spinner con Messaggio
function showLoading(show, text = "Elaborazione...") {
    const loader = document.getElementById('loading-overlay');
    document.getElementById('loading-text').innerText = text;
    loader.style.display = show ? 'flex' : 'none';
}

function showToast(msg, type = "success") {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerText = msg;
    container.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 3000);
}

// Navigazione e Modali (Aggiornato)
function goToHome() { 
    closeModals();
    document.getElementById('scanner-container').style.display = 'none';
    document.getElementById('inventory-container').style.display = 'none';
    document.getElementById('main-menu').style.display = 'block';
    isInventoryView = false;
}

function closeModals() { 
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); 
}

function closeAndReturn() {
    closeModals();
    if (!isInventoryView) {
        goToHome();
    }
}

// SCANNER
async function showScanner() {
    showLoading(true, "Attivazione fotocamera...");
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('scanner-container').style.display = 'block';
    html5QrCode = new Html5Qrcode("reader");
    try {
        await html5QrCode.start({ facingMode: "environment" }, { fps: 15, qrbox: 250 }, onScanSuccess);
        showLoading(false);
    } catch (e) {
        showToast("Impossibile avviare fotocamera", "error");
        goToHome();
    }
}

async function hideScanner() {
    showLoading(true, "Chiusura scanner...");
    if(html5QrCode) {
        await html5QrCode.stop();
        await html5QrCode.clear();
    }
    goToHome();
}

async function onScanSuccess(barcode) {
    showLoading(true, "Ricerca prodotto...");
    if(html5QrCode) {
        await html5QrCode.stop();
        await html5QrCode.clear();
    }
    document.getElementById('scanner-container').style.display = 'none';
    
    try {
        let r = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'checkProduct', barcode: barcode }) });
        let p = await r.json();
        showLoading(false);
        if (p && p.name) {
            currentProduct = { ...p, isNew: false };
            openQtyModal("carico");
        } else {
            currentProduct = { barcode: barcode, isNew: true };
            openNewProductModal();
        }
    } catch (e) { 
        showToast("Errore di rete", "error"); 
        goToHome(); 
    }
}

// INVENTARIO
async function loadInventory() {
    showLoading(true, "Caricamento giacenze...");
    isInventoryView = true;
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('inventory-container').style.display = 'flex';
    
    try {
        const [respCat, respInv] = await Promise.all([
            fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'getCategories' }) }),
            fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'getInventory' }) })
        ]);
        
        const cats = await respCat.json();
        fullInventoryData = await respInv.json();
        
        const f = document.getElementById('category-filter');
        f.innerHTML = '<option value="ALL">📦 Tutte le categorie</option>';
        cats.forEach(c => f.innerHTML += `<option value="${c}">${c}</option>`);
        
        renderInventory();
    } catch (e) { showToast("Errore caricamento", "error"); }
    showLoading(false);
}

function renderInventory() {
    const list = document.getElementById('inventory-list');
    const filter = document.getElementById('category-filter').value;
    list.innerHTML = "";
    
    let sorted = [...fullInventoryData].sort((a,b) => (a[2] || "").localeCompare(b[2] || ""));
    let lastCat = null;

    sorted.forEach((item) => {
        if (filter !== "ALL" && item[2] !== filter) return;
        if (item[2] !== lastCat) {
            const h = document.createElement('div');
            h.style = "padding:10px 15px; background:#f8fafc; font-weight:bold; font-size:0.8rem; color:#1e3a8a; text-transform:uppercase;";
            h.innerText = item[2] || "Varie";
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
    val += amount;
    if (val < 1) val = 1;
    input.value = val;
}

function openQtyModal(tipo) {
    document.getElementById('modal-title').innerText = tipo === "carico" ? "📦 Carico" : "📤 Scarico";
    document.getElementById('prod-category-badge').innerText = currentProduct.category || "Nuovo";
    document.getElementById('prod-name-display').innerText = currentProduct.name || "Prodotto";
    document.getElementById('qty-input').value = "1";
    document.getElementById('modal-qty').style.display = 'flex';
    document.getElementById('btn-conferma-azione').onclick = () => submitOperation(tipo);
}

async function submitOperation(tipo) {
    const q = parseInt(document.getElementById('qty-input').value);
    if (tipo === "scarico" && q > currentProduct.quantity) {
        showToast("Giacenza insufficiente!", "error"); return;
    }

    closeModals();
    showLoading(true, "Salvataggio in corso...");
    
    try {
        const resp = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateStock',
                barcode: currentProduct.barcode,
                name: currentProduct.name,
                category: currentProduct.category,
                quantity: tipo === "carico" ? q : -q,
                row: getRowIndex(currentProduct.barcode)
            })
        });
        const res = await resp.json();
        showLoading(false);
        if(res.success) {
            showToast("Aggiornato con successo!");
            if(isInventoryView) loadInventory(); else setTimeout(goToHome, 1000);
        } else { showToast(res.error, "error"); }
    } catch (e) { showLoading(false); showToast("Errore salvataggio", "error"); }
}

function getRowIndex(barcode) {
    const idx = fullInventoryData.findIndex(i => String(i[0]) === String(barcode));
    return idx !== -1 ? idx + 2 : null;
}

function quickAction(b, n, c, q, t) {
    currentProduct = { barcode: b, name: n, category: c, quantity: q };
    openQtyModal(t);
}

function openNewProductModal() {
    showLoading(true, "Preparazione anagrafica...");
    fetch(GAS_URL, {method:'POST', body:JSON.stringify({action:'getCategories'})})
    .then(r => r.json()).then(cats => {
        const n = document.getElementById('new-prod-category');
        n.innerHTML = '<option value="" disabled selected>Scegli...</option>';
        cats.forEach(c => n.innerHTML += `<option value="${c}">${c}</option>`);
        n.innerHTML += `<option value="NEW">➕ Nuova categoria...</option>`;
        showLoading(false);
        document.getElementById('modal-new-product').style.display = 'flex';
    });
}

function checkNewCategory(selectObj) {
    if (selectObj.value === "NEW") {
        let newCat = prompt("Inserisci il nome della nuova categoria:");
        if (newCat) {
            newCat = newCat.trim().toUpperCase();
            const option = document.createElement("option");
            option.text = newCat;
            option.value = newCat;
            selectObj.add(option, selectObj.options[selectObj.options.length - 1]);
            selectObj.value = newCat;
        } else {
            selectObj.selectedIndex = 0;
        }
    }
}

function saveNewProductAnagrafica() {
    const n = document.getElementById('new-prod-name').value;
    const c = document.getElementById('new-prod-category').value;
    if(!n || !c) { showToast("Compila tutto!", "error"); return; }
    currentProduct.name = n; currentProduct.category = c;
    closeModals(); openQtyModal("carico");
}
