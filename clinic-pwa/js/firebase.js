// js/firebase.js
import firebase from '../lib/firebase/firebase-app-compat.js';
import '../lib/firebase/firebase-messaging-compat.js';

const firebaseConfig = {
  apiKey: "AIzaSyCKyUDeX2BYBz8sE64R44xpC1NgLy94obs",
  authDomain: "clinic-pwa-alerts.firebaseapp.com",
  projectId: "clinic-pwa-alerts",
  storageBucket: "clinic-pwa-alerts.firebasestorage.app",
  messagingSenderId: "162768973465",
  appId: "1:162768973465:web:af9c9f092531290a83d208"
};

export const VAPID_KEY = 'BJv_QoXImDpAqUq__0I6PsPxEZ3xUVXXC2tDH_fQcjrMI4FTVEKxI6voDplW0WFi4qIJm1wgqJRO0SPFTNMTn7I';

// firebase.apps جلوگیری از init دوباره (در hot reload / debug)
export const firebaseApp = firebase.apps.length
  ? firebase.app()
  : firebase.initializeApp(firebaseConfig);

let messagingInstance = null;

export async function getMessagingInstance() {
  if (messagingInstance) return messagingInstance;

  try {
    const supported = await firebase.messaging.isSupported();
    console.log('[FCM] isSupported:', supported);

    if (!supported) {
      console.warn('[FCM] این مرورگر پشتیبانی نمی‌شود');
      return null;
    }

    messagingInstance = firebase.messaging();
    console.log('[FCM] ✅ messaging instance ساخته شد');
    return messagingInstance;
  } catch (e) {
    console.error('[FCM] خطا در ساخت messaging instance:', e);
    return null;
  }
}

// ⭐ اختیاری: نسخه‌ی firebase برای استفاده در جاهای دیگر
export { firebase };
