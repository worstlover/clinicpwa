// service-worker.js
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

// پوش نوتیفیکیشن
messaging.onBackgroundMessage((payload) => { /* ... */ });

// ═══════════════════════════════════════════════════════
// استراتژی‌های کش (کدهای PWA)
// ═══════════════════════════════════════════════════════
const APP_CACHE = 'clinic-app-v2';
const TILE_CACHE = 'clinic-map-tiles-v1';

const PRECACHE_ASSETS = ['./', './index.html', './manifest.json', './icons/icon-192.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(APP_CACHE).then(async (cache) => {
      for (const url of PRECACHE_ASSETS) {
        try { const res = await fetch(url); if (res.ok) cache.put(url, res); } catch(_) {}
      }
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== APP_CACHE && k !== TILE_CACHE).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // ⭐️ اگر درخواست به کاشی‌های نقشه بود (Cache-First)
  if (url.pathname.includes('/map-tiles/')) {
    e.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached; // اگر در کش بود، سریع برگردان
        return fetch(req).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(TILE_CACHE).then(c => c.put(req, clone));
          }
          return res;
        }).catch(() => new Response('', { status: 503 })); // در صورت آفلاین بودن و نبود کش
      })
    );
    return;
  }

  // ⭐️ برای بقیه فایل‌ها (Network-First)
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(APP_CACHE).then(c => c.put(req, clone));
      }
      return res;
    }).catch(async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        return (await caches.match('./index.html')) || new Response('Offline', { status: 503 });
      }
      return new Response('', { status: 503 });
    })
  );
});