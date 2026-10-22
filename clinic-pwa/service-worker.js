// js/service-worker.js

// ═══════════════════════════════════════════════════════
// ۱. راه‌اندازی Firebase Messaging (برای نوتیفیکیشن‌های پس‌زمینه)
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

// جلوگیری از نمایش نوتیفیکیشن تکراری (اختیاری اما مفید)
const recentNotifications = new Set();
function isDuplicate(payload) {
  const key = payload.messageId || (payload.notification && payload.notification.title + payload.notification.body);
  if (!key) return false;
  if (recentNotifications.has(key)) return true;
  recentNotifications.add(key);
  setTimeout(() => recentNotifications.delete(key), 5000);
  return false;
}

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  if (isDuplicate(payload)) return;

  const notificationTitle = payload.notification?.title || 'پیام جدید';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    dir: 'rtl',
    lang: 'fa',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // اگر اپ باز است، فوکوس کن
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // اگر باز نیست، باز کن
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});


// ═══════════════════════════════════════════════════════
// ۲. کدهای PWA Caching (کدهای قبلی خودتان)
// ═══════════════════════════════════════════════════════
const CACHE_NAME = 'clinic-pwa-v1'; // نسخه کش خود را اینجا تنظیم کنید
const ASSETS = self.__ASSETS__ || []; // لیست فایل‌های شما (توسط build تولید می‌شود)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ⭐ درخواست‌های خارجی (مثل Supabase یا گوگل) را کش نکن
  if (url.origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // فایل‌های جدید را کش کن
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // اگر آفلاین بودیم و فایل در کش نبود
        // می‌توانید اینجا یک صفحه offline.html برگردانید
      });
    })
  );
});
