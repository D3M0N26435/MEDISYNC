// Sube el sufijo cuando cambien los estáticos del app shell.
const CACHE_NAME = 'medisync-shell-v5';
const APP_SHELL = [
    '/',
    '/static/css/main.css',
    '/static/css/login.css',
    '/static/css/auros.css',
    '/static/css/admin.css',
    '/static/css/clinical.css',
    '/static/css/emergency.css',
    '/static/css/patient.css',
    '/static/css/patient-card.css',
    '/static/css/pharmacist.css',
    '/static/css/doctor.css',
    '/static/css/chat.css',
    '/static/css/dispatcher.css',
    '/static/js/theme.js',
    '/static/js/pwa.js',
    '/static/js/roles.js',
    '/static/js/role-switcher.js',
    '/static/js/mobile-menu.js',
    '/static/js/map-utils.js',
    '/static/js/sos.js',
    '/static/js/qr-scanner.js',
    '/static/js/emergency-alerts.js',
    '/static/js/card-qr-scanner.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname === '/sw.js') return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
                    return response;
                })
                .catch(() => caches.match('/'))
        );
        return;
    }

    if (url.pathname.startsWith('/static/') || url.pathname === '/manifest.webmanifest') {
        // Red primero: los cambios de CSS/JS se ven sin tener que limpiar la caché a mano.
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => caches.match(request))
        );
    }
});
