// js/fcm.js

import { 
  VAPID_KEY, 
  getMessagingInstance 
} from './firebase.js';
import { sb } from './sb.js';
import { toast } from './utils.js';

// ═══════════════════════════════════════════════════════
// متغیرهای سراسری
// ═══════════════════════════════════════════════════════
let currentToken = null;
let isListenerAttached = false; // ⭐ جلوگیری از ثبت لیسنر تکراری

/**
 * وضعیت دسترسی به نوتیفیکیشن مرورگر
 * خروجی: 'granted' | 'denied' | 'default' | 'unsupported'
 */
export function getPermissionStatus() {
  if (!('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * وضعیت توکن FCM در دیتابیس (برای استفاده در settings.js)
 * خروجی: آبجکت شامل { saved, count, lastSeen }
 */
export async function getTokenStatus() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { saved: false, count: 0, lastSeen: null };

    // جستجوی توکن‌های کاربر در دیتابیس
    const { data: tokens, error } = await sb.from('user_tokens')
      .select('token, updated_at')
      .eq('user_id', user.id);

    if (error || !tokens || tokens.length === 0) {
      return { saved: false, count: 0, lastSeen: null };
    }

    const count = tokens.length;
    const lastSeen = tokens.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0]?.updated_at;
    
    // آیا توکن فعلیِ گوشی/مرورگر در لیست دیتابیس وجود دارد؟
    const currentSaved = currentToken 
      ? tokens.some(t => t.token === currentToken) 
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
        
        // نمایش نوتیفیکیشن سیستمی
        if (Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/icons/icon-192.png' });
        }
        
        // نمایش Toast داخل برنامه
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

    // درخواست اجازه از کاربر
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

    // دریافت توکن
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
 * راه‌اندازی FCM هنگام ورود کاربر (برای auth.js)
 * این تابع در پس‌زمینه اجرا می‌شود و اگر اینترنت کند باشد، برنامه را معطل نمی‌کند.
 */
export async function initFCM() {
  try {
    const permission = getPermissionStatus();
    
    if (permission === 'unsupported') {
      console.warn('[FCM] مرورگر از نوتیفیکیشن پشتیبانی نمی‌کند.');
      return;
    }
    
    // اگر کاربر قبلاً اجازه داده، توکن را دریافت و ذخیره کن
    if (permission === 'granted') {
      const messaging = await getMessagingInstance();
      if (!messaging) return;

      // ⭐ اضافه کردن Timeout ۱۰ ثانیه‌ای برای جلوگیری از معطل شدن
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
 * ذخیره توکن در دیتابیس (با پشتیبانی از چند دستگاه)
 */
async function saveTokenToDB(token) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      console.warn('[FCM] کاربر لاگین نکرده است.');
      return;
    }

    // بررسی می‌کنیم آیا این توکن خاص قبلاً ثبت شده یا نه
    const { data: existing } = await sb.from('user_tokens')
      .select('id')
      .eq('user_id', user.id)
      .eq('token', token)
      .maybeSingle();

    if (existing) {
      // اگر توکن وجود داشت، فقط زمان آپدیت را عوض کن
      await sb.from('user_tokens').update({
        updated_at: new Date().toISOString()
      }).eq('id', existing.id);
      console.log('[FCM] ✅ زمان توکن آپدیت شد.');
    } else {
      // اگر توکن جدید بود (مثلاً از دستگاه جدید)، درج کن
      const { error } = await sb.from('user_tokens').insert({
        user_id: user.id,
        token: token,
        updated_at: new Date().toISOString(),
        platform: 'web'
      });
      
      if (error) {
        console.error('[FCM] خطا در درج توکن:', error);
      } else {
        console.log('[FCM] ✅ توکن جدید برای دستگاه ذخیره شد.');
      }
    }
  } catch (err) {
    console.error('[FCM] خطا در ذخیره توکن:', err);
  }
}

/**
 * حذف توکن (هنگام خروج از حساب)
 */
export async function removeFCMToken() {
  try {
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
