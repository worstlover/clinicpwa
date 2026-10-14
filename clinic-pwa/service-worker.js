// service-worker.js
const CACHE = 'clinic-drugs-v13';

const ASSETS = [
  './',
  './offline.html',
  './manifest.json',
  './styles/main.css',
  './icons/icon-192.png',
  './icons/icon-512.png',

  // ═══ JS اصلی ═══
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

  // ═══ ماژول‌های ساده ═══
  './js/modules/extra-data.js',
  './js/modules/receive.js',
  './js/modules/report.js',
  './js/modules/dispense.js',
  './js/modules/disposal.js',
  './js/modules/inventory.js',
  './js/modules/occupational.js',
  './js/modules/profile.js',
  './js/modules/settings.js',

  // ═══ فرم‌ها ═══
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

  // ═══ راهنمای فرآیندها ═══
  './js/process/processes.js',
  './js/process/guide.js',
  './js/process/banner.js',
  './js/process/sample.js',
  './js/process/process.css',

  // ═══ ماژول ویزیت ═══
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

  // ═══ Firebase SDK (محلی) ═══
  './lib/firebase/firebase-app.js',
  './lib/firebase/firebase-messaging.js',
  './lib/firebase/firebase-app-compat.js',
  './lib/firebase/firebase-messaging-compat.js',

  // ═══ کتابخانه‌ها ═══
  './lib/bootstrap.rtl.min.css',
  './lib/bootstrap-icons.min.css',
  './lib/vazirmatn.css',
  './lib/bootstrap.bundle.min.js',
  './lib/supabase.js',
  './lib/html5-qrcode.js',
  './lib/jalaali.js',

  // ═══ فونت‌ها ═══
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
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const results = await Promise.allSettled(ASSETS.map(u => c.add(u)));
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) {
      console.warn(`⚠️ ${failed} فایل از ${ASSETS.length} کش نشد`);
    } else {
      console.log(`✅ ${ASSETS.length} فایل کش شد`);
    }
    await self.skipWaiting();
  })());
});

// ═══════════════════════════════════════════════════════
// فعال‌سازی
// ═══════════════════════════════════════════════════════
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// ═══════════════════════════════════════════════════════
// helper: timeout
// ═══════════════════════════════════════════════════════
const withTimeout = (p, ms) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
  ]);

// ═══════════════════════════════════════════════════════
// fetch
// ═══════════════════════════════════════════════════════
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // درخواست‌های خارج از دامنه: مستقیم از شبکه
  if (url.origin !== location.origin) return;

  // Firebase SDK محلی: از cache اول
  if (url.pathname.includes('/lib/firebase/')) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req))
    );
    return;
  }

  // صفحات: network-first با مهلت ۴ ثانیه
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await withTimeout(fetch(req), 4000);
        if (res.ok && !res.redirected) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put('./', clone)).catch(() => {});
        }
        return res;
      } catch (err) {
        return (await caches.match('./'))
            || (await caches.match('./offline.html'))
            || Response.error();
      }
    })());
    return;
  }

  // کد برنامه: network-first
  if (!url.pathname.startsWith('/lib/')) {
    e.respondWith((async () => {
      try {
        const res = await withTimeout(fetch(req), 3000);
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
        }
        return res;
      } catch (err) {
        return (await caches.match(req)) || Response.error();
      }
    })());
    return;
  }

  // کتابخانه‌ها: cache-first
  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
        }
        return res;
      });
    })
  );
});

// ═══════════════════════════════════════════════════════
// پیام از کلاینت
// ═══════════════════════════════════════════════════════
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
  }
});
