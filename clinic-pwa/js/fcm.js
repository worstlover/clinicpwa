// js/fcm.js

import { VAPID_KEY, getMessagingInstance } from './firebase.js';
import { sb } from './sb.js';
import { toast } from './utils.js';

let currentToken = null;
let isListenerAttached = false;

// ابزار تبدیل VAPID Key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getSWRegistration() {
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    reg = await navigator.serviceWorker.register('./service-worker.js');
  }
  await navigator.serviceWorker.ready;
  return reg;
}

export function getPermissionStatus() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

// ═══════════════════════════════════════════════════════════════
// ⭐️ اصلاح اصلی: مجبور کردن مرورگر به ساخت Subscription
// ═══════════════════════════════════════════════════════════════
async function forceSubscribePush(swReg) {
  try {
    let sub = await swReg.pushManager.getSubscription();
    if (sub) return sub;

    console.log('[FCM] No existing subscription, trying to create one...');
    
    // بررسی معتبر بودن VAPID Key
    if (!VAPID_KEY || VAPID_KEY.length < 50) {
      throw new Error('VAPID_KEY نامعتبر است یا تنظیم نشده است.');
    }

    sub = await swReg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_KEY)
    });
    console.log('[FCM] ✅ Push subscription created:', sub.endpoint);
    return sub;
  } catch (e) {
    console.error('[FCM] forceSubscribePush error:', e);
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════════
// درخواست مجوز و ساخت توکن (از روی کلیک کاربر)
// ═══════════════════════════════════════════════════════════════
export async function requestPermissionAndInit() {
  try {
    if (!VAPID_KEY) return { ok: false, reason: 'no-vapid' };
    if (!('Notification' in window)) return { ok: false, reason: 'unsupported' };
    
    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await Notification.requestPermission();
    }
    if (perm !== 'granted') {
      return { ok: false, reason: 'not-granted', permission: perm };
    }

    const messaging = await getMessagingInstance();
    if (!messaging) return { ok: false, reason: 'no-messaging' };

    const swReg = await getSWRegistration();
    
    // ۱. اول دستی سابسکرایب می‌کنیم
    await forceSubscribePush(swReg);

    // ۲. حالا توکن را می‌گیریم
    const token = await messaging.getToken({
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg
    }).catch(err => {
      console.error('[FCM] getToken after subscribe failed:', err);
      return null;
    });

    if (!token) return { ok: false, reason: 'no-token' };

    currentToken = token;
    const saved = await saveTokenToDB(token);
    await setupMessageListener(messaging);

    if (saved) toast('✅ هشدارها فعال شدند', 'success');
    return { ok: true, token, saved };
  } catch (error) {
    console.error('[FCM] requestPermissionAndInit error:', error);
    return { ok: false, reason: 'exception', error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// Init در پس‌زمینه
// ═══════════════════════════════════════════════════════════════
export async function initFCM() {
  try {
    const permission = getPermissionStatus();
    console.log('[FCM] initFCM — permission:', permission);

    if (permission !== 'granted') {
      return { ok: false, reason: permission };
    }

    const messaging = await getMessagingInstance();
    if (!messaging) return { ok: false, reason: 'no-messaging' };

    const swReg = await getSWRegistration();
    
    // ⭐️ در پس‌زمینه هم دستی سابسکرایب می‌کنیم تا خطای Error retrieving push subscription رفع شود
    await forceSubscribePush(swReg);

    const token = await messaging.getToken({
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg
    }).catch(err => {
      console.warn('[FCM] getToken failed in background:', err.message);
      return null;
    });

    if (!token) {
      console.error('[FCM] failed to get token');
      return { ok: false, reason: 'no-token' };
    }

    currentToken = token;
    const saved = await saveTokenToDB(token);
    await setupMessageListener(messaging);

    console.log('[FCM] ✅ token refreshed', saved ? 'and saved' : '(save failed)');
    return { ok: saved, token, reason: saved ? 'ok' : 'save-failed' };
  } catch (error) {
    console.error('[FCM] initFCM error:', error);
    return { ok: false, reason: 'exception', error: error.message };
  }
}

async function setupMessageListener(messaging) {
  if (isListenerAttached) return;
  try {
    messaging.onMessage((payload) => {
      console.log('[FCM] message received:', payload);
      if (payload.notification) {
        const title = payload.notification.title || 'پیام جدید';
        const body = payload.notification.body || '';
        if (Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/icons/icon-192.png' });
        }
        toast(`🔔 ${title}: ${body}`, 'info');
      }
    });
    isListenerAttached = true;
  } catch (e) {
    console.error('[FCM] listener error:', e);
  }
}

async function saveTokenToDB(token) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;

    // پاک کردن توکن‌های تکراری از کاربران دیگر
    await sb.from('user_tokens').delete().eq('token', token).neq('user_id', user.id);

    const { data: existing, error: selError } = await sb.from('user_tokens')
      .select('id').eq('user_id', user.id).eq('token', token).maybeSingle();

    if (selError) return false;

    if (existing) {
      await sb.from('user_tokens').update({ updated_at: new Date().toISOString() }).eq('id', existing.id);
      console.log('[FCM] ✅ existing token updated');
    } else {
      const { error: insError } = await sb.from('user_tokens').insert({
        user_id: user.id,
        token,
        updated_at: new Date().toISOString(),
        platform: 'web'
      });
      if (insError) {
        console.error('[FCM] insert token error (RLS?):', insError);
        return false;
      }
      console.log('[FCM] ✅ new token inserted');
    }
    return true;
  } catch (err) {
    console.error('[FCM] saveTokenToDB unexpected:', err);
    return false;
  }
}

export async function getTokenStatus() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { saved: false, count: 0, lastSeen: null };

    const { data: tokens, error } = await sb.from('user_tokens').select('token, updated_at').eq('user_id', user.id);
    if (error || !tokens || tokens.length === 0) return { saved: false, count: 0, lastSeen: null };

    const lastSeen = tokens.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0]?.updated_at;

    return {
      saved: currentToken ? tokens.some(t => t.token === currentToken) : tokens.length > 0,
      count: tokens.length,
      lastSeen
    };
  } catch (err) {
    return { saved: false, count: 0, lastSeen: null };
  }
}

export async function removeFCMToken() {
  try {
    const messaging = await getMessagingInstance();
    if (messaging) {
      const swReg = await getSWRegistration();
      const current = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg }).catch(() => null);
      if (current) {
        await messaging.deleteToken();
        const { data: { user } } = await sb.auth.getUser();
        if (user) await sb.from('user_tokens').delete().eq('user_id', user.id).eq('token', current);
      }
    }
    currentToken = null;
  } catch (err) {}
}
