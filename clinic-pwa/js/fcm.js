// js/fcm.js
import { sb } from './sb.js';
import { getMessagingInstance, VAPID_KEY, firebase } from './firebase.js';
import { toast } from './utils.js';

let currentToken = null;
let messageUnsubscribe = null;
let visibilityBound = false;

// ═══════════════════════════════════════════════════════
// initFCM
// ═══════════════════════════════════════════════════════
export async function initFCM() {
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return null;
    if (Notification.permission !== 'granted') {
      console.log('[FCM] Permission not granted');
      bindVisibilityRefresh();
      return null;
    }
    return await _doInitFCM();
  } catch (e) {
    console.error('[FCM] initFCM failed:', e);
    return null;
  }
}

function bindVisibilityRefresh() {
  if (visibilityBound) return;
  visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Notification.permission === 'granted') {
      console.log('[FCM] App resumed → refreshing token');
      _doInitFCM().catch(e => console.warn('[FCM] resume init failed:', e));
    }
  });
}

// ═══════════════════════════════════════════════════════
// درخواست اجازه + init
// ═══════════════════════════════════════════════════════
export async function requestPermissionAndInit() {
  try {
    if (!('Notification' in window)) {
      toast('مرورگر شما از نوتیفیکیشن پشتیبانی نمی‌کند', 'warning');
      return null;
    }
    if (Notification.permission === 'denied') {
      toast('نوتیفیکیشن مسدود شده. از تنظیمات گوشی فعال کن', 'warning');
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

// ═══════════════════════════════════════════════════════
// کار مشترک
// ═══════════════════════════════════════════════════════
async function _doInitFCM() {
  if (!VAPID_KEY || VAPID_KEY === 'PASTE_VAPID_KEY_HERE') {
    console.error('[FCM] VAPID_KEY not set');
    return null;
  }

  let swRegistration;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    swRegistration = regs.find(r => r.active?.scriptURL.includes('firebase-messaging-sw.js'));

    if (!swRegistration) {
      swRegistration = await navigator.serviceWorker.register(
        './firebase-messaging-sw.js',
        { scope: './firebase-cloud-messaging-push-scope' }
      );
    }

    if (swRegistration.installing) {
      await new Promise((resolve) => {
        swRegistration.installing.addEventListener('statechange', (e) => {
          if (e.target.state === 'activated') resolve();
        });
        setTimeout(resolve, 10000);
      });
    }
    if (!swRegistration.active) await navigator.serviceWorker.ready;
  } catch (e) {
    console.error('[FCM] SW registration failed:', e);
    return null;
  }

  const messaging = await getMessagingInstance();
  if (!messaging) return null;

  let token;
  try {
    token = await messaging.getToken({
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });
  } catch (e) {
    console.error('[FCM] getToken failed:', e);
    return null;
  }

  if (!token) return null;

  currentToken = token;
  console.log('[FCM] ✅ Token:', token.substring(0, 25) + '...');

  await saveTokenToSupabase(token);
  setupForegroundListener(messaging);
  bindVisibilityRefresh();

  return token;
}

// ═══════════════════════════════════════════════════════
// ذخیره توکن در Supabase (UPSERT روی user_id)
// ═══════════════════════════════════════════════════════
async function saveTokenToSupabase(token) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      console.warn('[FCM] No user logged in');
      return;
    }

    // UPSERT روی user_id: هر کاربر فقط یک توکن دارد
    // اگر دستگاه جدید بیاید، توکن قدیمی جایگزین می‌شود
    const { error } = await sb.from('fcm_tokens').upsert({
      user_id: user.id,
      token: token,
      platform: 'web',
      browser: navigator.userAgent.substring(0, 100),
      user_agent: navigator.userAgent.substring(0, 200),
      last_seen: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',   // ✅ اصلاح شد: روی user_id
    });

    if (error) {
      console.error('[FCM] Upsert failed:', error);
    } else {
      console.log('[FCM] ✅ Token upserted for user:', user.id);
    }
  } catch (e) {
    console.error('[FCM] saveToken error:', e);
  }
}

// ═══════════════════════════════════════════════════════
// Foreground listener (compat)
// ═══════════════════════════════════════════════════════
function setupForegroundListener(messaging) {
  if (messageUnsubscribe) messageUnsubscribe();
  messageUnsubscribe = messaging.onMessage((payload) => {
    console.log('[FCM] 📩 Foreground:', payload);
    window.dispatchEvent(new CustomEvent('fcm-message', {
      detail: payload.data || {}
    }));
  });
}

export async function removeFCMToken() {
  if (!currentToken) return;
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    // حذف توکن کاربر جاری
    await sb.from('fcm_tokens').delete().eq('user_id', user.id);
    currentToken = null;
    console.log('[FCM] ✅ Token removed');
  } catch (e) {
    console.error('[FCM] Remove failed:', e);
  }
}

export function getCurrentToken() { return currentToken; }

export function getPermissionStatus() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function getTokenStatus() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { saved: false, lastSeen: null, count: 0 };

    const { data } = await sb.from('fcm_tokens')
      .select('token, last_seen')
      .eq('user_id', user.id)
      .order('last_seen', { ascending: false });

    const currentMatches = data?.find(t => t.token === currentToken);

    return {
      saved: !!currentMatches,
      lastSeen: currentMatches?.last_seen || data?.[0]?.last_seen || null,
      count: data?.length || 0,
    };
  } catch (e) {
    return { saved: false, lastSeen: null, count: 0 };
  }
}
