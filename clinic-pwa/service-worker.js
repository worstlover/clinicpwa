// service-worker.js

// ═══════════════════════════════════════════════════════
// ۱. راه‌اندازی Firebase Messaging (پوش نوتیفیکیشن)
// ═══════════════════════════════════════════════════════
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCKyUDeX2BYBz8sE64R44xpC1NgLy94obs",
  authDomain: "clinic-pwa-alerts.firebaseapp.com",
  projectId: "clinic-pwa-alerts",
  storageBucket: "clinic-pwa-alerts.firebasestorage.app",
  messagingSenderId: "162768973465",
  appId: "1:162768973465:web:af9c9f092531290a83d208"
});

const messaging = firebase.messaging();

// جلوگیری از نمایش پیام تکراری
const recentNotifications = new Set();
function isDuplicate(payload) {
  const key = payload.messageId || (payload.data && payload.data.id);
  if (!key) return false;
  if (recentNotifications.has(key)) return true;
  recentNotifications.add(key);
  setTimeout(() => recentNotifications.delete(key), 5000);
  return false;
}

messaging.onBackgroundMessage((payload) => {
  if (isDuplicate(payload)) return;

  const data = payload.data || {};
  const notificationTitle = data.title || '🚨 اعلام حادثه';
  
  const base = self.registration.scope;
  const iconUrl = new URL('icons/icon-192.png', base).href;
  const badgeUrl = new URL('icons/badge-96.png', base).href;

  const notificationOptions = {
    body: data.body || 'اعلام حادثه جدید',
    icon: iconUrl,       
    badge: badgeUrl,      
    dir: 'rtl',
    lang: 'fa',
    data: data,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = self.registration.scope; 

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});


// ═══════════════════════════════════════════════════════
// ۲. تنظیمات کش کردن PWA (با پشتیبانی از بیلد اسکریپت)
// ═══════════════════════════════════════════════════════
// ⚠️ این دو خط توسط build.mjs پر می‌شوند. دست به آن‌ها نزنید.
const APP_CACHE = 'clinic-app-__BUILD__';
const ASSETS = __ASSETS__;

const TILE_CACHE = 'clinic-map-tiles-v1'; // ⭐️ کش اختصاصی برای کاشی‌های نقشه

// ═══════════════════════════════════════════════════════
// نصب (Install) - ذخیره فایل‌های اصلی
// ═══════════════════════════════════════════════════════
self.addEventListener('install', e => {
  self.skipWaiting(); // فعال‌سازی فوری نسخه جدید
  e.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    // استفاده از حلقه تک‌تک برای اینکه اگر یک فایل 404 بود، کل کش خراب نشود
    for (const url of ASSETS) {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (res && res.ok) await cache.put(url, res);
      } catch (err) {
        console.warn('[SW] Failed to cache:', url);
      }
    }
  })());
});

// ═══════════════════════════════════════════════════════
// فعال‌سازی (Activate) - پاکسازی کش‌های قدیمی
// ═══════════════════════════════════════════════════════
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    // پاک کردن کش‌های قدیمی (به جز کش فعلی اپ و کش نقشه)
    await Promise.all(
      keys.filter(k => k !== APP_CACHE && k !== TILE_CACHE).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// ═══════════════════════════════════════════════════════
// دریافت (Fetch) - استراتژی هوشمند
// ═══════════════════════════════════════════════════════
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // ⭐️ ۱. کاشی‌های نقشه (Cache-First)
  // اگر درخواست مربوط به پوشه map-tiles بود، اول کش را چک کن
  if (url.pathname.includes('/map-tiles/')) {
    e.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached; // اگر در کش بود، سریع برگردان

        // اگر در کش نبود، از شبکه بگیر و در کش ذخیره کن
        return fetch(req).then(res => {
          if (res && res.ok) {
            cache.put(req, res.clone());
          }
          return res;
        }).catch(() => new Response('', { status: 503 })); // آفلاین و بدون کش
      })
    );
    return;
  }

  // ⭐️ ۲. درخواست‌های سوپابیس و فایربیس (هرگز کش نشوند)
  // اگر درخواست به دامنه دیگری (غیر از سایت خودمان) بود، اصلا دخالت نکن
  if (url.origin !== self.location.origin) return;

  // ⭐️ ۳. بقیه فایل‌های سایت (Network-First)
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const cached = await caches.match('./index.html') || await caches.match('./');
        if (cached) return cached;
        return new Response('<h1 dir="rtl">آفلاین</h1>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(APP_CACHE).then(c => c.put(req, clone)).catch(() => {});
      }
      return res;
    } catch {
      const cached = await caches.match(req);
      return cached || new Response('', { status: 503 });
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