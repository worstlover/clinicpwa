// js/fcm.js
// ═══════════════════════════════════════════════════════
// مدیریت FCM (گرفتن توکن، ذخیره، دریافت پیام)
// ═══════════════════════════════════════════════════════
import { sb } from './sb.js';
import { getMessagingInstance, VAPID_KEY } from './firebase.js';
import { getToken, onMessage } from '../lib/firebase/firebase-messaging.js';
import { toast } from './utils.js';

let currentToken = null;
let messageUnsubscribe = null;

// ═══════════════════════════════════════════════════════
// initFCM: فقط اگه کاربر قبلاً اجازه داده باشه توکن می‌گیره
// (بی‌صدا اجرا می‌شه - اگه اجازه نداده، هیچ کاری نمی‌کنه)
// ═══════════════════════════════════════════════════════
export async function initFCM() {
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.warn('[FCM] پشتیبانی نمی‌شود');
      return null;
    }

    // اگه اجازه نوتیفیکیشن داده نشده، بی‌صدا رد شو
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

// ═══════════════════════════════════════════════════════
// requestPermissionAndInit: از داخل کلیک کاربر صدا زده می‌شه
// اجازه می‌گیره + توکن رو ذخیره می‌کنه
// ═══════════════════════════════════════════════════════
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

    // 🌟 درخواست اجازه (باید در پاسخ به کلیک کاربر باشه)
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

// ═══════════════════════════════════════════════════════
// کار مشترک: گرفتن توکن + ذخیره در Supabase
// ═══════════════════════════════════════════════════════
async function _doInitFCM() {
  // چک VAPID
  if (!VAPID_KEY || VAPID_KEY === 'PASTE_VAPID_KEY_HERE') {
    console.error('[FCM] VAPID_KEY تنظیم نشده!');
    return null;
  }

  // ثبت Service Worker
  const swRegistration = await navigator.serviceWorker.register(
    './firebase-messaging-sw.js',
    { scope: './' }
  );

  const messaging = await getMessagingInstance();
  if (!messaging) return null;

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: swRegistration,
  });

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

// ═══════════════════════════════════════════════════════
// 🌟 ذخیره توکن (جایگزینی: توکن‌های قبلی حذف می‌شن)
// ═══════════════════════════════════════════════════════
async function saveTokenToSupabase(token) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    // 🌟 قدم ۱: حذف تمام توکن‌های قدیمی این کاربر
    // (تا فقط دستگاه فعلی هشدار بگیره)
    await sb.from('fcm_tokens').delete().eq('user_id', user.id);

    // 🌟 قدم ۲: درج توکن جدید
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
      console.log('[FCM] ✅ توکن ذخیره شد (توکن‌های قبلی حذف شدن)');
    }
  } catch (e) {
    console.error('[FCM] خطا در saveToken:', e);
  }
}

// ═══════════════════════════════════════════════════════
// Listener پیام‌های foreground
// ═══════════════════════════════════════════════════════
async function setupForegroundListener(messaging) {
  if (messageUnsubscribe) messageUnsubscribe();

  messageUnsubscribe = onMessage(messaging, (payload) => {
    console.log('[FCM] 📩 پیام foreground:', payload);
    window.dispatchEvent(new CustomEvent('fcm-message', {
      detail: payload.data || {}
    }));
  });
}

// ═══════════════════════════════════════════════════════
// حذف توکن هنگام logout
// ═══════════════════════════════════════════════════════
export async function removeFCMToken() {
  if (!currentToken) return;
  try {
    await sb.from('fcm_tokens').delete().eq('token', currentToken);
    console.log('[FCM] توکن حذف شد');
  } catch (e) {
    console.error('[FCM] خطا در حذف توکن:', e);
  }
}

export function getCurrentToken() { return currentToken; }

export function getPermissionStatus() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;   // 'default' | 'granted' | 'denied'
}
