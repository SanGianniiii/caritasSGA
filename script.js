// INSERISCI QUI IL TUO URL GOOGLE APPS SCRIPT
const GAS_URL = "https://script.google.com/macros/s/AKfycbyii0LB2JBDbe_oS2wTon6bdQXm2zQwgtq6WffvXkXyRIOfetG8jkK2qjUOlNsVpPvd/exec";

let html5QrCode;
let currentProduct = null;
let globalCategories = [];
let fullInventoryData = [];

// Inizializzazione all'avvio
document.addEventListener("DOMContentLoaded", () => {
    fetchCategories();
});

// Utility
function showLoading(show) { document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none'; }
function closeModals() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }
function showMenu() { document.getElementById('main-menu').style.display = 'block'; document.getElementById('inventory-container').style.display = 'none'; document.getElementById('scanner-container').style.display = 'none'; }

function showToast(msg, isError = false) {
    const alertBox = document.getElementById('custom-alert');
    document.getElementById('alert-message').innerText = msg;
    document.getElementById('alert-icon-type').innerText = isError ? '❌' : '✅';
    alertBox.style.display = 'flex';
    setTimeout(() => alertBox.style.opacity = '1', 10);
    setTimeout(() => {
        alertBox.style.opacity = '0';
        setTimeout(() => alertBox.style.display = 'none', 300);
    }, 3000);
}

// ----------------------------------------------------
// GESTIONE CATEGORIE
// ----------------------------------------------------
async function fetchCategories() {
    try {
        const resp = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'getCategories' }) });
        globalCategories = await resp.json();
        updateCategorySelects();
    } catch (e) {
        console.error("Errore caricamento categorie:", e);
    }
}

function updateCategorySelects() {
    const filterSelect = document.getElementById('category-filter');
    const newProdSelect = document.getElementById('new-prod-category');
    
    // Reset Filter Select
    filterSelect.innerHTML = '<option value="ALL">📦 Tutte le categorie</option>';
    globalCategories.forEach(cat => filterSelect.innerHTML += `<option value="${cat}">${cat}</option>`);
    
    // Reset New Product Select
    newProdSelect.innerHTML = '<option value="" disabled selected>Seleziona una categoria...</option>';
    globalCategories.forEach(cat => newProdSelect.innerHTML += `<option value="${cat}">${cat}</option>`);
    newProdSelect.innerHTML += '<option value="NEW">➕ Aggiungi nuova categoria...</option>';
}

async function checkNewCategory(selectObj) {
    if (selectObj.value === "NEW") {
        const newCatName = prompt("Inserisci il nome della NUOVA categoria:");
        if (newCatName && newCatName.trim() !== "") {
            showLoading(true);
            try {
                await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'addCategory', newCategory: newCatName.trim() }) });
                globalCategories.push(newCatName.trim());
                globalCategories.sort(); // Ordina alfabeticamente
                updateCategorySelects();
                selectObj.value = newCatName.trim();
                showToast("Categoria aggiunta!");
            } catch (e) { alert("Errore salvataggio categoria."); }
            showLoading(false);
        } else {
            selectObj.value = ""; // Reset
        }
    }
}

// ----------------------------------------------------
// SCANNER E RICERCA PRODOTTO
// ----------------------------------------------------
function showScanner() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('scanner-container').style.display = 'flex';
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start(
        { facingMode: "environment" }, 
        { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.0 }, 
        onScanSuccess
    );
}

function hideScanner() {
    if(html5QrCode) {
        html5QrCode.stop().then(() => showMenu()).catch(err => showMenu());
    } else {
        showMenu();
    }
}

async function onScanSuccess(barcode) {
    await html5QrCode.stop();
    document.getElementById('scanner-container').style.display = 'none';
    showLoading(true);
    
    try {
        let resp = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'checkProduct', barcode: barcode }) });
        let product = await resp.json();
        
        if (product) {
            // Prodotto noto, vai diretto al carico (o scelta se carico/scarico)
            currentProduct = { ...product, barcode: barcode, isNew: false };
            openQtyModal("carico"); // Default carico da scan, ma puoi personalizzarlo
        } else {
            // Prodotto sconosciuto, cerca su OpenFoodFacts per autocompletare il nome
            let offResp = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
            let offData = await offResp.json();
            let suggestedName = (offData.status === 1) ? offData.product.product_name : "";
            
            currentProduct = { barcode: barcode, isNew: true };
            openNewProductModal(suggestedName);
        }
    } catch (e) { 
        showToast("Errore di rete durante la verifica", true); 
        showMenu();
    }
    showLoading(false);
}

