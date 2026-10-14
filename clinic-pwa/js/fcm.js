// js/fcm.js
import { sb } from './sb.js';
import { getMessagingInstance, VAPID_KEY } from './firebase.js';
import { getToken, onMessage } from '../lib/firebase/firebase-messaging.js';
import { toast } from './utils.js';

let currentToken = null;
let messageUnsubscribe = null;
let visibilityBound = false;

// ═══════════════════════════════════════════════════════
// initFCM - هر بار که اپ باز می‌شه یا foreground میاد
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

// 🌟 هر بار اپ برمی‌گرده، دوباره init کن
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
    token = await getToken(messaging, {
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
// 🌟 ذخیره با UPSERT (بدون حذف توکن‌های دیگر)
// ═══════════════════════════════════════════════════════
async function saveTokenToSupabase(token) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const { error } = await sb.from('fcm_tokens').upsert({
      user_id: user.id,
      token: token,
      platform: 'web',
      browser: navigator.userAgent.substring(0, 100),
      user_agent: navigator.userAgent.substring(0, 200),
      last_seen: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'token',   // 🌟 فقط بر اساس token یکتا
    });

    if (error) {
      console.error('[FCM] Upsert failed:', error);
    } else {
      console.log('[FCM] ✅ Token upserted');
    }
  } catch (e) {
    console.error('[FCM] saveToken error:', e);
  }
}

// ═══════════════════════════════════════════════════════
// Foreground listener
// ═══════════════════════════════════════════════════════
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

// 🌟 گرفتن وضعیت توکن برای صفحه تنظیمات
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
