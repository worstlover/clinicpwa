// service-worker.js
// ⚠️ این فایل به عنوان قالب استفاده می‌شود. build.mjs دو Placeholder زیر را پر می‌کند.
const CACHE = 'clinic-drugs-__BUILD__';

const ASSETS = __ASSETS__;

// ═══════════════════════════════════════════════════════
// نصب
// ═══════════════════════════════════════════════════════
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    for (const u of ASSETS) {
      try {
        const res = await fetch(u, { cache: 'no-cache' });
        if (res && res.ok) await c.put(u, res);
      } catch {}
    }
  })());
});

// ═══════════════════════════════════════════════════════
// فعال‌سازی
// ═══════════════════════════════════════════════════════
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// ═══════════════════════════════════════════════════════
// fetch
// ═══════════════════════════════════════════════════════
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const cached = await caches.match('./')
                    || await caches.match('./index.html')
                    || await caches.match('./offline.html');
        if (cached) return cached;
        return new Response('<h1>آفلاین</h1>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
      }
      return res;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      return new Response('/* offline: ' + url.pathname + ' */', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});

// پیام از کلاینت
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
  }
});
