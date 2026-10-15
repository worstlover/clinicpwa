// js/fcm.js
import { supabase } from './supabase.js'; // مسیر supabase client خودت
import { getMessagingInstance, VAPID_KEY } from './firebase.js';
import { getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js';

// ═══════════════════════════════════════════════════════
// دریافت و ذخیره توکن FCM (فقط یکی برای هر کاربر)
// ═══════════════════════════════════════════════════════
export async function registerFCMToken() {
  try {
    // ۱) دریافت session کاربر
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      console.warn('[FCM] کاربر لاگین نیست');
      return null;
    }
    const userId = session.user.id;

    // ۲) دریافت messaging instance
    const messaging = await getMessagingInstance();
    if (!messaging) {
      console.warn('[FCM] messaging پشتیبانی نمی‌شود');
      return null;
    }

    // ۳) درخواست مجوز نوتیفیکیشن
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[FCM] مجوز نوتیفیکیشن داده نشد');
      return null;
    }

    // ۴) دریافت توکن جدید
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (!token) {
      console.warn('[FCM] توکن دریافت نشد');
      return null;
    }

    console.log('[FCM] ✅ توکن جدید:', token);

    // ۵) حذف توکن‌های قدیمی این کاربر و ذخیره توکن جدید
    //    چون user_id کلید اصلی است، UPSERT توکن قبلی را جایگزین می‌کند
    const { error } = await supabase
      .from('user_fcm_tokens')
      .upsert(
        {
          user_id: userId,
          token: token,
          device_info: navigator.userAgent,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('[FCM] خطا در ذخیره توکن:', error);
      return null;
    }

    console.log('[FCM] ✅ توکن در دیتابیس ذخیره شد');
    return token;

  } catch (err) {
    console.error('[FCM] خطا در registerFCMToken:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// گوش دادن به پیام‌های Foreground
// ═══════════════════════════════════════════════════════
export async function initFCMMessaging() {
  const messaging = await getMessagingInstance();
  if (!messaging) return;

  onMessage(messaging, (payload) => {
    console.log('[FCM] 📩 Foreground:', payload);

    const data = payload.data || {};
    const type = data.type || 'incident';
    const title = data.title || (type === 'incident' ? '🚨 اعلام حادثه' : '📩 ویزیت ارجاعی');
    const body = data.body || '';

    // نمایش نوتیفیکیشن در Foreground
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body: body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-mono.png',
        tag: `${type}_${data.id || Date.now()}`,
        data: data
      });
    }

    // ارسال رویداد به بقیه اپ
    window.dispatchEvent(new CustomEvent('fcm-message', { detail: payload }));
  });
}
