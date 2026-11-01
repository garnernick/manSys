// ManSys service worker — Web Push + app-icon badge only (no fetch handler, no caching).
// Publish at the repo root next to dashboard-mobile.html: https://garnernick.github.io/manSys/sw.js
//
// RULE (Apple): every push must end in a visible notification, or Safari revokes the permission.
// So this handler ALWAYS calls showNotification — even when the payload is missing/corrupt and even if the app is open.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let d = {};
    try { d = event.data ? event.data.json() : {}; } catch (_) { d = {}; }
    const title = (d && d.title) ? String(d.title) : 'ManSys';
    const options = {
      body: (d && d.body) ? String(d.body) : 'Open ManSys to see what changed.',
      icon: 'apple-touch-icon.png',
      data: { url: (d && d.url) ? String(d.url) : 'dashboard-mobile.html' },
    };
    if (d && d.tag) options.tag = String(d.tag);   // same tag replaces instead of stacking

    // Badge first (never let a badge error block the notification).
    try {
      if (d && typeof d.badge === 'number' && self.navigator && 'setAppBadge' in self.navigator) {
        if (d.badge > 0) await self.navigator.setAppBadge(d.badge);
        else await self.navigator.clearAppBadge();
      }
    } catch (_) { /* ignore */ }

    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || 'dashboard-mobile.html', self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope) && 'focus' in w) {
        await w.focus();
        try { w.postMessage({ type: 'mansys-refresh' }); } catch (_) { /* ignore */ }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
