const GAS_URL = "https://script.google.com/macros/s/AKfycbyii0LB2JBDbe_oS2wTon6bdQXm2zQwgtq6WffvXkXyRIOfetG8jkK2qjUOlNsVpPvd/exec";

let html5QrCode;
let currentProduct = null;
let fullInventoryData = [];
let isInventoryView = false;

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
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 3000);
}

function goToHome() { 
    closeModals();
    document.getElementById('scanner-container').style.display = 'none';
    document.getElementById('inventory-container').style.display = 'none';
    document.getElementById('main-menu').style.display = 'block';
    isInventoryView = false;
    showLoading(false); // Forza la chiusura di eventuali spinner rimasti
}

function closeModals() { 
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); 
}

function closeAndReturn() {
    closeModals();
    if (!isInventoryView) goToHome();
}

async function showScanner() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('scanner-container').style.display = 'block';
    html5QrCode = new Html5Qrcode("reader");
    try {
        await html5QrCode.start({ facingMode: "environment" }, { fps: 15, qrbox: 250 }, onScanSuccess);
    } catch (e) {
        showToast("Errore fotocamera", "error");
        goToHome();
    }
}

async function hideScanner() {
    if(html5QrCode && html5QrCode.isScanning) {
        await html5QrCode.stop();
        await html5QrCode.clear();
    }
    goToHome();
}

async function onScanSuccess(barcode) {
    // 1. Normalizzazione del barcode (lo trattiamo come testo puro)
    const cleanBarcode = barcode.toString().trim();
    
    showLoading(true, "Ricerca prodotto...");

    // 2. Fermiamo lo scanner immediatamente per liberare la memoria e la fotocamera
    if (html5QrCode) {
        try {
            await html5QrCode.stop();
            await html5QrCode.clear();
        } catch (err) {
            console.warn("Errore durante l'arresto dello scanner:", err);
        }
    }
    
    // Nascondiamo il contenitore dello scanner
    document.getElementById('scanner-container').style.display = 'none';
    
    try {
        // 3. Interrogazione al database (Google Apps Script)
        let response = await fetch(GAS_URL, { 
            method: 'POST', 
            body: JSON.stringify({ action: 'checkProduct', barcode: cleanBarcode }) 
        });
        
        let productData = await response.json();
        showLoading(false);

        // 4. Controllo esistenza prodotto
        if (productData && productData.name) {
            // IL PRODOTTO ESISTE: popoliamo currentProduct con i dati salvati
            currentProduct = { 
                barcode: cleanBarcode, 
                name: productData.name, 
                category: productData.category, 
                quantity: productData.quantity,
                isNew: false 
            };
            
            // Apriamo direttamente il modale del carico senza chiedere nulla
            openQtyModal("carico");
            
        } else {
            // IL PRODOTTO NON ESISTE: prepariamo i dati per la nuova anagrafica
            currentProduct = { 
                barcode: cleanBarcode, 
                isNew: true 
            };
            
            // Apriamo il modale per inserire Nome e Categoria
            openNewProductModal();
        }
    } catch (e) {
        showLoading(false);
        showToast("Errore di rete o database", "error");
        console.error("Errore fetch:", e);
        // In caso di errore torniamo alla home per evitare il blocco dell'app
        goToHome();
    }
}

async function loadInventory() {
    showLoading(true, "Caricamento...");
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
    } catch (e) { showToast("Errore", "error"); }
    showLoading(false);
}

function renderInventory() {
    const list = document.getElementById('inventory-list');
    const filter = document.getElementById('category-filter').value;
    list.innerHTML = "";
    
    // Filtro righe vuote e ordinamento
    let sorted = fullInventoryData
        .filter(item => item[1] && item[1].toString().trim() !== "") // FIX: Salta righe vuote
        .sort((a,b) => (a[2] || "").localeCompare(b[2] || ""));

    let lastCat = null;
    sorted.forEach((item) => {
        if (filter !== "ALL" && item[2] !== filter) return;
        if (item[2] !== lastCat) {
            const h = document.createElement('div');
            h.style = "padding:10px 15px; background:#f1f5f9; font-weight:bold; color:var(--blue);";
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
    const barcodeStr = String(currentProduct.barcode);
    
    // Cerchiamo la riga aggiornata nel set di dati attuale
    const rowIndex = fullInventoryData.findIndex(row => String(row[0]) === barcodeStr);

    showLoading(true, "Salvataggio...");
    closeModals();

    try {
        const resp = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateStock',
                barcode: barcodeStr,
                name: currentProduct.name,
                category: currentProduct.category,
                quantity: tipo === "carico" ? q : -q,
                row: rowIndex !== -1 ? rowIndex + 2 : null
            })
        });
        const res = await resp.json();
        if(res.success) {
            showToast("Successo!");
            if(isInventoryView) loadInventory(); else goToHome();
        } else { showToast(res.error, "error"); showLoading(false); }
    } catch (e) { showToast("Errore connessione", "error"); showLoading(false); }
}

function quickAction(b, n, c, q, t) {
    currentProduct = { barcode: b, name: n, category: c, quantity: q };
    openQtyModal(t);
}

function openNewProductModal() {
    showLoading(true);
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
        let newCat = prompt("Nuova Categoria:");
        if (newCat) {
            newCat = newCat.trim().toUpperCase();
            const opt = document.createElement("option");
            opt.text = newCat; opt.value = newCat;
            selectObj.add(opt, selectObj.options[selectObj.options.length - 1]);
            selectObj.value = newCat;
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
