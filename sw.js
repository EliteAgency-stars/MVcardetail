// Service worker: shows MV Car Detail push notifications and opens the right page on tap.
// No fetch handler on purpose: the site always loads fresh from the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'MV Car Detail', {
    body: d.body || '',
    icon: '/api/icon?s=192',
    tag: d.tag,
    renotify: !!d.tag,
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil((async () => {
    if (url.startsWith(self.location.origin)) {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const win = wins.find(w => w.url.startsWith(self.location.origin));
      if (win) { await win.navigate(url).catch(() => {}); return win.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
