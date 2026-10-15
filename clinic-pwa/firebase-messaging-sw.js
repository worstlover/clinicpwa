// firebase-messaging-sw.js
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

// ═══════════════════════════════════════════════════════
// جلوگیری از نوتیف تکراری
// ═══════════════════════════════════════════════════════
const recentNotifications = new Map();
const DEDUP_WINDOW_MS = 5000;

function isDuplicate(key) {
  const now = Date.now();
  // پاک‌سازی قدیمی‌ها
  for (const [k, t] of recentNotifications.entries()) {
    if (now - t > DEDUP_WINDOW_MS) recentNotifications.delete(k);
  }
  if (recentNotifications.has(key)) return true;
  recentNotifications.set(key, now);
  return false;
}

// ═══════════════════════════════════════════════════════
// Background Message Handler
// ═══════════════════════════════════════════════════════
messaging.onBackgroundMessage((payload) => {
  console.log('[SW-FCM] 📩 Background:', payload);

  const data = payload.data || {};
  const type = data.type || 'incident';
  const id = data.id || Date.now();

  // 🌟 جلوگیری از تکرار
  const dedupKey = `${type}_${id}`;
  if (isDuplicate(dedupKey)) {
    console.log('[SW-FCM] Duplicate skipped:', dedupKey);
    return;
  }

  // 🌟 title و body از data
  const title = data.title || (type === 'incident' ? '🚨 اعلام حادثه' : '📩 ویزیت ارجاعی');
  const body = data.body || (
    type === 'incident'
      ? (data.triggered_name
          ? `توسط ${data.triggered_name}${data.location ? ' - ' + data.location : ''}`
          : 'اعلام حادثه جدید')
      : (data.referred_by_name
          ? `از طرف ${data.referred_by_name}`
          : 'ویزیت جدید برای شما')
  );

  const options = {
    body: body,
    icon: '/icons/icon-192.png',       // ✅ مسیر اصلاح شد (با / شروع شود)
    badge: '/icons/icon-mono.png',     // ✅ مسیر اصلاح شد
    tag: dedupKey,
    renotify: true,
    requireInteraction: true,
    silent: false,
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
// Notification Click
// ═══════════════════════════════════════════════════════
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
