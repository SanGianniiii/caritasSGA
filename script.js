const GAS_URL = "IL_TUO_URL_DI_GOOGLE_APPS_SCRIPT";
let html5QrCode;
let currentProduct = null;

// Gestione Overlay Caricamento
function showLoading(show) {
    document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

function showSuccess(msg) {
    const alertBox = document.getElementById('custom-alert');
    document.getElementById('alert-message').innerText = msg;
    alertBox.style.display = 'flex';
    alertBox.style.opacity = '1';
    setTimeout(() => {
        alertBox.style.opacity = '0';
        setTimeout(() => alertBox.style.display = 'none', 500);
    }, 2500);
}

function showScanner() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('inventory-container').style.display = 'none';
    document.getElementById('scanner-container').style.display = 'block';
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onScanSuccess);
}

async function onScanSuccess(barcode) {
    showLoading(true);
    try {
        await html5QrCode.stop();
        document.getElementById('scanner-container').style.display = 'none';
        
        let resp = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'checkProduct', barcode: barcode }) });
        let product = await resp.json();

        if (product) {
            currentProduct = { ...product, barcode: barcode };
        } else {
            let offResp = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
            let offData = await offResp.json();
            let name = (offData.status === 1) ? offData.product.product_name : prompt("Nuovo prodotto! Nome:");
            if(!name) { showMenu(); return; }
            currentProduct = { name: name, barcode: barcode, row: null };
        }
        openModal("carico");
    } finally {
        showLoading(false);
    }
}

function openModal(tipo, name = null, barcode = null, row = null) {
    if (name) currentProduct = { name, barcode, row };
    document.getElementById('modal-title').innerText = tipo === "carico" ? "📥 Carica Merce" : "📤 Scarica Merce";
    document.getElementById('prod-name').innerText = currentProduct.name;
    document.getElementById('prod-barcode').innerText = "Cod: " + currentProduct.barcode;
    document.getElementById('qty-input').value = "";
    document.getElementById('modal').style.display = 'flex';
    document.getElementById('btn-conferma-azione').onclick = () => chiediConferma(tipo);
}

// NUOVA FUNZIONE DI CONFERMA
function chiediConferma(tipo) {
    const qty = document.getElementById('qty-input').value;
    if (!qty || qty <= 0) { alert("Inserisci una quantità valida!"); return; }

    const domanda = tipo === "carico" 
        ? `Sei sicuro di voler AGGIUNGERE ${qty} pezzi di "${currentProduct.name}"?` 
        : `Sei sicuro di voler SCARICARE ${qty} pezzi di "${currentProduct.name}"?`;

    if (confirm(domanda)) {
        inviaDati(tipo, qty);
    }
}

async function inviaDati(tipo, qty) {
    closeModal();
    showLoading(true); // Attiva lo spinner
    
    try {
        const finalQty = tipo === "carico" ? parseInt(qty) : -parseInt(qty);
        
        await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateStock',
                barcode: currentProduct.barcode,
                name: currentProduct.name,
                quantity: finalQty,
                row: currentProduct.row
            })
        });
        
        showSuccess(tipo === "carico" ? `✅ Aggiunti ${qty} pz` : `📤 Scaricati ${qty} pz`);
        
        if (tipo === "scarico") loadInventory(); else showMenu();
    } catch (e) {
        alert("Errore durante l'operazione. Riprova.");
    } finally {
        showLoading(false); // Nasconde lo spinner
    }
}

async function loadInventory() {
    const list = document.getElementById('inventory-list');
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('inventory-container').style.display = 'block';
    list.innerHTML = "<div class='loader'>Caricamento in corso...</div>";

    try {
        const resp = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'getInventory' }) });
        const data = await resp.json();
        list.innerHTML = data.map((item, index) => `
            <li class="inventory-card">
                <div class="prod-info">
                    <strong>${item[1]}</strong>
                    <small>${item[0]} — <b style="color:var(--primary)">${item[2]} pz</b></small>
                </div>
                <button class="btn-scarica" onclick="openModal('scarico', '${item[1]}', '${item[0]}', ${index + 2})">SCARICA</button>
            </li>
        `).join('');
    } catch (e) {
        list.innerHTML = "<li>Errore caricamento dati.</li>";
    }
}

function showMenu() { 
    document.getElementById('main-menu').style.display = 'block'; 
    document.getElementById('inventory-container').style.display = 'none'; 
    document.getElementById('scanner-container').style.display = 'none'; 
}
function closeModal() { document.getElementById('modal').style.display = 'none'; }
function hideScanner() { if(html5QrCode) { html5QrCode.stop(); showMenu(); } }
