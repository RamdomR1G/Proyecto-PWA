// ===== Configuración de Supabase (la usan feed.js y sw.js) =====
var SUPABASE_URL = 'https://tqebucnrgdkbclqlwgcy.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZWJ1Y25yZ2RrYmNscWx3Z2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMTEzNTMsImV4cCI6MjEwODg4NzM1M30.5V0jFhpGUH2opJPqn2afSwMi8ztHgT69cFn7FgPQKXk';
var SUPABASE_BUCKET = 'posts';
var POSTS_URL = SUPABASE_URL + '/rest/v1/posts';

// Imagen que usan todos los posts (está en el bucket "posts" de Supabase).
// Si cambias o renombras la imagen en el bucket, cambia solo este nombre.
var DEFAULT_IMAGE_NAME = 'wallpapersden.com_haven-game.jpg';
var DEFAULT_POST_IMAGE = SUPABASE_URL + '/storage/v1/object/public/' + 'posts' + '/' +
    encodeURIComponent(DEFAULT_IMAGE_NAME);
var SUPABASE_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY
};

// ===== IndexedDB =====
var dbPromise = idb.open('post-store', 1, function (db) {
    if (!db.objectStoreNames.contains('posts')) {
        db.createObjectStore('posts', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('sync-posts')) {
        db.createObjectStore('sync-posts', { keyPath: 'id' });
    }
});

function writeData(st, data) {
    return dbPromise.then(function (db) {
        var tx = db.transaction(st, 'readwrite');
        var store = tx.objectStore(st);
        store.put(data);
        return tx.complete;
    });
}

function readAllData(st) {
    return dbPromise.then(function (db) {
        var tx = db.transaction(st, 'readonly');
        var store = tx.objectStore(st);
        return store.getAll();
    });
}

function clearAllData(st) {
    return dbPromise.then(function (db) {
        var tx = db.transaction(st, 'readwrite');
        var store = tx.objectStore(st);
        store.clear();
        return tx.complete;
    });
}

function deleteItemFromData(st, id) {
    return dbPromise.then(function (db) {
        var tx = db.transaction(st, 'readwrite');
        var store = tx.objectStore(st);
        store.delete(id);
        return tx.complete;
    }).then(function () {
        console.log('Item deleted!');
    });
}

// ===== Supabase: subir imagen al bucket =====
function uploadImage(imageBlob, fileName) {
    return fetch(SUPABASE_URL + '/storage/v1/object/' + SUPABASE_BUCKET + '/' + fileName, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': imageBlob.type || 'image/png'
        },
        body: imageBlob
    })
    .then(function (res) {
        var publicUrl = SUPABASE_URL + '/storage/v1/object/public/' + SUPABASE_BUCKET + '/' + fileName;
        if (res.ok) {
            return publicUrl;
        }
        return res.text().then(function (t) {
            // Si un intento anterior ya la subió, no es error: se reutiliza
            if (res.status === 409 || /duplicate|already exists/i.test(t)) {
                return publicUrl;
            }
            throw new Error('Storage: ' + t);
        });
    });
}

// ===== Supabase: guardar un post en la tabla =====
function savePost(post) {
    return fetch(POSTS_URL, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify(post)
    })
    .then(function (res) {
        if (res.ok || res.status === 409) {
            // 409 = ese id ya existe: el post ya se había guardado antes
            return post;
        }
        return res.text().then(function (t) { throw new Error('Tabla posts: ' + t); });
    });
}

// ===== Aviso entre pestañas y Service Worker =====
// BroadcastChannel llega a todas las páginas abiertas del sitio,
// sin importar si se acaban de cargar o cambiar de página.
var postsChannel = ('BroadcastChannel' in self) ? new BroadcastChannel('uteqgram-posts') : null;

function notifyPostsSynced() {
    if (postsChannel) {
        postsChannel.postMessage({ type: 'posts-synced' });
    }
}

// ===== Enviar un post completo (imagen opcional + datos) =====
// post = { id, title, location, picture (Blob/File opcional) }
function sendPost(post) {
    var imagePromise;

    if (post.picture) {
        var ext = (post.picture.name && post.picture.name.split('.').pop()) || 'png';
        var fileName = post.id.replace(/[:.]/g, '-') + '.' + ext;
        imagePromise = uploadImage(post.picture, fileName);
    } else {
        // Sin archivo: se usa la imagen del bucket de Supabase
        imagePromise = Promise.resolve(DEFAULT_POST_IMAGE);
    }

    return imagePromise.then(function (imageUrl) {
        return savePost({
            id: post.id,
            title: post.title,
            location: post.location,
            image: imageUrl
        });
    });
}

// ===== Publicar todo lo que quedó pendiente en IndexedDB =====
// La usa el Service Worker (background sync) y, en navegadores sin
// Background Sync, la página cuando vuelve la conexión.
function syncPendingPosts() {
    return readAllData('sync-posts').then(function (data) {
        return Promise.all(data.map(function (dt) {
            return sendPost(dt).then(function () {
                console.log('Post sincronizado', dt.id);
                return deleteItemFromData('sync-posts', dt.id);
            });
        })).then(function () {
            if (data.length > 0) {
                notifyPostsSynced();
            }
            return data.length;
        });
    });
}