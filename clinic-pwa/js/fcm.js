// js/fcm.js
import { sb } from './sb.js';
import { getMessagingInstance, VAPID_KEY } from './firebase.js';
import { getToken, onMessage } from '../lib/firebase/firebase-messaging.js';
import { toast } from './utils.js';

let currentToken = null;
let messageUnsubscribe = null;

// ═══════════════════════════════════════════════════════
// 🌟 initFCM: هر بار که اپ باز می‌شه صدا زده می‌شه
// (بدون توجه به permission - اگه اجازه داره، توکن رو تازه می‌کنه)
// ═══════════════════════════════════════════════════════
export async function initFCM() {
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.warn('[FCM] Not supported');
      return null;
    }

    if (Notification.permission !== 'granted') {
      console.log('[FCM] Permission not granted');
      return null;
    }

    // 🌟 هر بار که اپ باز می‌شه، Service Worker رو register/check کن
    // (چون در TWA ممکنه unregister بشه)
    return await _doInitFCM();
  } catch (e) {
    console.error('[FCM] initFCM failed:', e);
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
      toast('نوتیفیکیشن مسدود شده', 'warning');
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
    console.error('[FCM] requestPermission failed:', e);
    return null;
  }
}

async function _doInitFCM() {
  if (!VAPID_KEY || VAPID_KEY === 'PASTE_VAPID_KEY_HERE') {
    console.error('[FCM] VAPID_KEY not set');
    return null;
  }

  // ═══════════════════════════════════════════════════════
  // 🌟 ثبت مجدد Service Worker (حتی اگه قبلاً ثبت شده)
  // ═══════════════════════════════════════════════════════
  let swRegistration;
  try {
    // چک کن قبلاً ثبت شده یا نه
    const existingRegs = await navigator.serviceWorker.getRegistrations();
    swRegistration = existingRegs.find(r => 
      r.active?.scriptURL.includes('firebase-messaging-sw.js')
    );

    if (!swRegistration) {
      console.log('[FCM] Registering firebase-messaging-sw.js...');
      swRegistration = await navigator.serviceWorker.register(
        './firebase-messaging-sw.js',
        { scope: './firebase-cloud-messaging-push-scope' }
      );
    } else {
      console.log('[FCM] SW already registered');
    }

    // 🌟 منتظر بمون تا فعال بشه
    if (swRegistration.installing) {
      await new Promise((resolve) => {
        const sw = swRegistration.installing;
        sw.addEventListener('statechange', (e) => {
          if (e.target.state === 'activated') resolve();
        });
        // تایم اوت ۱۰ ثانیه
        setTimeout(resolve, 10000);
      });
    }

    // 🌟 چک کن active هست
    if (!swRegistration.active) {
      await navigator.serviceWorker.ready;
    }
  } catch (e) {
    console.error('[FCM] SW registration failed:', e);
    return null;
  }

  // ═══════════════════════════════════════════════════════
  // گرفتن messaging instance و توکن
  // ═══════════════════════════════════════════════════════
  const messaging = await getMessagingInstance();
  if (!messaging) {
    console.error('[FCM] messaging instance not available');
    return null;
  }

  let token;
  try {
    token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });
  } catch (e) {
    console.error('[FCM] getToken failed:', e);
    return null;
  }

  if (!token) {
    console.warn('[FCM] No token received');
    return null;
  }

  currentToken = token;
  console.log('[FCM] ✅ Token:', token.substring(0, 25) + '...');

  await saveTokenToSupabase(token);
  setupForegroundListener(messaging);

  return token;
}

// ═══════════════════════════════════════════════════════
// ذخیره توکن - فقط اگه تغییر کرده
// ═══════════════════════════════════════════════════════
async function saveTokenToSupabase(token) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    // 🌟 چک کن توکن فعلی همینه یا نه
    const { data: existing } = await sb.from('fcm_tokens')
      .select('id, token')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing && existing.token === token) {
      // فقط last_seen رو آپدیت کن
      await sb.from('fcm_tokens')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', existing.id);
      console.log('[FCM] Token unchanged, only updated last_seen');
      return;
    }

    // توکن تغییر کرده یا وجود نداره → جایگزین کن
    await sb.from('fcm_tokens').delete().eq('user_id', user.id);

    const { error } = await sb.from('fcm_tokens').insert({
      user_id: user.id,
      token: token,
      platform: 'web',
      browser: navigator.userAgent.substring(0, 100),
      last_seen: new Date().toISOString(),
    });

    if (error) {
      console.error('[FCM] Save token failed:', error);
    } else {
      console.log('[FCM] ✅ Token saved (old ones removed)');
    }
  } catch (e) {
    console.error('[FCM] saveToken error:', e);
  }
}

async function setupForegroundListener(messaging) {
  if (messageUnsubscribe) messageUnsubscribe();
  messageUnsubscribe = onMessage(messaging, (payload) => {
    console.log('[FCM] 📩 Foreground:', payload);
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
    console.error('[FCM] Remove failed:', e);
  }
}

export function getCurrentToken() { return currentToken; }

export function getPermissionStatus() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}
