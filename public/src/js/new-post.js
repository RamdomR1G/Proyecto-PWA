var form = document.querySelector('#new-post-form');
var titleInput = document.querySelector('#title');
var locationInput = document.querySelector('#location');
var statusBar = document.querySelector('#connection-status');
var postButton = document.querySelector('#post-btn');

// ---------- Indicador de conexión ----------
function updateConnectionStatus() {
    if (navigator.onLine) {
        statusBar.className = 'online';
        statusBar.textContent = 'Conectado: tu post se publicará al instante';
    } else {
        statusBar.className = 'offline';
        statusBar.textContent = 'Sin conexión: tu post se guardará y se publicará al reconectarte';
    }
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
updateConnectionStatus();

// ---------- Avisos ----------
function showToast(message) {
    var snackbarContainer = document.querySelector('#confirmation-toast');
    if (snackbarContainer && snackbarContainer.MaterialSnackbar) {
        snackbarContainer.MaterialSnackbar.showSnackbar({ message: message });
    } else {
        alert(message);
    }
}

function goToFeed() {
    setTimeout(function () {
        window.location.href = '/';
    }, 1500);
}

// ---------- Guardar para publicar después ----------
function saveForLater(post) {
    return writeData('sync-posts', post)
        .then(function () {
            if ('serviceWorker' in navigator && 'SyncManager' in window) {
                // El Service Worker lo publica en cuanto haya red
                return navigator.serviceWorker.ready
                    .then(function (sw) {
                        return sw.sync.register('sync-new-posts');
                    })
                    .catch(function (err) {
                        // Permiso de Background Sync bloqueado: no pasa nada,
                        // el post ya está guardado y app.js lo envía al reconectar
                        console.log('Background Sync no permitido, se enviará desde la página', err);
                    });
            }
            // Sin Background Sync: app.js lo publica al detectar 'online'
        });
}

// ---------- Enviar ----------
form.addEventListener('submit', function (event) {
    event.preventDefault();

    var title = titleInput.value.trim();
    var location = locationInput.value.trim();

    if (title === '' || location === '') {
        showToast('Escribe un título y una ubicación');
        return;
    }

    var post = {
        id: new Date().toISOString(),
        title: title,
        location: location,
        image: DEFAULT_POST_IMAGE // imagen del bucket de Supabase
    };

    postButton.disabled = true;

    function queueOffline(message) {
        return saveForLater(post)
            .then(function () {
                showToast(message);
                goToFeed();
            })
            .catch(function (err) {
                console.log('Error al guardar el post', err);
                showToast('No se pudo guardar el post');
                postButton.disabled = false;
            });
    }

    if (navigator.onLine) {
        // Con conexión: se publica directo y al llegar al feed ya aparece
        postButton.textContent = 'Publicando...';
        sendPost(post)
            .then(function () {
                showToast('¡Post publicado!');
                goToFeed();
            })
            .catch(function (err) {
                // Se cayó la red a medio envío: se guarda y se sincroniza después
                console.log('Falló el envío, se guarda para después', err);
                queueOffline('No se pudo publicar ahora; se enviará solo al reconectarte');
            });
    } else {
        // Sin conexión: se guarda en IndexedDB y se sincroniza al volver la red
        queueOffline('Sin conexión: tu post se publicará solo al reconectarte');
    }
});