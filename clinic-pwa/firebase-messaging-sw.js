// firebase-messaging-sw.js
// ═══════════════════════════════════════════════════════
// Service Worker برای Firebase Cloud Messaging
// ═══════════════════════════════════════════════════════
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCKyUDeX2BYBz8sE64R44xpC1NgLy94obs",
  authDomain: "clinic-pwa-alerts.firebaseapp.com",
  projectId: "clinic-pwa-alerts",
  storageBucket: "clinic-pwa-alerts.firebasestorage.app",
  messagingSenderId: "162768973465",
  appId: "1:162768973465:web:af9c9f092531290a83d208"
});

const messaging = firebase.messaging();

// ═══════════════════════════════════════════════════════
// دریافت Push در پس‌زمینه
// ═══════════════════════════════════════════════════════
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] 📩 Background message:', payload);

  const data = payload.data || {};
  const type = data.type || 'incident';

  let title = '🚨 اعلام حادثه';
  let body = 'لطفاً فوراً بررسی کنید';
  let icon = './icons/icon-192.png';
  let badge = './icons/icon-192.png';

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

  const options = {
    body: body,
    icon: icon,
    badge: badge,
    tag: type + '_' + (data.id || Date.now()),
    renotify: true,
    requireInteraction: true,   // ⭐ تا کاربر نخونه محو نشه
    vibrate: [500, 200, 500, 200, 500],
    data: data,
    actions: [
      { action: 'open', title: 'مشاهده' },
      { action: 'close', title: 'بستن' }
    ]
  };

  return self.registration.showNotification(title, options);
});

// ═══════════════════════════════════════════════════════
// کلیک روی نوتیف
// ═══════════════════════════════════════════════════════
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const type = data.type || 'incident';

  // باز کردن اپ
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // اگه اپ بازه، focus کن
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          // پست پیام به اپ
          client.postMessage({
            type: 'FCM_CLICK',
            data: data
          });
          return;
        }
      }
      // اگه بسته‌ست، باز کن
      if (clients.openWindow) {
        return clients.openWindow('./?fcm_type=' + type + '&fcm_id=' + (data.id || ''));
      }
    })
  );
});
