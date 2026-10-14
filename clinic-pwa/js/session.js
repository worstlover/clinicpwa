// js/session.js
// ═══════════════════════════════════════════════════════
// مدیریت Session کاربران (طراحی‌شده برای TWA)
// ═══════════════════════════════════════════════════════
import { sb } from './sb.js';

const HEARTBEAT_MS = 60 * 1000;              // هر دقیقه
const SESSION_TIMEOUT_HOURS = 12;            // اگه ۱۲ ساعت heartbeat نیاد، session مرده
const SESSION_KEY = 'clinic_active_session_id';
let heartbeatTimer = null;

// ═══════════════════════════════════════════════════════
// شروع Session
// ═══════════════════════════════════════════════════════
export async function startSession() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      console.warn('[Session] No user logged in');
      return;
    }

    // 🌟 بستن session های قبلی این کاربر (که ۱۲ ساعت heartbeat نداشتن)
    const cutoff = new Date(Date.now() - SESSION_TIMEOUT_HOURS * 60 * 60 * 1000).toISOString();
    await sb.from('user_sessions')
      .update({ logout_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('logout_at', null)
      .lt('last_seen', cutoff);

    // 🌟 چک کن session فعال فعلی داریم یا نه (بعد از reload)
    const existingId = localStorage.getItem(SESSION_KEY);
    if (existingId) {
      // چک کن هنوز توی DB معتبره
      const { data: existing } = await sb.from('user_sessions')
        .select('id, user_id, logout_at')
        .eq('id', parseInt(existingId, 10))
        .maybeSingle();

      if (existing && existing.user_id === user.id && !existing.logout_at) {
        // ✅ Session معتبره، فقط last_seen رو آپدیت کن
        await sb.from('user_sessions')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', existing.id);

        startHeartbeat();
        console.log('[Session] ✅ Resumed existing session:', existing.id);
        return;
      }
      // اگه معتبر نبود، پاک کن
      localStorage.removeItem(SESSION_KEY);
    }

    // 🌟 ساخت session جدید
    const fullName = user.user_metadata?.full_name || user.email || 'کاربر';

    const { data, error } = await sb.from('user_sessions')
      .insert({
        user_id:    user.id,
        user_name:  fullName,
        user_agent: (navigator.userAgent || '').substring(0, 200),
      })
      .select()
      .single();

    if (error) {
      console.error('[Session] Insert failed:', error);
      return;
    }

    localStorage.setItem(SESSION_KEY, String(data.id));
    startHeartbeat();
    console.log('[Session] ✅ Started new session:', data.id, '→', fullName);
  } catch (e) {
    console.error('[Session] start error:', e);
  }
}

// ═══════════════════════════════════════════════════════
// Heartbeat - هر دقیقه last_seen رو آپدیت می‌کنه
// ═══════════════════════════════════════════════════════
function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  heartbeatTimer = setInterval(async () => {
    const sessionId = localStorage.getItem(SESSION_KEY);
    if (!sessionId) return;

    try {
      await sb.from('user_sessions')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', parseInt(sessionId, 10));
    } catch (e) {
      console.warn('[Session] heartbeat failed:', e);
    }
  }, HEARTBEAT_MS);
}

// ═══════════════════════════════════════════════════════
// پایان Session - فقط از logout دکمه صدا زده می‌شه
// ═══════════════════════════════════════════════════════
export async function endSession() {
  const sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) return;

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  try {
    await sb.from('user_sessions')
      .update({ logout_at: new Date().toISOString() })
      .eq('id', parseInt(sessionId, 10));
    console.log('[Session] 🛑 Ended session:', sessionId);
  } catch (e) {
    console.error('[Session] end error:', e);
  }
  localStorage.removeItem(SESSION_KEY);
}

// ═══════════════════════════════════════════════════════
// 🌟 Lifecycle - فقط visibility (بدون beforeunload)
// ═══════════════════════════════════════════════════════
export function initSessionLifecycle() {
  // 🌟 حذف کامل beforeunload (مشکل‌ساز در TWA)

  document.addEventListener('visibilitychange', () => {
    const sessionId = localStorage.getItem(SESSION_KEY);
    if (!sessionId) return;

    if (document.visibilityState === 'visible') {
      // اپ برگشت → heartbeat آنی
      sb.from('user_sessions')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', parseInt(sessionId, 10))
        .then(() => console.log('[Session] heartbeat on resume'));
    }
    // وقتی hidden می‌شه هیچ کاری نمی‌کنیم - اجازه بدیم session بمونه
  });

  // 🌟 پاک‌سازی session های مرده (هر ۳۰ دقیقه)
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - SESSION_TIMEOUT_HOURS * 60 * 60 * 1000).toISOString();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

      await sb.from('user_sessions')
        .update({ logout_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('logout_at', null)
        .lt('last_seen', cutoff);

      console.log('[Session] Cleaned up stale sessions');
    } catch (e) {
      console.warn('[Session] Cleanup failed:', e);
    }
  }, 30 * 60 * 1000);
}
