// ManSys service worker — Web Push + app-icon badge only (no fetch handler, no caching).
// Publish at the repo root next to dashboard-mobile-push.html: https://garnernick.github.io/manSys/sw.js
//
// RULE (Apple): every push must end in a visible notification, or Safari revokes the permission.
// So this handler ALWAYS calls showNotification — even when the payload is missing/corrupt and even if the app is open.
//
// Notification tap: the payload's `url` carries everything the page needs (token, ?task=<id>, ?tab=updates&u=<id>).
//  - app already open  -> focus it and hand it the url in a 'mansys-open' message (the page opens the task / update itself and
//                         confirms on the message port); no confirmation within 1.5 s -> navigate the window to the url
//  - app not open      -> open a window at the url

const DEFAULT_PAGE = 'dashboard-mobile-push.html';
const SW_VERSION = 'sw-6 receipt';
const SB_URL = 'https://dglotzmioswcmhfttcqx.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnbG90em1pb3N3Y21oZnR0Y3F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5OTE3MzgsImV4cCI6MjA4ODU2NzczOH0.lF_8yxfnP50UpiMKCW3aQxq8HukVZ5ibRqOp-RwFvpQ'; // anon key, already public in the page; the RPC only records a receipt for a known endpoint

// Tiny event log kept in Cache Storage so the dashboard's debug panel (tap MANSYS 3x) can show what the worker did on a tap.
async function swlog(msg) {
  try {
    const c = await caches.open('mansys-nav');
    const r = await c.match('sw-log'); let a = []; if (r) { try { a = await r.json(); } catch (_) { a = []; } }
    a.push(new Date().toISOString().slice(11, 19) + ' ' + msg); if (a.length > 12) a = a.slice(-12);
    await c.put('sw-log', new Response(JSON.stringify(a)));
  } catch (_) { /* ignore */ }
}

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
      data: { url: (d && d.url) ? String(d.url) : DEFAULT_PAGE },
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
    await swlog(SW_VERSION + ' push shown tag=' + (d && d.tag || '-'));

    // Delivery receipt: tell the database this device received the push (after the notification is shown; never blocks it).
    try {
      if (d && d.tag) {
        const sub = await self.registration.pushManager.getSubscription();
        if (sub) {
          await fetch(SB_URL + '/rest/v1/rpc/push_receipt', {
            method: 'POST', keepalive: true,
            headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_endpoint: sub.endpoint, p_tag: String(d.tag) })
          });
        }
      }
    } catch (_) { /* ignore */ }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || DEFAULT_PAGE;
  const target = new URL(raw, self.registration.scope);
  event.waitUntil((async () => {
    await swlog(SW_VERSION + ' click ' + target.search.replace(/token=[^&]+&?/, ''));
    // Leave a note the page can pick up when it comes to the front. Messaging an app that iOS has suspended in the
    // background is unreliable, a note in Cache Storage (shared by the worker and the page) is not.
    try { const c = await caches.open('mansys-nav'); await c.put('pending-nav', new Response(JSON.stringify({ url: target.href, t: Date.now() }))); } catch (_) { /* ignore */ }
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await swlog('windows=' + wins.length + (wins.length ? ' ' + wins.map((w) => { try { return new URL(w.url).pathname.split('/').pop() + ':' + w.visibilityState; } catch (_) { return '?'; } }).join(',') : ''));
    // Reuse a window only if it is the same page (a dashboard window must not receive a personal-page link, or the reverse).
    const same = wins.find((w) => {
      try { return new URL(w.url).pathname === target.pathname && 'focus' in w; } catch (_) { return false; }
    });
    if (same) {
      try { await same.focus(); } catch (_) { /* ignore */ }
      // Hand the link to the open page and wait for it to confirm. A page that is older than this
      // service worker (or frozen) never answers, so after 1.5 s the window is navigated to the link instead.
      const acked = await new Promise((resolve) => {
        let done = false; const finish = (v) => { if (!done) { done = true; resolve(v); } };
        try {
          const ch = new MessageChannel();
          ch.port1.onmessage = () => finish(true);
          same.postMessage({ type: 'mansys-open', url: target.href }, [ch.port2]);
        } catch (_) { finish(false); }
        setTimeout(() => finish(false), 1500);
      });
      await swlog('acked=' + acked);
      if (acked) return;
      try { if ('navigate' in same) { await same.navigate(target.href); await swlog('navigate ok'); return; } } catch (e) { await swlog('navigate failed ' + (e && e.name)); }
      if (self.clients.openWindow) await self.clients.openWindow(target.href);
      return;
    }
    await swlog('no same-page window, openWindow');
    if (self.clients.openWindow) await self.clients.openWindow(target.href);
  })());
});
