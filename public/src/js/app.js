var deferredPrompt;

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(function () {
            console.log('Service Worker registered!');
        })
        .catch(function (err) {
            console.log('Error al registrar el Service Worker', err);
        });
}

// Guarda el aviso de "instalar app" para mostrarlo después
window.addEventListener('beforeinstallprompt', function (event) {
    console.log('beforeinstallprompt fired');
    event.preventDefault();
    deferredPrompt = event;
    return false;
});

// ===== Envío de posts pendientes desde la página =====
// Funciona siempre, aunque el navegador no tenga Background Sync o tenga
// el permiso bloqueado. Si el Service Worker también los envía, no se
// duplican: utility.js ignora los que ya existen en Supabase.
var isSyncing = false;

function trySyncPendingPosts() {
    if (isSyncing || !navigator.onLine || typeof syncPendingPosts !== 'function') {
        return;
    }
    isSyncing = true;
    syncPendingPosts()
        .then(function (count) {
            if (count > 0) {
                console.log(count + ' post(s) pendientes publicados desde la página');
            }
        })
        .catch(function (err) {
            // La red aún no responde bien: se reintenta en el siguiente ciclo
            console.log('No se pudieron publicar los pendientes todavía', err);
        })
        .then(function () {
            isSyncing = false;
        });
}

// Al volver la conexión
window.addEventListener('online', function () {
    setTimeout(trySyncPendingPosts, 1000);
});

// Al abrir la página (por si quedó algo pendiente de otra visita)
trySyncPendingPosts();

// Y cada 10 segundos mientras la página esté abierta
setInterval(trySyncPendingPosts, 10000);