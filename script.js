const GAS_URL = "https://script.google.com/macros/s/AKfycbyii0LB2JBDbe_oS2wTon6bdQXm2zQwgtq6WffvXkXyRIOfetG8jkK2qjUOlNsVpPvd/exec";
let html5QrCode;
let currentProduct = null;

// Funzione Notifica Personalizzata
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
    document.getElementById('scanner-container').style.display = 'block';
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onScanSuccess);
}

async function onScanSuccess(barcode) {
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
        currentProduct = { name: name, barcode: barcode, row: null };
    }
    openModal("carico");
}

function openModal(tipo, name = null, barcode = null, row = null) {
    if (name) currentProduct = { name, barcode, row };
    
    document.getElementById('modal-title').innerText = tipo === "carico" ? "Carica Merce" : "Scarica Merce";
    document.getElementById('prod-name').innerText = currentProduct.name;
    document.getElementById('prod-barcode').innerText = "Cod: " + currentProduct.barcode;
    document.getElementById('qty-input').value = "";
    document.getElementById('modal').style.display = 'flex';
    
    document.getElementById('btn-conferma-azione').onclick = () => inviaDati(tipo);
}

async function inviaDati(tipo) {
    const qty = document.getElementById('qty-input').value;
    if (!qty) return;
    
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
    
    closeModal();
    showSuccess(tipo === "carico" ? `Aggiunti ${qty} pz di ${currentProduct.name}` : `Scaricati ${qty} pz di ${currentProduct.name}`);
    
    if (tipo === "scarico") loadInventory(); else showMenu();
}

async function loadInventory() {
    const list = document.getElementById('inventory-list');
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('inventory-container').style.display = 'block';
    list.innerHTML = "<li>Caricamento...</li>";

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
}

function showMenu() { document.getElementById('main-menu').style.display = 'block'; document.getElementById('inventory-container').style.display = 'none'; document.getElementById('scanner-container').style.display = 'none'; }
function closeModal() { document.getElementById('modal').style.display = 'none'; }
function hideScanner() { if(html5QrCode) html5QrCode.stop(); showMenu(); }
