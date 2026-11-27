var shareImageButton = document.querySelector('#share-image-button');
var sharedMomentsArea = document.querySelector('#shared-moments');

// SUPABASE_URL, SUPABASE_BUCKET, POSTS_URL, SUPABASE_HEADERS, readAllData...
// vienen de utility.js

var networkDataReceived = false;
var DEFAULT_IMAGE = DEFAULT_POST_IMAGE; // imagen del bucket (definida en utility.js)

// ---------- Botón "+" → página para crear post ----------
shareImageButton.addEventListener('click', function () {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function (choiceResult) {
            console.log(choiceResult.outcome);
            deferredPrompt = null;
            window.location.href = '/new-post.html';
        });
    } else {
        window.location.href = '/new-post.html';
    }
});

// ---------- Tarjetas ----------
function clearCards() {
    while (sharedMomentsArea.hasChildNodes()) {
        sharedMomentsArea.removeChild(sharedMomentsArea.lastChild);
    }
}

function getImageUrl(data) {
    if (data.picture) {
        // Post pendiente: la imagen sigue guardada en IndexedDB
        return URL.createObjectURL(data.picture);
    }
    if (!data.image) {
        return DEFAULT_IMAGE;
    }
    if (data.image.indexOf('http') !== 0) {
        // Solo hay nombre de archivo: armar la URL pública del bucket
        return SUPABASE_URL + '/storage/v1/object/public/' + SUPABASE_BUCKET + '/' + encodeURIComponent(data.image);
    }
    return data.image;
}

function createCard(data, isPending) {
    var cardWrapper = document.createElement('div');
    cardWrapper.className = 'shared-moment-card mdl-card mdl-shadow--2dp';
    cardWrapper.style.maxWidth = '450px';
    cardWrapper.style.width = '90%';
    cardWrapper.style.margin = '16px auto';
    cardWrapper.style.padding = '16px';
    cardWrapper.style.border = '1px solid #ddd';
    cardWrapper.style.borderRadius = '16px';
    cardWrapper.style.overflow = 'hidden';
    cardWrapper.style.backgroundColor = 'white';
    cardWrapper.style.boxShadow = '0 2px 2px #ccc';
    cardWrapper.style.cursor = 'pointer';
    cardWrapper.style.transform = 'translateY(0)';
    cardWrapper.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
    if (isPending) {
        cardWrapper.style.opacity = '0.7';
    }

    cardWrapper.addEventListener('mouseenter', function () {
        cardWrapper.style.transform = 'translateY(-5px)';
        cardWrapper.style.boxShadow = '0 4px 4px #ccc';
    });
    cardWrapper.addEventListener('mouseleave', function () {
        cardWrapper.style.transform = 'translateY(0)';
        cardWrapper.style.boxShadow = '0 2px 2px #ccc';
    });

    var cardTitle = document.createElement('div');
    cardTitle.className = 'mdl-card__title';
    cardTitle.style.backgroundImage = 'url("' + getImageUrl(data) + '")';
    cardTitle.style.backgroundSize = 'cover';
    cardTitle.style.backgroundPosition = 'center';
    cardTitle.style.height = '180px';
    cardWrapper.appendChild(cardTitle);

    var cardTitleTextElement = document.createElement('h2');
    cardTitleTextElement.className = 'mdl-card__title-text';
    cardTitleTextElement.style.color = 'white';
    cardTitleTextElement.textContent = data.title || 'Sin título';
    cardTitle.appendChild(cardTitleTextElement);

    var cardSupportingText = document.createElement('div');
    cardSupportingText.className = 'mdl-card__supporting-text';
    cardSupportingText.style.textAlign = 'center';
    cardSupportingText.textContent = data.location || '';
    cardWrapper.appendChild(cardSupportingText);

    if (isPending) {
        var pendingLabel = document.createElement('div');
        pendingLabel.style.textAlign = 'center';
        pendingLabel.style.fontSize = '13px';
        pendingLabel.style.color = '#e65100';
        pendingLabel.textContent = 'Pendiente de publicar (se enviará al reconectarte)';
        cardWrapper.appendChild(pendingLabel);
    }

    if (window.componentHandler) {
        componentHandler.upgradeElement(cardWrapper);
    }
    sharedMomentsArea.appendChild(cardWrapper);
}

// Pinta primero los pendientes y después los publicados
function updateUI(posts) {
    readAllData('sync-posts')
        .catch(function () {
            return [];
        })
        .then(function (pending) {
            clearCards();
            for (var i = 0; i < pending.length; i++) {
                createCard(pending[i], true);
            }
            for (var j = 0; j < posts.length; j++) {
                createCard(posts[j], false);
            }
        });
}

// ---------- Cargar posts ----------
function loadPosts() {
    networkDataReceived = false;

    fetch(POSTS_URL + '?select=*&order=created_at.desc', {
        headers: SUPABASE_HEADERS
    })
        .then(function (res) {
            if (!res.ok) {
                throw new Error('Supabase respondió ' + res.status);
            }
            return res.json();
        })
        .then(function (data) {
            networkDataReceived = true;
            console.log('From web', data);
            updateUI(data);
        })
        .catch(function (err) {
            console.log('Sin conexión, usando IndexedDB', err);
        });

    if ('indexedDB' in window) {
        readAllData('posts')
            .then(function (data) {
                if (!networkDataReceived) {
                    console.log('From IndexedDB', data);
                    updateUI(data);
                }
            });
    }
}

loadPosts();

// 1) Aviso inmediato: el Service Worker (o app.js) avisa al terminar de publicar
if (postsChannel) {
    postsChannel.addEventListener('message', function (event) {
        if (event.data && event.data.type === 'posts-synced') {
            console.log('Posts sincronizados, actualizando feed');
            loadPosts();
        }
    });
}

// 2) Respaldo: revisar los pendientes cada 3 segundos. Si alguno ya se
//    publicó (desapareció de IndexedDB), se actualiza el feed solo.
var lastPendingCount = null;

function checkPendingPosts() {
    readAllData('sync-posts')
        .then(function (pending) {
            if (lastPendingCount !== null && pending.length < lastPendingCount) {
                console.log('Un post pendiente ya se publicó, actualizando feed');
                loadPosts();
            }
            lastPendingCount = pending.length;
        })
        .catch(function () {});
}

checkPendingPosts();
setInterval(checkPendingPosts, 3000);

// 3) Al volver la conexión, refrescar lo que haya en Supabase
window.addEventListener('online', function () {
    setTimeout(loadPosts, 1500);
});