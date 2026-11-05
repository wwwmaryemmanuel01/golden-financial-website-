/* Golden Financial Services — service worker (PWA).
   Network-first for API and navigation; cache-first for static assets.
   Never caches authenticated API responses. */
const CACHE = 'gfs-v1';
const ASSETS = ['./', './index.html', './css/theme.css', './js/core.js', './js/ui.js', './js/api.js', './js/local.js', './js/app.js', './js/public-pages.js', './js/auth-pages.js', './js/portal.js', './js/portal-money.js', './js/portal-account.js', './js/portal-support.js', './assets/logo.png', './assets/favicon.ico', './manifest.webmanifest'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.includes('/api/')) return; // never cache API data
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return res; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => { if (res.ok && url.origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })));
});
