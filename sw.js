self.addEventListener('install', (e) => {
    console.log('[Service Worker] Installato');
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    console.log('[Service Worker] Attivato');
});

self.addEventListener('fetch', (e) => {
    // Per ora facciamo passare tutte le richieste di rete normalmente.
    // Questo è il minimo indispensabile per soddisfare i requisiti PWA.
});
