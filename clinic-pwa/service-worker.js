// service-worker.js

// ⭐️ فایل‌های فایربیس به صورت لوکال لود می‌شوند (به جای gstatic)
importScripts('/lib/firebase/firebase-app-compat.js');
importScripts('/lib/firebase/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCKyUDeX2BYBz8sE64R44xpC1NgLy94obs",
  authDomain: "clinic-pwa-alerts.firebaseapp.com",
  projectId: "clinic-pwa-alerts",
  storageBucket: "clinic-pwa-alerts.firebasestorage.app",
  messagingSenderId: "162768973465",
  appId: "1:162768973465:web:af9c9f092531290a83d208"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = self.registration.scope;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(targetUrl) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ═══════════════════════════════════════════════════════
// کدهای Caching
// ═══════════════════════════════════════════════════════
// ⭐️ نسخه کش را تغییر دادم تا مرورگر مجبور شود کش قدیمی خراب را پاک کند
const APP_CACHE = 'clinic-app-v3'; 
const TILE_CACHE = 'clinic-map-tiles-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/badge-96.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    for (const url of ASSETS) {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (res && res.ok) await cache.put(url, res);
      } catch (err) {}
    }
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== APP_CACHE && k !== TILE_CACHE).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.pathname.includes('/map-tiles/')) {
    e.respondWith(caches.open(TILE_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      });
    }));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // ⭐️ مدیریت بهتر خطای شبکه
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.status === 200) {
        const clone = res.clone();
        caches.open(APP_CACHE).then(c => c.put(req, clone)).catch(() => {});
      }
      return res;
    } catch (error) {
      // در صورت قطعی اینترنت یا خطا، از کش بخوان
      const cached = await caches.match(req);
      if (cached) return cached;
      
      if (req.mode === 'navigate') {
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
      }
      
      // جلوگیری از خطای کامل سرویس‌ورکر با بازگرداندن یک پاسخ خالی
      return new Response('', { status: 503, statusText: 'Network Error' });
    }
  })());
});