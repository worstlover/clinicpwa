// js/fcm.js
// ═══════════════════════════════════════════════════════
// مدیریت FCM (گرفتن توکن، ذخیره، دریافت پیام)
// ═══════════════════════════════════════════════════════
import { sb } from './sb.js';
import { getMessagingInstance, VAPID_KEY } from './firebase.js';
import { getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging.js';
import { toast } from './utils.js';

let currentToken = null;
let messageUnsubscribe = null;

// ═══════════════════════════════════════════════════════
// درخواست اجازه + گرفتن توکن
// ═══════════════════════════════════════════════════════
export async function initFCM() {
  try {
    // چک پشتیبانی
    if (!('Notification' in window)) {
      console.warn('[FCM] Notification API not supported');
      return null;
    }
    if (!('serviceWorker' in navigator)) {
      console.warn('[FCM] Service Worker not supported');
      return null;
    }

    // اگه کاربر قبلاً رد کرده، تموم
    if (Notification.permission === 'denied') {
      console.log('[FCM] Permission denied');
      return null;
    }

    // اگه permission داده نشده، درخواست کن (فقط یه بار)
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('[FCM] Permission not granted');
        return null;
      }
    }

    // ثبت service worker اگه قبلاً ثبت نشده
    const swRegistration = await navigator.serviceWorker.register(
      './firebase-messaging-sw.js',
      { scope: './' }
    );

    // گرفتن messaging instance
    const messaging = await getMessagingInstance();
    if (!messaging) return null;

    // گرفتن توکن
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });

    if (!token) {
      console.warn('[FCM] No token received');
      return null;
    }

    currentToken = token;
    console.log('[FCM] ✅ Token:', token.substring(0, 20) + '...');

    // ذخیره در Supabase
    await saveTokenToSupabase(token);

    // راه‌اندازی listener پیام‌های foreground
    setupForegroundListener(messaging);

    return token;

  } catch (e) {
    console.error('[FCM] Init failed:', e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// ذخیره توکن در Supabase
// ═══════════════════════════════════════════════════════
async function saveTokenToSupabase(token) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    // آپدیت یا insert
    const { error } = await sb
      .from('fcm_tokens')
      .upsert({
        user_id: user.id,
        token: token,
        platform: 'web',
        browser: navigator.userAgent.substring(0, 100),
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'token'
      });

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
    console.log('[FCM] 📩 Foreground:', payload);

    // اگه Realtime هم هشدار داده باشه، این رو ignore می‌کنیم
    // (چون Realtime توی incident-alert.js هندل می‌کنه)
    // فقط اگه Realtime قطع بود یا تاخیر داشت، FCM اینجا میاد.

    // به incident-alert اطلاع می‌دیم
    window.dispatchEvent(new CustomEvent('fcm-message', {
      detail: payload.data || {}
    }));
  });
}

// ═══════════════════════════════════════════════════════
// چک کلیک روی نوتیف (بعد از باز شدن اپ)
// ═══════════════════════════════════════════════════════
export function checkNotificationClick() {
  // چک URL params
  const params = new URLSearchParams(window.location.search);
  const type = params.get('fcm_type');
  const id = params.get('fcm_id');
  
  if (type) {
    console.log('[FCM] Opened from notification:', type, id);
    // پاک کردن URL params
    window.history.replaceState({}, '', window.location.pathname);
    return { type, id };
  }
  return null;
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

// ═══════════════════════════════════════════════════════
// دریافت توکن فعلی (برای دیباگ)
// ═══════════════════════════════════════════════════════
export function getCurrentToken() {
  return currentToken;
}

// ═══════════════════════════════════════════════════════
// چک وضعیت پرمیشن
// ═══════════════════════════════════════════════════════
export function getPermissionStatus() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;  // 'default' | 'granted' | 'denied'
}
