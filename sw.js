const CACHE = 'squat-tribe-v1-5';
const ASSETS = [
  './',
  './index.html',
  './styles.v1.5.css',
  './app.v1.5.js',
  './manifest.json',
  './back.png',
  './bulgarian.png',
  './front.png',
  './side_step.png',
  './sumo.png',
  './icon-192.png',
  './icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(req).then(r => r || fetch(req)));
});
