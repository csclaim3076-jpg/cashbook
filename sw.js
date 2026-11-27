const V = 'cashbook-v2.1.0';
const FILES = ['./', './index.html', './xlsx.bundle.js', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // 앱 파일: 네트워크 우선(최신 반영), 실패 시 캐시(오프라인)
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(req, c)); return r; }).catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
  } else if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const c = res.clone(); caches.open(V).then(x => x.put(req, c)); return res; })));
  }
});
