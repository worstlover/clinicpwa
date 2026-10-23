// service-worker.js

// ═══════════════════════════════════════════════════════
// ۱. راه‌اندازی Firebase Messaging
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

// دریافت پیام در پس‌زمینه
messaging.onBackgroundMessage((payload) => {
  console.log('[service-worker.js] Received background message ', payload);
  if (isDuplicate(payload)) return;

  // ⭐️ چون در Edge Function از data استفاده می‌کنیم، مقادیر را از data می‌خوانیم
  const data = payload.data || {};
  const notificationTitle = data.title || '🚨 اعلام حادثه';
  
  const notificationOptions = {
    body: data.body || 'اعلام حادثه جدید',
    icon: '/icons/icon-192.png',       // آیکون بزرگ (رنگی)
    badge: '/icons/badge-96.png',      // ⭐️ آیکون کوچک (سفید و شفاف برای اندروید)
    dir: 'rtl',
    lang: 'fa',
    data: data,
    requireInteraction: true,          // نوتیفیکیشن تا زمانی که کاربر نبندد باز بماند
    vibrate: [200, 100, 200, 100, 200] // لرزش برای هشدار مهم
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// کلیک روی نوتیفیکیشن
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});


// ═══════════════════════════════════════════════════════
// ۲. کدهای PWA Caching (دقیقاً مطابق نسخه قبلی شما)
// ⚠️ این متغیرها توسط build.mjs پر می‌شوند.
// ═══════════════════════════════════════════════════════
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
    // پاک کردن همه کش‌های قدیمی
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    );
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
