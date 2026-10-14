// js/fcm.js
import { sb } from './sb.js';
import { getMessagingInstance, VAPID_KEY } from './firebase.js';
import { getToken, onMessage } from '../lib/firebase/firebase-messaging.js';
import { toast } from './utils.js';

let currentToken = null;
let messageUnsubscribe = null;

export async function initFCM() {
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.warn('[FCM] پشتیبانی نمی‌شود');
      return null;
    }

    if (Notification.permission !== 'granted') {
      console.log('[FCM] اجازه داده نشده - بی‌صدا رد می‌شود');
      return null;
    }

    return await _doInitFCM();
  } catch (e) {
    console.error('[FCM] خطا در initFCM:', e);
    return null;
  }
}

export async function requestPermissionAndInit() {
  try {
    if (!('Notification' in window)) {
      toast('مرورگر شما از نوتیفیکیشن پشتیبانی نمی‌کند', 'warning');
      return null;
    }

    if (Notification.permission === 'denied') {
      toast('نوتیفیکیشن مسدود شده. از تنظیمات مرورگر فعال کن', 'warning');
      return null;
    }

    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      toast('اجازه نوتیفیکیشن داده نشد', 'warning');
      return null;
    }

    toast('✅ نوتیفیکیشن فعال شد', 'success');
    return await _doInitFCM();

  } catch (e) {
    console.error('[FCM] خطا در درخواست اجازه:', e);
    return null;
  }
}

async function _doInitFCM() {
  if (!VAPID_KEY || VAPID_KEY === 'PASTE_VAPID_KEY_HERE') {
    console.error('[FCM] VAPID_KEY تنظیم نشده!');
    return null;
  }

  // 🌟 ثبت Service Worker با scope متفاوت (جدا از service-worker.js اصلی)
  let swRegistration;
  try {
    // اول چک کن اگه قبلاً ثبت شده
    const existingRegs = await navigator.serviceWorker.getRegistrations();
    swRegistration = existingRegs.find(r => 
      r.active?.scriptURL.includes('firebase-messaging-sw.js')
    );

    if (!swRegistration) {
      // ثبت جدید با scope اختصاصی
      swRegistration = await navigator.serviceWorker.register(
        './firebase-messaging-sw.js',
        { scope: './firebase-cloud-messaging-push-scope' }
      );
      console.log('[FCM] SW ثبت شد با scope اختصاصی');
    } else {
      console.log('[FCM] SW قبلاً ثبت شده بود');
    }

    // منتظر بمون تا SW فعال بشه
    if (swRegistration.installing) {
      await new Promise((resolve) => {
        swRegistration.installing.addEventListener('statechange', (e) => {
          if (e.target.state === 'activated') resolve();
        });
      });
    }
  } catch (e) {
    console.error('[FCM] خطا در ثبت Service Worker:', e);
    return null;
  }

  // گرفتن messaging instance
  const messaging = await getMessagingInstance();
  if (!messaging) {
    console.error('[FCM] messaging instance گرفته نشد');
    return null;
  }

  // گرفتن توکن
  let token;
  try {
    token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });
  } catch (e) {
    console.error('[FCM] خطا در گرفتن توکن:', e);
    return null;
  }

  if (!token) {
    console.warn('[FCM] توکن دریافت نشد');
    return null;
  }

  currentToken = token;
  console.log('[FCM] ✅ توکن دریافت شد:', token.substring(0, 25) + '...');

  await saveTokenToSupabase(token);
  setupForegroundListener(messaging);

  return token;
}

async function saveTokenToSupabase(token) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    // حذف توکن‌های قبلی این کاربر
    await sb.from('fcm_tokens').delete().eq('user_id', user.id);

    // درج توکن جدید
    const { error } = await sb
      .from('fcm_tokens')
      .insert({
        user_id: user.id,
        token: token,
        platform: 'web',
        browser: navigator.userAgent.substring(0, 100),
        last_seen: new Date().toISOString(),
      });

    if (error) {
      console.error('[FCM] خطا در ذخیره توکن:', error);
    } else {
      console.log('[FCM] ✅ توکن ذخیره شد');
    }
  } catch (e) {
    console.error('[FCM] خطا در saveToken:', e);
  }
}

async function setupForegroundListener(messaging) {
  if (messageUnsubscribe) messageUnsubscribe();

  messageUnsubscribe = onMessage(messaging, (payload) => {
    console.log('[FCM] 📩 پیام foreground:', payload);
    window.dispatchEvent(new CustomEvent('fcm-message', {
      detail: payload.data || {}
    }));
  });
}

export async function removeFCMToken() {
  if (!currentToken) return;
  try {
    await sb.from('fcm_tokens').delete().eq('token', currentToken);
  } catch (e) {
    console.error('[FCM] خطا:', e);
  }
}

export function getCurrentToken() { return currentToken; }

export function getPermissionStatus() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}
