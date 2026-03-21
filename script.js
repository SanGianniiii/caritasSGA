// CONFIGURAZIONE: Incolla qui l'URL della tua Web App pubblicata su Google Apps Script
const GAS_URL = "https://script.google.com/macros/s/AKfycbyii0LB2JBDbe_oS2wTon6bdQXm2zQwgtq6WffvXkXyRIOfetG8jkK2qjUOlNsVpPvd/exec";

let html5QrCode;
let currentProduct = null;

/**
 * Mostra lo scanner e attiva la fotocamera
 */
function showScanner() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('inventory-container').style.display = 'none';
    document.getElementById('scanner-container').style.display = 'block';
    
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start(
        { facingMode: "environment" }, 
        { 
            fps: 10, 
            qrbox: { width: 250, height: 150 },
            aspectRatio: 1.0
        },
        onScanSuccess
    ).catch(err => {
        alert("Errore fotocamera: " + err);
        showMenu();
    });
}

/**
 * Gestisce il successo della scansione
 */
async function onScanSuccess(decodedText) {
    // Vibrazione feedback (se supportata)
    if (navigator.vibrate) navigator.vibrate(100);
    
    await html5QrCode.stop();
    document.getElementById('scanner-container').style.display = 'none';
    
    // Mostra un caricamento temporaneo
    document.getElementById('main-menu').innerHTML = "<p>🔍 Ricerca prodotto " + decodedText + "...</p>";
    document.getElementById('main-menu').style.display = 'block';

    try {
        // 1. Cerca nel tuo Google Sheet
        let response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'checkProduct', barcode: decodedText })
        });
        let product = await response.json();

        if (product) {
            currentProduct = { ...product, barcode: decodedText };
            openModal(product.name, decodedText);
        } else {
            // 2. Se non c'è, cerca nel database mondiale Open Food Facts
            let offResp = await fetch(`https://world.openfoodfacts.org/api/v0/product/${decodedText}.json`);
            let offData = await offResp.json();
            
            let name = (offData.status === 1 && offData.product.product_name) 
                       ? offData.product.product_name 
                       : prompt("Prodotto non trovato. Inserisci il nome manualmente:");
            
            if (name) {
                currentProduct = { name: name, barcode: decodedText, row: null };
                openModal(name, decodedText);
            } else {
                showMenu(); // Annullato dall'utente
            }
        }
    } catch (e) {
        alert("Errore di connessione: " + e);
        showMenu();
    }
}

/**
 * Apre il popup per inserire la quantità (con RESET del campo)
 */
function openModal(name, barcode) {
    document.getElementById('prod-name').innerText = name;
    document.getElementById('prod-barcode').innerText = "Cod: " + barcode;
    
    // RESET: svuota il campo così l'utente non deve cancellare numeri vecchi
    const input = document.getElementById('qty-input');
    input.value = ""; 
    
    document.getElementById('modal').style.display = 'flex';
    input.focus();
}

/**
 * Salva i dati dal Modal al Foglio Google
 */
async function saveStock() {
    const qty = document.getElementById('qty-input').value;
    if (!qty || isNaN(qty)) {
        alert("Inserisci una quantità valida");
        return;
    }

    // Feedback visivo sul tasto
    const btn = document.querySelector('.btn-save');
    const originalText = btn.innerText;
    btn.innerText = "Salvataggio...";
    btn.disabled = true;

    try {
        await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateStock',
                barcode: currentProduct.barcode,
                name: currentProduct.name,
                quantity: parseInt(qty),
                row: currentProduct.row
            })
        });
        closeModal();
        alert("✅ " + currentProduct.name + " aggiornato!");
    } catch (e) {
        alert("Errore durante il salvataggio");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
        showMenu();
    }
}

/**
 * Carica la lista completa con tasti +1 e -1
 */
async function loadInventory() {
    const list = document.getElementById('inventory-list');
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('inventory-container').style.display = 'block';
    list.innerHTML = "<div class='loader'>Caricamento giacenza...</div>";

    try {
        const resp = await fetch(GAS_URL, { 
            method: 'POST', 
            body: JSON.stringify({ action: 'getInventory' }) 
        });
        const data = await resp.json();
        
        if (data.length === 0) {
            list.innerHTML = "<p>La dispensa è vuota.</p>";
            return;
        }

        // Genera le card moderne con i tasti rapidi
        list.innerHTML = data.map((item, index) => {
            const barcode = item[0];
            const name = item[1];
            const qty = item[2];
            const rowId = index + 2; // Riga reale in Google Sheets

            return `
            <li class="inventory-card">
                <div class="prod-info">
                    <strong>${name}</strong>
                    <small>${barcode}</small>
                </div>
                <div class="qty-controls">
                    <button class="btn-qty btn-minus" onclick="quickUpdate('${barcode}', '${name}', -1, ${rowId})">-</button>
                    <span class="qty-val">${qty}</span>
                    <button class="btn-qty btn-plus" onclick="quickUpdate('${barcode}', '${name}', 1, ${rowId})">+</button>
                </div>
            </li>
            `;
        }).join('');
    } catch (e) {
        list.innerHTML = "<p>Errore nel caricamento: " + e + "</p>";
    }
}

/**
 * Aggiornamento rapido +1 / -1 senza aprire modal
 */
async function quickUpdate(barcode, name, change, row) {
    // Feedback visivo immediato sulla lista (opzionale)
    const cards = document.querySelectorAll('.inventory-card');
    // Trova la card specifica per dare un feedback
    
    try {
        await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateStock',
                barcode: barcode,
                name: name,
                quantity: change,
                row: row
            })
        });
        loadInventory(); // Ricarica la lista per mostrare il nuovo valore
    } catch (e) {
        alert("Errore aggiornamento rapido");
    }
}

/**
 * Funzioni di navigazione UI
 */
function showMenu() {
    // Ripristina l'HTML originale del menu se era stato cambiato dal messaggio di ricerca
    document.getElementById('main-menu').innerHTML = `
        <button onclick="showScanner()" class="btn-main">📸 SCAN PRODOTTO</button>
        <button onclick="loadInventory()" class="btn-main secondary">📦 VEDI GIACENZA</button>
    `;
    document.getElementById('main-menu').style.display = 'block';
    document.getElementById('inventory-container').style.display = 'none';
    document.getElementById('scanner-container').style.display = 'none';
    document.getElementById('modal').style.display = 'none';
}

function closeModal() { 
    document.getElementById('modal').style.display = 'none'; 
}

function hideScanner() { 
    if(html5QrCode) {
        html5QrCode.stop().then(() => showMenu());
    } else {
        showMenu();
    }
}
