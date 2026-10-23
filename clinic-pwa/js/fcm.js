// js/fcm.js

import { VAPID_KEY, getMessagingInstance } from './firebase.js';
import { sb } from './sb.js';
import { toast } from './utils.js';

let currentToken = null;
let isListenerAttached = false;

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

async function forceSubscribePush(swReg) {
  try {
    let sub = await swReg.pushManager.getSubscription();
    if (sub) return sub;
    
    if (!VAPID_KEY || VAPID_KEY.length < 50) {
      throw new Error('VAPID_KEY نامعتبر است.');
    }

    sub = await swReg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_KEY)
    });
    return sub;
  } catch (e) {
    console.error('[FCM] forceSubscribePush error:', e);
    throw e;
  }
}

export async function requestPermissionAndInit() {
  try {
    if (!VAPID_KEY) return { ok: false, reason: 'no-vapid' };
    if (!('Notification' in window)) return { ok: false, reason: 'unsupported' };
    
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: 'not-granted', permission: perm };

    const messaging = await getMessagingInstance();
    if (!messaging) return { ok: false, reason: 'no-messaging' };

    const swReg = await getSWRegistration();
    await forceSubscribePush(swReg);

    const token = await messaging.getToken({
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg
    }).catch(err => {
      console.error('[FCM] getToken failed:', err);
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
    await forceSubscribePush(swReg);

    const token = await messaging.getToken({
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg
    }).catch(err => {
      console.warn('[FCM] getToken failed in background:', err.message);
      return null;
    });

    if (!token) return { ok: false, reason: 'no-token' };

    currentToken = token;
    const saved = await saveTokenToDB(token);
    await setupMessageListener(messaging);

    if (saved) {
      console.log('[FCM] ✅ token refreshed and saved');
      return { ok: true, token, reason: 'ok' };
    } else {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        console.log('[FCM] ⏳ token ready (will save after login)');
        return { ok: true, token, reason: 'no-user-yet' };
      }
      console.warn('[FCM] ⚠️ token ready but DB save failed');
      return { ok: false, reason: 'save-failed' };
    }
  } catch (error) {
    console.error('[FCM] initFCM error:', error);
    return { ok: false, reason: 'exception', error: error.message };
  }
}

// ⭐️ اصلاح نمایش نوتیف در فورگراند
async function setupMessageListener(messaging) {
  if (isListenerAttached) return;
  try {
    messaging.onMessage(async (payload) => {
      console.log('[FCM] message received (foreground):', payload);
      
      const data = payload.data || {};
      const title = data.title || payload.notification?.title || 'پیام جدید';
      const body = data.body || payload.notification?.body || '';

      // استفاده از showNotification مرورگر برای اندروید
      const reg = await navigator.serviceWorker.ready;
      
      // استخراج بیس‌آدرس پروژه
      let base = window.location.href;
      if (base.includes('index.html')) base = base.split('index.html')[0];
      if (!base.endsWith('/')) base += '/';

      reg.showNotification(title, {
        body: body,
        icon: new URL('icons/icon-192.png', base).href,
        badge: new URL('icons/badge-96.png', base).href,
        vibrate: [200, 100, 200],
        data: data
      });

      toast(`🔔 ${title}: ${body}`, 'info');
    });
    isListenerAttached = true;
  } catch (e) {
    console.error('[FCM] listener error:', e);
  }
}

// ⭐️ اصلاح ثبت توکن با upsert (جلوگیری از رکورد تکراری)
async function saveTokenToDB(token) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;

    const now = new Date().toISOString();
    
    // پاک کردن توکن مشابه از کاربران دیگر (برای امنیت)
    await sb.from('fcm_tokens').delete().eq('token', token).neq('user_id', user.id);

    // Upsert: اگر وجود دارد آپدیت، اگر ندارد درج کند
    const { error } = await sb.from('fcm_tokens').upsert({
      user_id: user.id,
      token: token,
      platform: 'web',
      browser: navigator.userAgent.substring(0, 50),
      user_agent: navigator.userAgent,
      updated_at: now,
      last_seen: now
    }, { 
      onConflict: 'user_id,token' 
    });

    if (error) {
      console.error('[FCM] upsert token error:', error);
      return false;
    }
    
    console.log('[FCM] ✅ token upserted successfully');
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

    const { data: tokens, error } = await sb.from('fcm_tokens').select('token, updated_at').eq('user_id', user.id);
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
        if (user) await sb.from('fcm_tokens').delete().eq('user_id', user.id).eq('token', current);
      }
    }
    currentToken = null;
  } catch (err) {}
}
