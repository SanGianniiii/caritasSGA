const GAS_URL = "https://script.google.com/macros/s/AKfycbyii0LB2JBDbe_oS2wTon6bdQXm2zQwgtq6WffvXkXyRIOfetG8jkK2qjUOlNsVpPvd/exec";

let html5QrCode;
let currentProduct = null;
let globalCategories = [];
let fullInventoryData = [];

document.addEventListener("DOMContentLoaded", fetchCategories);

function showLoading(s) { document.getElementById('loading-overlay').style.display = s ? 'flex' : 'none'; }
function closeModals() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }
function showMenu() { 
    document.getElementById('main-menu').style.display = 'block'; 
    document.getElementById('inventory-container').style.display = 'none'; 
    document.getElementById('scanner-container').style.display = 'none'; 
}

function showToast(m, err = false) {
    const b = document.getElementById('custom-alert');
    document.getElementById('alert-message').innerText = m;
    document.getElementById('alert-icon-type').innerText = err ? '❌' : '✅';
    b.style.display = 'flex'; b.style.opacity = '1';
    setTimeout(() => { b.style.opacity = '0'; setTimeout(() => b.style.display = 'none', 300); }, 2500);
}

async function fetchCategories() {
    try {
        const r = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'getCategories' }) });
        globalCategories = await r.json();
        const f = document.getElementById('category-filter');
        const n = document.getElementById('new-prod-category');
        f.innerHTML = '<option value="ALL">📦 Tutte le categorie</option>';
        n.innerHTML = '<option value="" disabled selected>Scegli categoria...</option>';
        globalCategories.forEach(c => {
            f.innerHTML += `<option value="${c}">${c}</option>`;
            n.innerHTML += `<option value="${c}">${c}</option>`;
        });
        n.innerHTML += `<option value="NEW">➕ Aggiungi nuova...</option>`;
    } catch (e) { console.error(e); }
}

async function checkNewCategory(s) {
    if (s.value === "NEW") {
        const n = prompt("Nome nuova categoria:");
        if (n) {
            showLoading(true);
            await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'addCategory', newCategory: n }) });
            await fetchCategories();
            s.value = n;
            showLoading(false);
        } else { s.value = ""; }
    }
}

function showScanner() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('scanner-container').style.display = 'flex';
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onScanSuccess);
}

function hideScanner() { if(html5QrCode) html5QrCode.stop().then(showMenu); else showMenu(); }

async function onScanSuccess(barcode) {
    await html5QrCode.stop();
    document.getElementById('scanner-container').style.display = 'none';
    showLoading(true);
    try {
        let r = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'checkProduct', barcode: barcode }) });
        let p = await r.json();
        if (p && p.name) {
            currentProduct = { ...p, isNew: false };
            showLoading(false);
            openQtyModal("carico");
        } else {
            let offName = "";
            try {
                let off = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
                let d = await off.json();
                if (d.status === 1) offName = d.product.product_name;
            } catch(e) {}
            currentProduct = { barcode: barcode, isNew: true };
            showLoading(false);
            openNewProductModal(offName);
        }
    } catch (e) { showLoading(false); showMenu(); }
}

function openNewProductModal(name) {
    const i = document.getElementById('new-prod-name');
    i.value = name; i.classList.remove('input-error');
    document.getElementById('new-prod-category').value = "";
    document.getElementById('modal-new-product').style.display = 'flex';
}

function saveNewProductAnagrafica() {
    const n = document.getElementById('new-prod-name');
    const c = document.getElementById('new-prod-category').value;
    if (!n.value) { n.classList.add('input-error'); setTimeout(()=>n.classList.remove('input-error'), 500); return; }
    if (!c || c === "NEW") return;
    currentProduct.name = n.value; currentProduct.category = c; currentProduct.row = null;
    closeModals(); openQtyModal("carico");
}

function openQtyModal(tipo) {
    document.getElementById('modal-title').innerText = tipo === "carico" ? "📥 Carico" : "📤 Scarico";
    document.getElementById('prod-category-badge').innerText = currentProduct.category;
    document.getElementById('prod-name-display').innerText = currentProduct.name;
    document.getElementById('qty-input').value = "1";
    document.getElementById('modal-qty').style.display = 'flex';
    const btn = document.getElementById('btn-conferma-azione');
    btn.style.background = tipo === "carico" ? "var(--success)" : "var(--danger)";
    btn.onclick = () => submitOperation(tipo);
}

function changeQty(v) {
    const i = document.getElementById('qty-input');
    let val = parseInt(i.value) || 0;
    val += v; if (val < 1) val = 1;
    i.value = val;
}

async function submitOperation(tipo) {
    const q = parseInt(document.getElementById('qty-input').value);
    closeModals(); showLoading(true);
    try {
        await fetch(GAS_URL, {
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
        showLoading(false);
        showToast("Operazione completata!");
        if (tipo === "scarico") loadInventory(); else showMenu();
    } catch (e) { showLoading(false); showToast("Errore", true); }
}

async function loadInventory() {
    showLoading(true);
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('inventory-container').style.display = 'block';
    try {
        const r = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'getInventory' }) });
        fullInventoryData = await r.json();
        renderInventory();
    } catch (e) { showToast("Errore", true); }
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
            h.className = "category-group-header";
            h.innerText = item[2] || "Varie";
            list.appendChild(h);
            lastCat = item[2];
        }

        const li = document.createElement('li');
        li.className = "inventory-card";
        li.innerHTML = `
            <div class="prod-info">
                <span class="prod-name">${item[1]}</span>
                <small>Giacenza: <b>${item[3]}</b></small>
            </div>
            <div class="action-buttons">
                <button class="btn-quick sub" onclick="quick('${item[0]}','${item[1]}','${item[2]}','scarico', ${fullInventoryData.indexOf(item)})">TOGLI</button>
                <button class="btn-quick add" onclick="quick('${item[0]}','${item[1]}','${item[2]}','carico', ${fullInventoryData.indexOf(item)})">AGGIUNGI</button>
            </div>`;
        list.appendChild(li);
    });
}

function quick(b, n, c, t, idx) {
    currentProduct = { barcode: b, name: n, category: c, row: idx + 2 };
    openQtyModal(t);
}
