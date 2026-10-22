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
 * وضعیت توکن FCM در دیتابیس (اصلاح شده)
 */
export async function getTokenStatus() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { saved: false, count: 0, lastSeen: null };

    const { data: tokens, error } = await sb.from('user_tokens')
      .select('token, updated_at')
      .eq('user_id', user.id);

    if (error) {
      console.error('[FCM] خطای دیتابیس در دریافت توکن‌ها:', error);
      return { saved: false, count: 0, lastSeen: null };
    }

    if (!tokens || tokens.length === 0) {
      return { saved: false, count: 0, lastSeen: null };
    }

    const count = tokens.length;
    const lastSeen = tokens.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0]?.updated_at;
    
    // ⭐ اگر توکن در حافظه نبود، با تایم‌اوت ۸ ثانیه‌ای از مرورگر می‌گیریم
    let actualToken = currentToken;
    if (!actualToken) {
      try {
        const messaging = await getMessagingInstance();
        if (messaging) {
          const tokenPromise = messaging.getToken({ vapidKey: VAPID_KEY });
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000));
          
          actualToken = await Promise.race([tokenPromise, timeoutPromise]).catch(err => {
            console.warn('[FCM] تایم‌اوت یا خطا در getTokenStatus:', err.message);
            return null;
          });
          
          if (actualToken) currentToken = actualToken; 
        }
      } catch (e) {
        console.warn('[FCM] خطا در دریافت messaging instance:', e);
      }
    }

    const currentSaved = actualToken 
      ? tokens.some(t => t.token === actualToken) 
      : false;

    return {
      saved: currentSaved,
      count: count,
      lastSeen: lastSeen,
      actualTokenLoaded: !!actualToken // ⭐ مشخص می‌کند آیا توکن با موفقیت از مرورگر گرفته شد یا نه
    };
  } catch (err) {
    console.error('[FCM] خطای کلی در getTokenStatus:', err);
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
 * درخواست اجازه و راه‌اندازی FCM
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
    if (!messaging) return null;

    const token = await messaging.getToken({ vapidKey: VAPID_KEY });
    console.log('[FCM] Token دریافت شد:', token);

    if (token) {
      currentToken = token;
      await saveTokenToDB(token); // ⭐ اینجا خطای RLS هندل می‌شود
      await setupMessageListener(messaging);
      return token;
    }
    return null;
  } catch (error) {
    console.error('[FCM] خطا در فرآیند ثبت‌نام:', error);
    toast('خطا در راه‌اندازی نوتیفیکیشن‌ها', 'danger');
    return null;
  }
}

/**
 * راه‌اندازی FCM در پس‌زمینه هنگام ورود کاربر
 */
export async function initFCM() {
  try {
    const permission = getPermissionStatus();
    
    if (permission === 'unsupported') return;
    
    if (permission === 'granted') {
      const messaging = await getMessagingInstance();
      if (!messaging) return;

      // ۱۰ ثانیه فرصت برای دریافت توکن
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
        await saveTokenToDB(token); // ⭐ خطاها لاگ می‌شوند
        await setupMessageListener(messaging);
        console.log('[FCM] ✅ توکن در پس‌زمینه به‌روزرسانی شد.');
      }
    }
  } catch (error) {
    console.error('[FCM] خطا در راه‌اندازی خودکار:', error);
  }
}

/**
 * ذخیره توکن در دیتابیس (با چک کردن دقیق خطاهای Supabase)
 */
async function saveTokenToDB(token) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    // ۱. پاک کردن توکن از کاربر قبلی (امنیت)
    const { error: delError } = await sb.from('user_tokens')
      .delete()
      .eq('token', token)
      .neq('user_id', user.id);
      
    if (delError) {
      console.error('[FCM] خطا در حذف توکن‌های قبلی:', delError.message);
    }

    // ۲. چک کردن وجود توکن
    const { data: existing, error: selError } = await sb.from('user_tokens')
      .select('id')
      .eq('user_id', user.id)
      .eq('token', token)
      .maybeSingle();

    if (selError) {
      console.error('[FCM] خطا در جستجوی توکن:', selError.message);
      return;
    }

    // ۳. درج یا آپدیت
    if (existing) {
      const { error: updError } = await sb.from('user_tokens').update({
        updated_at: new Date().toISOString()
      }).eq('id', existing.id);
      
      if (updError) {
        console.error('[FCM] ❌ خطای RLS یا دیتابیس در آپدیت توکن:', updError);
      } else {
        console.log('[FCM] ✅ زمان توکن آپدیت شد.');
      }
    } else {
      const { error: insError } = await sb.from('user_tokens').insert({
        user_id: user.id,
        token: token,
        updated_at: new Date().toISOString(),
        platform: 'web'
      });
      
      if (insError) {
        // ⭐ اینجا خطای RLS را صریحاً لاگ می‌کنیم
        console.error('[FCM] ❌ خطای RLS یا دیتابیس در درج توکن:', insError);
        toast('خطا در ذخیره توکن در سرور (دسترسی دیتابیس)', 'danger');
      } else {
        console.log('[FCM] ✅ توکن جدید برای دستگاه ذخیره شد.');
      }
    }
  } catch (err) {
    console.error('[FCM] خطای غیرمنتظره در ذخیره توکن:', err);
  }
}

/**
 * حذف توکن (هنگام خروج از حساب)
 */
export async function removeFCMToken() {
  try {
    if (!currentToken) {
        const messaging = await getMessagingInstance();
        if (messaging) {
            currentToken = await messaging.getToken({ vapidKey: VAPID_KEY }).catch(() => null);
        }
    }
    
    if (!currentToken) return;

    const messaging = await getMessagingInstance();
    if (messaging) {
      await messaging.deleteToken();
    }

    const { data: { user } } = await sb.auth.getUser();
    if (user && currentToken) {
      const { error } = await sb.from('user_tokens').delete().eq('user_id', user.id).eq('token', currentToken);
      if (error) console.error('[FCM] خطا در حذف توکن از دیتابیس:', error);
      else console.log('[FCM] توکن از دیتابیس حذف شد.');
    }

    currentToken = null;
  } catch (err) {
    console.error('[FCM] خطا در حذف توکن:', err);
  }
      }
