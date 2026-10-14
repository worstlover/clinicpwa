// js/firebase.js
// ═══════════════════════════════════════════════════════
// تنظیمات Firebase (نسخه محلی)
// ═══════════════════════════════════════════════════════
import { initializeApp } from '../lib/firebase/firebase-app.js';
import { getMessaging, isSupported } from '../lib/firebase/firebase-messaging.js';

const firebaseConfig = {
  apiKey: "AIzaSyCKyUDeX2BYBz8sE64R44xpC1NgLy94obs",
  authDomain: "clinic-pwa-alerts.firebaseapp.com",
  projectId: "clinic-pwa-alerts",
  storageBucket: "clinic-pwa-alerts.firebasestorage.app",
  messagingSenderId: "162768973465",
  appId: "1:162768973465:web:af9c9f092531290a83d208"
};

// 🌟 VAPID Key از Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
export const VAPID_KEY = 'BJv_QoXImDpAqUq__0I6PsPxEZ3xUVXXC2tDH_fQcjrMI4FTVEKxI6voDplW0WFi4qIJm1wgqJRO0SPFTNMTn7I';

export const firebaseApp = initializeApp(firebaseConfig);

let messagingInstance = null;

export async function getMessagingInstance() {
  if (messagingInstance) return messagingInstance;
  
  try {
    const supported = await isSupported();
    if (!supported) {
      console.warn('[FCM] این مرورگر پشتیبانی نمی‌شود');
      return null;
    }
    messagingInstance = getMessaging(firebaseApp);
    return messagingInstance;
  } catch (e) {
    console.warn('[FCM] خطا در راه‌اندازی:', e);
    return null;
  }
}
