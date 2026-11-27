// 排友圈离线缓存：页面文件先用手机里的缓存秒开，同时在后台更新（下次打开生效）。接口请求不经过这里。
const CACHE = 'pyq-v13';
const SHELL = ['./', 'index.html', 'style.css?v=13', 'app.js?v=13', 'config.js?v=13', 'manifest.webmanifest', 'img/logo.png', 'img/favicon.png', 'img/icon-192.png', 'img/ball-line.svg'];
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

// 新消息推送：弹通知并更新桌面图标数字
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  const tasks = [self.registration.showNotification(d.title || '排友圈', {
    body: d.body || '你有一条新消息', icon: 'img/icon-192.png', badge: 'img/icon-192.png',
    tag: d.url || 'pyq', renotify: true, data: { url: d.url || '#/msg' },
  })];
  if (self.navigator && self.navigator.setAppBadge && d.badge != null) tasks.push(d.badge ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge());
  e.waitUntil(Promise.all(tasks).catch(() => {}));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const hash = (e.notification.data && e.notification.data.url) || '#/msg';
  const url = new URL('./', self.registration.scope).href + hash;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)) { c.postMessage({ open: hash }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
