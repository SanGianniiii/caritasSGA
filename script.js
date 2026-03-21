const GAS_URL = "INCOLLA_QUI_IL_TUO_URL_DI_GOOGLE_APPS_SCRIPT";
let html5QrCode;
let currentProduct = null;

function showScanner() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('scanner-container').style.display = 'block';
    
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start(
        { facingMode: "environment" }, 
        { fps: 10, qrbox: { width: 250, height: 150 } },
        onScanSuccess
    );
}

async function onScanSuccess(decodedText) {
    await html5QrCode.stop();
    document.getElementById('scanner-container').style.display = 'none';
    
    // 1. Cerca nel foglio Google
    let response = await fetch(GAS_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'checkProduct', barcode: decodedText })
    });
    let product = await response.json();

    if (product) {
        currentProduct = { ...product, barcode: decodedText };
        openModal(product.name, decodedText);
    } else {
        // 2. Se non c'è, cerca su Open Food Facts
        let offResp = await fetch(`https://world.openfoodfacts.org/api/v0/product/${decodedText}.json`);
        let offData = await offResp.json();
        let name = (offData.status === 1) ? offData.product.product_name : prompt("Prodotto nuovo! Inserisci nome:");
        
        currentProduct = { name: name, barcode: decodedText, row: null };
        openModal(name, decodedText);
    }
}

function openModal(name, barcode) {
    document.getElementById('prod-name').innerText = name;
    document.getElementById('prod-barcode').innerText = "Cod: " + barcode;
    document.getElementById('modal').style.display = 'flex';
}

async function saveStock() {
    const qty = document.getElementById('qty-input').value;
    await fetch(GAS_URL, {
        method: 'POST',
        body: JSON.stringify({
            action: 'updateStock',
            barcode: currentProduct.barcode,
            name: currentProduct.name,
            quantity: qty,
            row: currentProduct.row
        })
    });
    closeModal();
    alert("Giacenza aggiornata!");
    showMenu();
}

async function loadInventory() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('inventory-container').style.display = 'block';
    const list = document.getElementById('inventory-list');
    list.innerHTML = "Caricamento...";

    const resp = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'getInventory' }) });
    const data = await resp.json();
    
    list.innerHTML = data.map(item => `
        <li>
            <span><strong>${item[1]}</strong><br><small>${item[0]}</small></span>
            <span class="qty">${item[2]} pz</span>
        </li>
    `).join('');
}

function showMenu() {
    document.getElementById('main-menu').style.display = 'block';
    document.getElementById('inventory-container').style.display = 'none';
    document.getElementById('scanner-container').style.display = 'none';
}

function closeModal() { document.getElementById('modal').style.display = 'none'; }
function hideScanner() { if(html5QrCode) html5QrCode.stop(); showMenu(); }
