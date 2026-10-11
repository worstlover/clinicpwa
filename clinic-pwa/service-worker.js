const CACHE = 'clinic-drugs-v2';

// فایل‌های خودِ برنامه: اگر هرکدام نباشد خطا در کنسول دیده می‌شود ولی نصب خراب نمی‌شود
const LOCAL = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// کتابخانه‌های CDN (آدرس‌ها دقیقاً همان‌هایی باشد که در کد استفاده می‌کنید)
const CDN = [
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.rtl.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/+esm',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/jalaali-js@1.2.6/dist/jalaali.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // هر فایل جداگانه؛ شکست یکی (مثلاً CDN فیلتر) نصب را خراب نمی‌کند
    const results = await Promise.allSettled([...LOCAL, ...CDN].map(u => c.add(u)));
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.warn('[SW] cache failed:', [...LOCAL, ...CDN][i]);
    });
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

self.addEventListener('fetch', e => {
  const req = e.request;

  // فقط GET را مدیریت می‌کنیم (POST/PATCH سوپابیس مستقیم به شبکه می‌رود)
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Supabase: اول شبکه، اگر نبود از کش
  if (url.hostname.includes('supabase.co')) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // صفحات (navigation): اول شبکه تا آپدیت برنامه سریع برسد، آفلاین از کش
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match('./index.html')) || caches.match('./offline.html'))
    );
    return;
  }

  // بقیه (js, css, تصویر، فونت): اول کش
  e.respondWith(
    caches.match(req).then(hit =>
      hit || fetch(req).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => caches.match('./offline.html'))
    )
  );
});
