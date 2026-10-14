// service-worker.js
const CACHE = 'clinic-drugs-v15';
const OFFLINE_PAGE = './offline.html';

const ASSETS = [
  './',
  './offline.html',
  './manifest.json',
  './styles/main.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/auth.js',
  './js/config.js',
  './js/fcm.js',
  './js/firebase.js',
  './js/session.js',
  './js/incident-alert.js',
  './js/referral-alert.js',
  './js/alert-center.js',
  './js/quick-incident.js',
  './js/modals.js',
  './js/sb.js',
  './js/scanner.js',
  './js/ui.js',
  './js/utils.js',
  './js/modules/extra-data.js',
  './js/modules/receive.js',
  './js/modules/report.js',
  './js/modules/dispense.js',
  './js/modules/disposal.js',
  './js/modules/inventory.js',
  './js/modules/occupational.js',
  './js/modules/profile.js',
  './js/modules/settings.js',
  './js/forms/registry.js',
  './js/forms/engine.js',
  './js/forms/print.css',
  './js/forms/visit-data.js',
  './js/forms/templates/form34.js',
  './js/forms/templates/form36.js',
  './js/forms/templates/form37.js',
  './js/forms/templates/form38.js',
  './js/forms/templates/form39.js',
  './js/forms/templates/form48.js',
  './js/forms/templates/form49.js',
  './js/forms/templates/form50.js',
  './js/process/processes.js',
  './js/process/guide.js',
  './js/process/banner.js',
  './js/process/sample.js',
  './js/process/process.css',
  './js/modules/visit/index.js',
  './js/modules/visit/state.js',
  './js/modules/visit/helpers.js',
  './js/modules/visit/bodymap.js',
  './js/modules/visit/changelog.js',
  './js/modules/visit/list.js',
  './js/modules/visit/create.js',
  './js/modules/visit/detail.js',
  './js/modules/visit/edit.js',
  './js/modules/visit/actions.js',
  './lib/bootstrap.rtl.min.css',
  './lib/bootstrap-icons.min.css',
  './lib/vazirmatn.css',
  './lib/bootstrap.bundle.min.js',
  './lib/supabase.js',
  './lib/html5-qrcode.js',
  './lib/jalaali.js',
  './lib/fonts/bootstrap-icons.woff2',
  './lib/fonts/bootstrap-icons.woff',
  './lib/webfonts/Vazirmatn-Regular.woff2',
  './lib/webfonts/Vazirmatn-Medium.woff2',
  './lib/webfonts/Vazirmatn-SemiBold.woff2',
  './lib/webfonts/Vazirmatn-Bold.woff2'
];

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
// fetch — ساده و امن
// ═══════════════════════════════════════════════════════
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Pages: network-first، فقط برای navigation
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const cached = await caches.match('./')
                    || await caches.match('./index.html')
                    || await caches.match(OFFLINE_PAGE);
        if (cached) return cached;
        return new Response('<h1>آفلاین</h1>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // بقیه فایل‌ها (JS/CSS/تصویر/فونت): network-first با cache fallback
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
      // هیچوقت Response.error() برنگردان
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
