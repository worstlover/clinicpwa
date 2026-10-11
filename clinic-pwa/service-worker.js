const CACHE = 'clinic-drugs-v4';

// همه‌ی فایل‌ها حالا روی خود سایت هستند (بدون وابستگی به CDN)
const ASSETS = [
  './',
  './offline.html',
  './manifest.json',
  './styles/main.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js', './js/auth.js', './js/config.js', './js/modals.js', './js/sb.js',
  './js/scanner.js', './js/ui.js', './js/utils.js',
  './js/modules/receive.js', './js/modules/report.js', './js/modules/dispense.js',
  './js/modules/disposal.js', './js/modules/inventory.js',
  './lib/bootstrap.rtl.min.css', './lib/bootstrap.bundle.min.js',
  './lib/bootstrap-icons.min.css', './lib/fonts/bootstrap-icons.woff2', './lib/fonts/bootstrap-icons.woff',
  './lib/vazirmatn.css',
  './lib/webfonts/Vazirmatn-Regular.woff2', './lib/webfonts/Vazirmatn-Medium.woff2',
  './lib/webfonts/Vazirmatn-SemiBold.woff2', './lib/webfonts/Vazirmatn-Bold.woff2',
  './lib/supabase.js', './lib/html5-qrcode.js', './lib/jalaali.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // هر فایل جداگانه؛ شکست یکی نصب را خراب نمی‌کند
    await Promise.allSettled(ASSETS.map(u => c.add(u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Supabase و هر سایت دیگر: مستقیم از شبکه (کش نمی‌شود)
  if (url.origin !== location.origin) return;

  // صفحات: اول شبکه (با مهلت ۴ ثانیه)، وگرنه از کش. هیچ‌وقت صفحه سفید نمی‌ماند.
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
        return (await caches.match('./')) || (await caches.match('./offline.html')) || Response.error();
      }
    })());
    return;
  }

  // کد خودِ برنامه (js, css): اول شبکه با مهلت کوتاه، وگرنه کش → تغییرات جدید حتماً می‌رسد
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

  // کتابخانه‌ها (lib/): اول کش چون تغییر نمی‌کنند
  e.respondWith(
    caches.match(req).then(hit =>
      hit || fetch(req).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
        }
        return res;
      })
    )
  );
});
