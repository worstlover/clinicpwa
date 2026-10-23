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

// دریافت پیام در پس‌زمینه
messaging.onBackgroundMessage((payload) => {
  console.log('[service-worker.js] Background message:', payload);
  
  const data = payload.data || {};
  const notificationTitle = data.title || '🚨 اعلام حادثه';
  
  const notificationOptions = {
    body: data.body || 'اعلام حادثه جدید',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    dir: 'rtl',
    lang: 'fa',
    data: data,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200]
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

// ⭐️ کش کردن ساده (بدون نیاز به بیلد اسکریپت)
const CACHE_NAME = 'clinic-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles/main.css',
  '/js/app.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.log('Cache add error:', err));
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
