const CACHE = 'squat-tribe-v16';
const ASSETS = [
  './',
  './index.html',
  './styles.v1.6.3.css',
  './app.v1.6.3.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './back.png',
  './bulgarian.png',
  './front.png',
  './side_step.png',
  './sumo.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
