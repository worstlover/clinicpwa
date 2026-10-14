// js/firebase.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getMessaging, isSupported } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging.js';

const firebaseConfig = {
  apiKey: "AIzaSyCKyUDeX2BYBz8sE64R44xpC1NgLy94obs",
  authDomain: "clinic-pwa-alerts.firebaseapp.com",
  projectId: "clinic-pwa-alerts",
  storageBucket: "clinic-pwa-alerts.firebasestorage.app",
  messagingSenderId: "162768973465",
  appId: "1:162768973465:web:af9c9f092531290a83d208"
};

// 🌟 VAPID Key - این رو از Firebase Console بگیر
export const VAPID_KEY = 'BJv_QoXImDpAqUq__0I6PsPxEZ3xUVXXC2tDH_fQcjrMI4FTVEKxI6voDplW0WFi4qIJm1wgqJRO0SPFTNMTn7I';

export const firebaseApp = initializeApp(firebaseConfig);

let messagingInstance = null;

export async function getMessagingInstance() {
  if (messagingInstance) return messagingInstance;
  
  try {
    const supported = await isSupported();
    if (!supported) {
      console.warn('[FCM] Not supported on this browser');
      return null;
    }
    messagingInstance = getMessaging(firebaseApp);
    return messagingInstance;
  } catch (e) {
    console.warn('[FCM] Init failed:', e);
    return null;
  }
}
