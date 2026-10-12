const CACHE = 'clinic-drugs-v7';

// همه‌ی فایل‌ها حالا روی خود سایت هستند (بدون وابستگی به CDN)
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
  './js/modals.js',
  './js/sb.js',
  './js/scanner.js',
  './js/ui.js',
  './js/utils.js',

  // ═══ ماژول‌های ساده ═══
  './js/modules/receive.js',
  './js/modules/report.js',
  './js/modules/dispense.js',
  './js/modules/disposal.js',
  './js/modules/inventory.js',
  './js/modules/occupational.js',
  './js/modules/profile.js',

  // ═══ ماژول ویزیت (modularized) ═══
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

  // ═══ کتابخانه‌های CSS ═══
  './lib/bootstrap.rtl.min.css',
  './lib/bootstrap-icons.min.css',
  './lib/vazirmatn.css',

  // ═══ کتابخانه‌های JS ═══
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
    // هر فایل جداگانه؛ شکست یکی نصب را خراب نمی‌کند
    const results = await Promise.allSettled(ASSETS.map(u => c.add(u)));
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) {
      console.warn(`⚠️ ${failed} فایل از ${ASSETS.length} در کش نصب نشد`);
    } else {
      console.log(`✅ همه ${ASSETS.length} فایل کش شدند`);
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

  // ⭐ درخواست‌های خارج از دامنه (Supabase): مستقیم از شبکه
  if (url.origin !== location.origin) return;

  // ─── صفحات: network-first با مهلت ۴ ثانیه ───
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

  // ─── کد خودِ برنامه (js/css): network-first با مهلت ۳ ثانیه ───
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

  // ─── کتابخانه‌ها و فونت‌ها (lib/): cache-first ───
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
// پیام از کلاینت (اختیاری): پاک کردن کش
// ═══════════════════════════════════════════════════════
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data && e.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => {
      keys.forEach(k => caches.delete(k));
    });
  }
});
