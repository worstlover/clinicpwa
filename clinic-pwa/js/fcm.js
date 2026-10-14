// js/fcm.js
import { sb } from './sb.js';
import { getMessagingInstance, VAPID_KEY } from './firebase.js';
import { getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging.js';
import { toast } from './utils.js';

let currentToken = null;
let messageUnsubscribe = null;

// ═══════════════════════════════════════════════════════
// 🌟 initFCM: فقط توکن می‌گیره اگه permission قبلاً داده شده
// (اگه permission نداده، هیچ درخواستی نمی‌کنه — بی‌صدا رد می‌شه)
// ═══════════════════════════════════════════════════════
export async function initFCM() {
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.warn('[FCM] Not supported');
      return null;
    }

    // 🌟 اگه permission داده نشده یا رد شده، هیچ کاری نکن
    if (Notification.permission !== 'granted') {
      console.log('[FCM] Permission not granted yet, skipping auto-init');
      return null;
    }

    return await _doInitFCM();
  } catch (e) {
    console.error('[FCM] initFCM failed:', e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// 🌟 requestPermissionAndInit: از کلیک کاربر صدا زده می‌شه
// این تابع permission می‌گیره + توکن رو ذخیره می‌کنه
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

    // 🌟 درخواست اجازه (فقط در پاسخ به کلیک کاربر مجازه)
    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      toast('اجازه نوتیفیکیشن داده نشد', 'warning');
      return null;
    }

    toast('✅ نوتیفیکیشن فعال شد', 'success');
    return await _doInitFCM();

  } catch (e) {
    console.error('[FCM] requestPermission failed:', e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// کار مشترک: گرفتن توکن + ذخیره
// ═══════════════════════════════════════════════════════
async function _doInitFCM() {
  // چک VAPID
  if (!VAPID_KEY || VAPID_KEY === 'PASTE_VAPID_KEY_HERE') {
    console.error('[FCM] VAPID_KEY not set in firebase.js!');
    return null;
  }

  // ثبت service worker
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
    console.warn('[FCM] No token received');
    return null;
  }

  currentToken = token;
  console.log('[FCM] ✅ Token obtained:', token.substring(0, 25) + '...');

  await saveTokenToSupabase(token);
  setupForegroundListener(messaging);

  return token;
}

// ═══════════════════════════════════════════════════════
// ذخیره توکن در Supabase
// ═══════════════════════════════════════════════════════
async function saveTokenToSupabase(token) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const { error } = await sb
      .from('fcm_tokens')
      .upsert({
        user_id: user.id,
        token: token,
        platform: 'web',
        browser: navigator.userAgent.substring(0, 100),
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'token' });

    if (error) {
      console.error('[FCM] Save token failed:', error);
    } else {
      console.log('[FCM] ✅ Token saved to Supabase');
    }
  } catch (e) {
    console.error('[FCM] saveToken error:', e);
  }
}

// ═══════════════════════════════════════════════════════
// Listener پیام‌های foreground
// ═══════════════════════════════════════════════════════
async function setupForegroundListener(messaging) {
  if (messageUnsubscribe) messageUnsubscribe();

  messageUnsubscribe = onMessage(messaging, (payload) => {
    console.log('[FCM] 📩 Foreground message:', payload);
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
    console.log('[FCM] Token removed');
  } catch (e) {
    console.error('[FCM] Remove token failed:', e);
  }
}

export function getCurrentToken() { return currentToken; }

export function getPermissionStatus() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;   // 'default' | 'granted' | 'denied'
}
