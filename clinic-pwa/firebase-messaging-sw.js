// firebase-messaging-sw.js (در ریشه پروژه)
// ═══════════════════════════════════════════════════════
// Service Worker اختصاصی FCM
// ═══════════════════════════════════════════════════════
importScripts('./lib/firebase/firebase-app-compat.js');
importScripts('./lib/firebase/firebase-messaging-compat.js');

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
  console.log('[SW-FCM] 📩 پیام پس‌زمینه:', payload);

  const data = payload.data || {};
  const type = data.type || 'incident';

  let title = '🚨 اعلام حادثه';
  let body = 'لطفاً فوراً بررسی کنید';

  if (type === 'incident') {
    title = '🚨 اعلام حادثه';
    body = data.triggered_name 
      ? `توسط ${data.triggered_name}${data.location ? ' - ' + data.location : ''}`
      : 'اعلام حادثه جدید';
  } else if (type === 'referral') {
    title = '📩 ویزیت ارجاعی';
    body = data.referred_by_name
      ? `از طرف ${data.referred_by_name}`
      : 'ویزیت جدید برای شما';
  }

  return self.registration.showNotification(title, {
    body: body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: type + '_' + (data.id || Date.now()),
    renotify: true,
    requireInteraction: true,
    vibrate: [500, 200, 500, 200, 500],
    data: data,
    actions: [
      { action: 'open', title: 'مشاهده' },
      { action: 'close', title: 'بستن' }
    ]
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const type = data.type || 'incident';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'FCM_CLICK', data: data });
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./?fcm_type=' + type + '&fcm_id=' + (data.id || ''));
      }
    })
  );
});
