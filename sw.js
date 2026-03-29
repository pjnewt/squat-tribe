self.addEventListener('install',e=>{
 e.waitUntil(caches.open('v1.6.8').then(c=>c.addAll(['./'])));
});
