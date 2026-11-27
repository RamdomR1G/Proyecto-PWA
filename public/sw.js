// Sube el número cada vez que cambies archivos del proyecto
var VERSION = 17;
var CACHE_STATIC_NAME = 'static-v' + VERSION;
var CACHE_DYNAMIC_NAME = 'dynamic-v' + VERSION;

// El "?v=" obliga a descargar la versión nueva y no una copia vieja
importScripts('/src/js/idb.js?v=' + VERSION);
importScripts('/src/js/utility.js?v=' + VERSION); // trae SUPABASE_URL, POSTS_URL, sendPost, etc.
var STATIC_FILES = [
    '/',
    '/index.html',
    '/new-post.html',
    '/offline.html',
    '/manifest.json',
    '/src/images/icons/app-icon-192x192.png',
    '/src/images/icons/app-icon-512x512.png',
    '/src/js/app.js',
    '/src/js/feed.js',
    '/src/js/new-post.js',
    '/src/js/idb.js',
    '/src/js/utility.js',
    '/src/js/material.min.js',
    '/src/css/app.css',
    '/src/css/feed.css',
    '/src/images/main-image.jpg',
    'https://fonts.googleapis.com/css?family=Roboto:400,700',
    'https://fonts.googleapis.com/icon?family=Material+Icons',
    'https://cdnjs.cloudflare.com/ajax/libs/material-design-lite/1.3.0/material.indigo-pink.min.css'
];

self.addEventListener('install', function (event) {
    console.log('[Service Worker] Installing Service Worker ...', event);
    // Activar el Service Worker nuevo de inmediato, sin esperar a cerrar pestañas
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_STATIC_NAME)
            .then(function (cache) {
                console.log('[Service Worker] Precaching App Shell');
                // cache: 'reload' = descargar del servidor, no de la caché del navegador
                var requests = STATIC_FILES.map(function (url) {
                    return url.indexOf('/') === 0 ? new Request(url, { cache: 'reload' }) : url;
                });
                return cache.addAll(requests);
            })
    );
});

self.addEventListener('activate', function (event) {
    console.log('[Service Worker] Activating Service Worker ....', event);
    event.waitUntil(
        caches.keys()
            .then(function (keyList) {
                return Promise.all(keyList.map(function (key) {
                    if (key !== CACHE_STATIC_NAME && key !== CACHE_DYNAMIC_NAME) {
                        console.log('[Service Worker] Removing old cache.', key);
                        return caches.delete(key);
                    }
                }));
            })
    );
    return self.clients.claim();
});

function isInArray(string, array) {
    var cachePath;
    if (string.indexOf(self.origin) === 0) {
        cachePath = string.substring(self.origin.length);
    } else {
        cachePath = string;
    }
    return array.indexOf(cachePath) > -1;
}

self.addEventListener('fetch', function (event) {
    // POST (subir imagen / crear post) y extensiones del navegador pasan directo
    if (event.request.method !== 'GET' || event.request.url.indexOf('http') !== 0) {
        return;
    }

    if (event.request.url.indexOf(POSTS_URL) > -1) {
        // Posts: red primero y se guardan en IndexedDB para offline
        event.respondWith(
            fetch(event.request)
                .then(function (res) {
                    var clonedRes = res.clone();
                    if (res.ok) {
                        clearAllData('posts')
                            .then(function () {
                                return clonedRes.json();
                            })
                            .then(function (data) {
                                for (var i = 0; i < data.length; i++) {
                                    writeData('posts', data[i]);
                                }
                            });
                    }
                    return res;
                })
        );
    } else if (isInArray(event.request.url, STATIC_FILES)) {
        // App shell: solo caché
        event.respondWith(
            caches.match(event.request)
        );
    } else {
        // Todo lo demás (incluye imágenes de Supabase Storage): caché, luego red
        event.respondWith(
            caches.match(event.request)
                .then(function (response) {
                    if (response) {
                        return response;
                    }
                    return fetch(event.request)
                        .then(function (res) {
                            return caches.open(CACHE_DYNAMIC_NAME)
                                .then(function (cache) {
                                    cache.put(event.request.url, res.clone());
                                    return res;
                                });
                        })
                        .catch(function (err) {
                            return caches.open(CACHE_STATIC_NAME)
                                .then(function (cache) {
                                    var accept = event.request.headers.get('accept');
                                    if (accept && accept.includes('text/html')) {
                                        return cache.match('/offline.html');
                                    }
                                });
                        });
                })
        );
    }
});

// Background sync: sube a Supabase los posts creados sin conexión
self.addEventListener('sync', function (event) {
    console.log('[Service Worker] Background syncing', event);
    if (event.tag === 'sync-new-posts') {
        console.log('[Service Worker] Syncing new Posts');
        event.waitUntil(
            syncPendingPosts()
                .then(function (count) {
                    // syncPendingPosts ya avisa a las páginas por BroadcastChannel
                    console.log('[Service Worker] Posts publicados:', count);
                })
            // Si algo falla, la promesa se rechaza y el navegador
            // reintenta el sync más tarde automáticamente
        );
    }
});