// ----------------------------------------------------
// FLUSSO MODALI (NUOVO PRODOTTO -> QUANTITA)
// ----------------------------------------------------
function openNewProductModal(suggestedName) {
    document.getElementById('new-prod-name').value = suggestedName || "";
    document.getElementById('new-prod-category').value = "";
    document.getElementById('modal-new-product').style.display = 'flex';
}

function saveNewProductAnagrafica() {
    const name = document.getElementById('new-prod-name').value;
    const cat = document.getElementById('new-prod-category').value;
    
    if (!name || name.trim() === "") { alert("Inserisci un nome prodotto."); return; }
    if (!cat || cat === "" || cat === "NEW") { alert("Seleziona una categoria valida."); return; }

    currentProduct.name = name.trim();
    currentProduct.category = cat;
    currentProduct.row = null; // Indica che deve essere appeso a fine foglio
    
    closeModals();
    openQtyModal("carico"); // Passa allo step quantità
}

function openQtyModal(tipo) {
    // tipo = "carico" o "scarico"
    document.getElementById('modal-title').innerText = tipo === "carico" ? "📥 Carica in Dispensa" : "📤 Preleva da Dispensa";
    document.getElementById('prod-category-badge').innerText = currentProduct.category;
    document.getElementById('prod-name-display').innerText = currentProduct.name;
    document.getElementById('qty-input').value = "1";
    
    document.getElementById('modal-qty').style.display = 'flex';
    document.getElementById('btn-conferma-azione').onclick = () => submitOperation(tipo);
    
    // Colora il tasto rosso se è scarico per sicurezza visiva
    const btnConfirm = document.getElementById('btn-conferma-azione');
    if(tipo === "scarico") {
        btnConfirm.style.backgroundColor = "var(--danger)";
        btnConfirm.innerText = "Conferma Prelievo";
    } else {
        btnConfirm.style.backgroundColor = "var(--primary)";
        btnConfirm.innerText = "Conferma Carico";
    }
}

function changeQty(amount) {
    const input = document.getElementById('qty-input');
    let val = parseInt(input.value) || 0;
    val += amount;
    if (val < 1) val = 1; // impedisce 0 o negativi da UI
    input.value = val;
}

async function submitOperation(tipo) {
    const qtyStr = document.getElementById('qty-input').value;
    const qty = parseInt(qtyStr);
    if (!qty || qty <= 0) { alert("Inserisci una quantità valida!"); return; }

    closeModals();
    showLoading(true);
    
    const finalQty = tipo === "carico" ? qty : -qty;
    
    try {
        await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateStock',
                barcode: currentProduct.barcode,
                name: currentProduct.name,
                category: currentProduct.category,
                quantity: finalQty,
                row: currentProduct.row
            })
        });
        
        showLoading(false);
        showToast(tipo === "carico" ? `Aggiunti ${qty} pz` : `Prelevati ${qty} pz`);
        
        // Se eravamo nell'inventario e abbiamo fatto uno scarico, ricarichiamo
        if (tipo === "scarico") {
            loadInventory(); 
        } else {
            showMenu();
        }
    } catch (e) {
        showLoading(false);
        showToast("Errore di invio dati", true);
    }
}

// ----------------------------------------------------
// INVENTARIO E FILTRI
// ----------------------------------------------------
async function loadInventory() {
    showLoading(true);
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('inventory-container').style.display = 'block';
    
    try {
        const resp = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'getInventory' }) });
        fullInventoryData = await resp.json(); // Salva in RAM per filtrare
        renderInventory();
    } catch (e) {
        showToast("Errore caricamento", true);
    }
    showLoading(false);
}

function renderInventory() {
    const list = document.getElementById('inventory-list');
    const filterCat = document.getElementById('category-filter').value;
    
    list.innerHTML = "";
    let itemCount = 0;

    fullInventoryData.forEach((item, index) => {
        // item = [Barcode, Nome, Categoria, Qta]
        const cat = item[2] || "Non definita";
        
        if (filterCat === "ALL" || filterCat === cat) {
            itemCount++;
            const li = document.createElement('li');
            li.className = "inventory-card";
            li.innerHTML = `
                <div class="prod-info">
                    <span class="badge">${cat}</span>
                    <span class="prod-name">${item[1]}</span>
                </div>
                <div class="qty-box">
                    <span class="qty-number">${item[3]}</span>
                    <span class="qty-label">PZ</span>
                </div>
            `;
            // Cliccando la card, permette lo scarico manuale
            li.onclick = () => {
                currentProduct = { barcode: item[0], name: item[1], category: item[2], row: index + 2 };
                openQtyModal("scarico");
            };
            list.appendChild(li);
        }
    });

    document.getElementById('total-items').innerText = itemCount;
    if (itemCount === 0) {
        list.innerHTML = "<p style='text-align:center; padding:20px; color:var(--secondary)'>Nessun prodotto trovato in questa categoria.</p>";
    }
}
