// 排友圈离线缓存：页面文件先用手机里的缓存秒开，同时在后台更新（下次打开生效）。接口请求不经过这里。
const CACHE = 'pyq-v1';
const SHELL = ['./', 'index.html', 'style.css?v=1', 'app.js?v=1', 'config.js?v=1', 'manifest.webmanifest', 'img/logo.png', 'img/favicon.png', 'img/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: e.request.mode === 'navigate' });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
