/* הכסף שלי — Service Worker
   Keeps a copy of the app on the device so it opens without internet.
   Online: always loads the newest version from the server (and refreshes the copy).
   Offline: opens the saved copy. Your data is not stored here; it stays encrypted in the app's own storage. */
const CACHE = 'money-manager-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.add(new Request('./', {cache: 'reload'}))).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // the app's update check must always reach the server
  if (url.origin === location.origin && url.searchParams.has('check')) return;

  // the app page: network first (fresh version), saved copy when offline
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const key = new URL('./', self.registration.scope).href;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(req, {cache: 'no-store', signal: ctrl.signal});
        clearTimeout(t);
        if (res.ok) await cache.put(key, res.clone());
        return res;
      } catch (err) {
        return (await cache.match(key)) || (await cache.match(req)) ||
          new Response('<!doctype html><meta charset="utf-8"><body dir="rtl" style="font-family:sans-serif;padding:40px;text-align:center"><h2>אין חיבור לאינטרנט</h2><p>פתחו את האפליקציה פעם אחת עם חיבור, ומאז היא תיפתח גם בלי רשת.</p></body>',
            {headers: {'Content-Type': 'text/html; charset=utf-8'}});
      }
    })());
    return;
  }

  // fonts and the spreadsheet library: saved copy first
  if (/(^|\.)cdnjs\.cloudflare\.com$|^fonts\.googleapis\.com$|^fonts\.gstatic\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const r = await fetch(req); if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }
      catch (x) { return Response.error(); }
    }));
  }
});
