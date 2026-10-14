// service-worker.js — build.mjs مقادیر __BUILD__ و __ASSETS__ را پر می‌کند
const CACHE = 'clinic-drugs-__BUILD__';
const ASSETS = __ASSETS__;
const CRITICAL = ['./', './js/app.js'];
const OFFLINE_PAGE = './offline.html';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// fetch با چند بار تلاش مجدد (برای اتصال‌های ناپایدار)
async function fetchRetry(input, init, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(input instanceof Request ? input.clone() : input, init);
      if (res.ok || (res.status >= 400 && res.status < 500)) return res;
      lastErr = new Error('status ' + res.status);
    } catch (e) {
      lastErr = e;
    }
    await sleep(500 * (i + 1));
  }
  throw lastErr;
}

function clean(res) {
  if (!res.redirected) return res;
  return new Response(res.body, {
    status: res.status, statusText: res.statusText, headers: res.headers
  });
}

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const failed = [];
    for (const u of ASSETS) {
      try {
        const res = await fetchRetry(u, { cache: 'no-cache' });
        if (!res.ok) throw new Error('status ' + res.status);
        await cache.put(u, clean(res));
      } catch {
        failed.push(u);
      }
    }
    if (failed.length) console.warn('[SW] precache failed:', failed);
    if (failed.some(u => CRITICAL.includes(u))) {
      await caches.delete(CACHE);
      throw new Error('precache failed: ' + failed.join(', '));
    }
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function handle(req) {
  const cache = await caches.open(CACHE);
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const hit = await cache.match('./', { ignoreSearch: true });
      if (hit) return hit;
    }
    try {
      return await fetchRetry(req, undefined, 3);
    } catch {
      return (await cache.match(OFFLINE_PAGE))
        || new Response('<h1>آفلاین</h1>', {
             status: 200,
             headers: { 'Content-Type': 'text/html; charset=utf-8' }
           });
    }
  }

  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetchRetry(req);
    if (res.ok && res.type === 'basic') {
      cache.put(req, clean(res.clone())).catch(() => {});
    }
    return res;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith('/service-worker.js')) return;
  e.respondWith(handle(req));
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
  }
});
