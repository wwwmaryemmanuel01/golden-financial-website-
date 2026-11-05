/* Network-first shell cache. API traffic and credentials are never cached. */
'use strict';
const CACHE = 'gfs-rebuild-2026-11-05-v1';
const SHELL = ['./', './index.html', './css/theme.css', './css/rebuild.css', './js/core.js', './js/ui.js', './js/local.js', './js/api.js', './js/app.js', './js/public-pages.js', './js/auth-pages.js', './js/portal.js', './js/portal-money.js', './js/portal-account.js', './js/portal-support.js', './js/portal-extra.js', './js/boot.js', './assets/logo.png', './assets/favicon.ico', './assets/apple-touch-icon.png', './manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k.startsWith('gfs-')).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/') || url.pathname.endsWith('/runtime-config.json')) return;
  e.respondWith(fetch(e.request).then(response => {
    if (response.ok && !response.headers.get('cache-control')?.includes('no-store')) { const copy = response.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return response;
  }).catch(() => caches.match(e.request).then(cached => cached || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
