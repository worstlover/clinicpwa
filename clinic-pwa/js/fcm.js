// js/fcm.js

import { 
  VAPID_KEY, 
  getMessagingInstance 
} from './firebase.js';
import { sb } from './sb.js';
import { toast } from './utils.js';

// ═══════════════════════════════════════════════════════
// توجه: کتابخانه Firebase از طریق CDN در index.html لود می‌شود.
// بنابراین نیازی به ایمپورت { firebase } از './firebase.js' نیست.
// ═══════════════════════════════════════════════════════

let currentToken = null;

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

    const { data: tokens, error } = await sb.from('user_tokens')
      .select('token, updated_at')
      .eq('user_id', user.id);

    if (error || !tokens || tokens.length === 0) {
      return { saved: false, count: 0, lastSeen: null };
    }

    const count = tokens.length;
    const lastSeen = tokens.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0]?.updated_at;
    
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
 * این تابع به طور خودکار بررسی می‌کند آیا کاربر قبلاً اجازه داده است یا خیر.
 */
export async function initFCM() {
  try {
    // بررسی دسترسی فعلی
    const permission = getPermissionStatus();
    
    if (permission === 'unsupported') {
      console.warn('[FCM] مرورگر از نوتیفیکیشن پشتیبانی نمی‌کند.');
      return;
    }
    
    // اگر کاربر قبلاً اجازه داده، توکن را دریافت و ذخیره کن
    if (permission === 'granted') {
      const messaging = await getMessagingInstance();
      if (!messaging) return;

      const token = await messaging.getToken({ vapidKey: VAPID_KEY });
      if (token) {
        currentToken = token;
        await saveTokenToDB(token);
        console.log('[FCM] ✅ توکن در پس‌زمینه به‌روزرسانی شد.');

        // گوش دادن به پیام‌ها
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
      }
    } else {
      console.log('[FCM] کاربر هنوز اجازه نداده است.');
    }
  } catch (error) {
    console.error('[FCM] خطا در راه‌اندازی خودکار:', error);
  }
}

/**
 * ذخیره توکن در دیتابیس
 */
async function saveTokenToDB(token) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      console.warn('[FCM] کاربر لاگین نکرده است.');
      return;
    }

    const { error } = await sb.from('user_tokens').upsert({
      user_id: user.id,
      token: token,
      updated_at: new Date().toISOString(),
      platform: 'web'
    }, { onConflict: 'user_id' });

    if (error) {
      console.error('[FCM] خطا در ذخیره توکن:', error);
    } else {
      console.log('[FCM] ✅ توکن با موفقیت ذخیره شد.');
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
      console.log('[FCM] توکن حذف شد.');
    }

    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      await sb.from('user_tokens').delete().eq('user_id', user.id);
    }

    currentToken = null;
  } catch (err) {
    console.error('[FCM] خطا در حذف توکن:', err);
  }
                       }
