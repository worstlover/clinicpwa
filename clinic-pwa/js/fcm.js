// js/fcm.js

import { 
  VAPID_KEY, 
  getMessagingInstance 
} from './firebase.js';
import { sb } from './sb.js';
import { toast } from './utils.js';

let currentToken = null;
let isListenerAttached = false; 

/**
 * وضعیت دسترسی به نوتیفیکیشن مرورگر
 */
export function getPermissionStatus() {
  if (!('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * وضعیت توکن FCM در دیتابیس (اصلاح شده برای رفع مشکل "توکن یافت نشد")
 */
export async function getTokenStatus() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { saved: false, count: 0, lastSeen: null };

    const { data: tokens, error } = await sb.from('user_tokens')
      .select('token, updated_at')
      .eq('user_id', user.id);

    if (error || !tokens || tokens.length === 0) {
      return { saved: false, count: 0, lastSeen: null };
    }

    const count = tokens.length;
    const lastSeen = tokens.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0]?.updated_at;
    
    // ⭐ اگر توکن در حافظه نبود (مثلاً بعد از رفرش)، از مرورگر می‌گیریم
    let actualToken = currentToken;
    if (!actualToken) {
      try {
        const messaging = await getMessagingInstance();
        if (messaging) {
          const tokenPromise = messaging.getToken({ vapidKey: VAPID_KEY });
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000));
          actualToken = await Promise.race([tokenPromise, timeoutPromise]).catch(() => null);
          if (actualToken) currentToken = actualToken; 
        }
      } catch (e) {}
    }

    const currentSaved = actualToken 
      ? tokens.some(t => t.token === actualToken) 
      : false;

    return {
      saved: currentSaved,
      count: count,
      lastSeen: lastSeen
    };
  } catch (err) {
    console.error('[FCM] خطا در دریافت وضعیت توکن:', err);
    return { saved: false, count: 0, lastSeen: null };
  }
}

/**
 * اتصال لیسنر پیام‌ها (فقط یکبار اجرا می‌شود)
 */
async function setupMessageListener(messaging) {
  if (isListenerAttached) return;
  
  try {
    messaging.onMessage((payload) => {
      console.log('[FCM] پیام دریافت شد:', payload);
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
    console.log('[FCM] ✅ Message listener attached');
  } catch (e) {
    console.error('[FCM] خطا در اتصال لیسنر:', e);
  }
}

/**
 * درخواست اجازه و راه‌اندازی FCM (برای دکمه فعال‌سازی در settings.js)
 */
export async function requestPermissionAndInit() {
  try {
    if (!VAPID_KEY) {
      console.error('[FCM] VAPID_KEY یافت نشد.');
      return null;
    }

    if (!('Notification' in window)) {
      console.warn('[FCM] این مرورگر از نوتیفیکیشن پشتیبانی نمی‌کند.');
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[FCM] کاربر اجازه نوتیفیکیشن را رد کرد.');
      return null;
    }

    const messaging = await getMessagingInstance();
    if (!messaging) {
      console.warn('[FCM] امکان ساخت messaging وجود ندارد.');
      return null;
    }

    const token = await messaging.getToken({ vapidKey: VAPID_KEY });
    console.log('[FCM] Token دریافت شد:', token);

    if (token) {
      currentToken = token;
      await saveTokenToDB(token);
      await setupMessageListener(messaging);
      return token;
    }
    return null;
  } catch (error) {
    console.error('[FCM] خطا در فرآیند ثبت‌نام:', error);
    if (error.code === 'messaging/permission-blocked') {
      toast('دسترسی به نوتیفیکیشن مسدود شده است.', 'warning');
    } else {
      toast('خطا در راه‌اندازی نوتیفیکیشن‌ها', 'danger');
    }
    return null;
  }
}

/**
 * راه‌اندازی FCM در پس‌زمینه هنگام ورود کاربر
 */
export async function initFCM() {
  try {
    const permission = getPermissionStatus();
    
    if (permission === 'unsupported') {
      console.warn('[FCM] مرورگر از نوتیفیکیشن پشتیبانی نمی‌کند.');
      return;
    }
    
    if (permission === 'granted') {
      const messaging = await getMessagingInstance();
      if (!messaging) return;

      // محدودیت زمانی ۱۰ ثانیه‌ای تا برنامه گیر نکند
      const tokenPromise = messaging.getToken({ vapidKey: VAPID_KEY });
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('FCM Timeout')), 10000)
      );

      const token = await Promise.race([tokenPromise, timeoutPromise]).catch(err => {
        console.warn('[FCM] دریافت توکن کند بود یا انجام نشد:', err.message);
        return null;
      });

      if (token) {
        currentToken = token;
        await saveTokenToDB(token);
        await setupMessageListener(messaging);
        console.log('[FCM] ✅ توکن در پس‌زمینه به‌روزرسانی شد.');
      }
    } else {
      console.log('[FCM] کاربر هنوز اجازه نداده است.');
    }
  } catch (error) {
    console.error('[FCM] خطا در راه‌اندازی خودکار:', error);
  }
}

/**
 * ذخیره توکن در دیتابیس (با پشتیبانی از چند دستگاه و پاکسازی توکن‌های قبلی)
 */
async function saveTokenToDB(token) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    // ⭐ اصلاح امنیتی: اگر این دستگاه قبلاً برای کاربر دیگری بوده، توکنش را پاک کن
    await sb.from('user_tokens').delete().eq('token', token).neq('user_id', user.id);

    const { data: existing } = await sb.from('user_tokens')
      .select('id')
      .eq('user_id', user.id)
      .eq('token', token)
      .maybeSingle();

    if (existing) {
      await sb.from('user_tokens').update({
        updated_at: new Date().toISOString()
      }).eq('id', existing.id);
    } else {
      await sb.from('user_tokens').insert({
        user_id: user.id,
        token: token,
        updated_at: new Date().toISOString(),
        platform: 'web'
      });
    }
    console.log('[FCM] ✅ توکن در دیتابیس ذخیره/آپدیت شد.');
  } catch (err) {
    console.error('[FCM] خطا در ذخیره توکن:', err);
  }
}

/**
 * حذف توکن (هنگام خروج از حساب)
 */
export async function removeFCMToken() {
  try {
    if (!currentToken) {
        // اگر توکن در حافظه نبود، سعی کن از مرورگر بگیری تا پاک شود
        const messaging = await getMessagingInstance();
        if (messaging) {
            currentToken = await messaging.getToken({ vapidKey: VAPID_KEY }).catch(() => null);
        }
    }
    
    if (!currentToken) return;

    const messaging = await getMessagingInstance();
    if (messaging) {
      await messaging.deleteToken();
      console.log('[FCM] توکن از مرورگر حذف شد.');
    }

    const { data: { user } } = await sb.auth.getUser();
    if (user && currentToken) {
      await sb.from('user_tokens').delete().eq('user_id', user.id).eq('token', currentToken);
      console.log('[FCM] توکن از دیتابیس حذف شد.');
    }

    currentToken = null;
  } catch (err) {
    console.error('[FCM] خطا در حذف توکن:', err);
  }
    }
