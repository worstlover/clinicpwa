// js/fcm.js

import { VAPID_KEY, getMessagingInstance } from './firebase.js';
import { sb } from './sb.js';
import { toast } from './utils.js';

let currentToken = null;
let isListenerAttached = false;

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
// ⭐ NEW: درخواست مجوز + ذخیره توکن — از روی کلیک کاربر
// ═══════════════════════════════════════════════════════════════
export async function requestPermissionAndInit() {
  try {
    if (!VAPID_KEY) {
      console.error('[FCM] VAPID_KEY missing');
      return { ok: false, reason: 'no-vapid' };
    }
    if (!('Notification' in window)) {
      return { ok: false, reason: 'unsupported' };
    }
    if (Notification.permission === 'denied') {
      toast('نوتیفیکیشن در مرورگر مسدود شده. از تنظیمات مرورگر اجازه دهید.', 'warning');
      return { ok: false, reason: 'denied' };
    }

    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await Notification.requestPermission();
    }
    if (perm !== 'granted') {
      console.warn('[FCM] permission not granted:', perm);
      return { ok: false, reason: 'not-granted', permission: perm };
    }

    const messaging = await getMessagingInstance();
    if (!messaging) {
      console.warn('[FCM] no messaging instance');
      return { ok: false, reason: 'no-messaging' };
    }

    const swReg = await getSWRegistration();
    const token = await messaging.getToken({
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg
    }).catch(err => {
      console.error('[FCM] getToken failed:', err);
      return null;
    });

    if (!token) {
      console.error('[FCM] no token returned');
      return { ok: false, reason: 'no-token' };
    }

    currentToken = token;
    const saved = await saveTokenToDB(token);
    await setupMessageListener(messaging);

    if (saved) toast('✅ هشدارها فعال شدند', 'success');
    return { ok: true, token, saved };
  } catch (error) {
    console.error('[FCM] requestPermissionAndInit error:', error);
    toast('خطا در فعال‌سازی نوتیفیکیشن', 'danger');
    return { ok: false, reason: 'exception', error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// ⭐ FIXED: initFCM — با لاگ، retry، و return وضعیت
// ═══════════════════════════════════════════════════════════════
export async function initFCM() {
  try {
    const permission = getPermissionStatus();
    console.log('[FCM] initFCM — permission:', permission);

    if (permission === 'unsupported') {
      return { ok: false, reason: 'unsupported' };
    }
    if (permission === 'default') {
      console.log('[FCM] permission default → needs user gesture to enable');
      return { ok: false, reason: 'needs-permission' };
    }
    if (permission === 'denied') {
      console.warn('[FCM] permission denied — user must unblock in browser settings');
      return { ok: false, reason: 'denied' };
    }

    // granted
    const messaging = await getMessagingInstance();
    if (!messaging) {
      return { ok: false, reason: 'no-messaging' };
    }

    const token = await refreshTokenWithRetry(messaging, 2);
    if (!token) {
      console.error('[FCM] failed to get token after retries');
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

async function refreshTokenWithRetry(messaging, attempts = 2) {
  for (let i = 0; i < attempts; i++) {
    try {
      const swReg = await getSWRegistration();
      const tokenPromise = messaging.getToken({
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 12000)
      );
      const token = await Promise.race([tokenPromise, timeoutPromise]);
      if (token) return token;
    } catch (e) {
      console.warn(`[FCM] token attempt ${i + 1}/${attempts} failed:`, e.message);
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 1500));
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Message listener
// ═══════════════════════════════════════════════════════════════
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
    console.log('[FCM] ✅ message listener attached');
  } catch (e) {
    console.error('[FCM] listener error:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// saveTokenToDB (بدون تغییر ساختاری — فقط لاگ بهتر)
// ═══════════════════════════════════════════════════════════════
async function saveTokenToDB(token) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      console.warn('[FCM] no user — cannot save token');
      return false;
    }

    // حذف توکن مشابه از کاربران دیگر
    const { error: delError } = await sb.from('user_tokens')
      .delete()
      .eq('token', token)
      .neq('user_id', user.id);
    if (delError) console.warn('[FCM] delete other-user token:', delError.message);

    // آیا این توکن قبلاً برای این کاربر هست؟
    const { data: existing, error: selError } = await sb.from('user_tokens')
      .select('id')
      .eq('user_id', user.id)
      .eq('token', token)
      .maybeSingle();
    if (selError) {
      console.error('[FCM] select token:', selError.message);
      return false;
    }

    if (existing) {
      const { error: updError } = await sb.from('user_tokens').update({
        updated_at: new Date().toISOString()
      }).eq('id', existing.id);
      if (updError) {
        console.error('[FCM] update token:', updError);
        return false;
      }
      console.log('[FCM] ✅ existing token updated');
      return true;
    }

    const { error: insError } = await sb.from('user_tokens').insert({
      user_id: user.id,
      token,
      updated_at: new Date().toISOString(),
      platform: 'web'
    });
    if (insError) {
      console.error('[FCM] insert token:', insError);
      toast('خطا در ذخیره توکن در سرور', 'danger');
      return false;
    }
    console.log('[FCM] ✅ new token inserted');
    return true;
  } catch (err) {
    console.error('[FCM] saveTokenToDB unexpected:', err);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// getTokenStatus و removeFCMToken — بدون تغییر
// ═══════════════════════════════════════════════════════════════
export async function getTokenStatus() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { saved: false, count: 0, lastSeen: null };

    const { data: tokens, error } = await sb.from('user_tokens')
      .select('token, updated_at').eq('user_id', user.id);
    if (error || !tokens || tokens.length === 0) {
      return { saved: false, count: 0, lastSeen: null };
    }

    const count = tokens.length;
    const lastSeen = tokens.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0]?.updated_at;

    let actualToken = currentToken;
    if (!actualToken) {
      try {
        const messaging = await getMessagingInstance();
        if (messaging) {
          const swReg = await getSWRegistration();
          const tokenPromise = messaging.getToken({
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: swReg
          });
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 8000)
          );
          actualToken = await Promise.race([tokenPromise, timeoutPromise]).catch(err => {
            console.warn('[FCM] getTokenStatus timeout:', err.message);
            return null;
          });
          if (actualToken) currentToken = actualToken;
        }
      } catch (e) {
        console.warn('[FCM] getTokenStatus messaging:', e);
      }
    }

    return {
      saved: actualToken ? tokens.some(t => t.token === actualToken) : false,
      count,
      lastSeen,
      actualTokenLoaded: !!actualToken
    };
  } catch (err) {
    console.error('[FCM] getTokenStatus error:', err);
    return { saved: false, count: 0, lastSeen: null };
  }
}

export async function removeFCMToken() {
  try {
    if (!currentToken) {
      const messaging = await getMessagingInstance();
      if (messaging) {
        const swReg = await getSWRegistration();
        currentToken = await messaging.getToken({
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg
        }).catch(() => null);
      }
    }
    if (!currentToken) return;

    const messaging = await getMessagingInstance();
    if (messaging) await messaging.deleteToken();

    const { data: { user } } = await sb.auth.getUser();
    if (user && currentToken) {
      const { error } = await sb.from('user_tokens')
        .delete().eq('user_id', user.id).eq('token', currentToken);
      if (error) console.error('[FCM] remove token:', error);
      else console.log('[FCM] token removed from DB');
    }
    currentToken = null;
  } catch (err) {
    console.error('[FCM] removeFCMToken error:', err);
  }
}
