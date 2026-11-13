/* TUONTA offline worker. Change VERSION whenever you upload new app files. */
const VERSION = 'tuonta-v1.0.0';
const FILES = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/util.js', 'js/store.js', 'js/templates.js', 'js/srs.js', 'js/sync.js', 'js/editor.js', 'js/views.js', 'js/app.js',
  'fonts/pjs-400.woff2', 'fonts/pjs-600.woff2', 'fonts/pjs-700.woff2', 'fonts/pjs-800.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'vendor/firebase-app-compat.js', 'vendor/firebase-auth-compat.js', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.concat(['config.js']))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Google sign-in and Drive always go to the network
  // config.js: try the network first so a newly uploaded config is picked up
  if (url.pathname.endsWith('/config.js')) {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return r; }).catch(() => caches.match(req)));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  })));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '#/today';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { c.postMessage({ open: target }); return c.focus(); }
    return self.clients.openWindow('./' + target);
  }));
});
