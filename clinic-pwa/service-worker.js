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
  
  // ⭐️ حل مشکل مسیر آیکون‌ها با استفاده از scope
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
  
  // ⭐️ هدایت کاربر به مسیر صحیح (زیرپوشه)
  const targetUrl = self.registration.scope; 

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ... (کدهای Caching شما بدون تغییر در اینجا قرار می‌گیرد) ...
const CACHE = 'clinic-drugs-__BUILD__';
const ASSETS = __ASSETS__;

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

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try { return await fetch(req); } 
      catch {
        const cached = await caches.match('./') || await caches.match('./index.html') || await caches.match('./offline.html');
        if (cached) return cached;
        return new Response('<h1>آفلاین</h1>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
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
      return new Response('/* offline */', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
