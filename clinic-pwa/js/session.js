// js/session.js
// ═══════════════════════════════════════════════════════
// مدیریت Session کاربران (ورود/خروج/Heartbeat)
// ═══════════════════════════════════════════════════════
import { sb } from './sb.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const HEARTBEAT_MS = 60 * 1000;   // هر ۶۰ ثانیه
const SESSION_KEY  = 'clinic_active_session_id';
let   heartbeatTimer = null;

// ═══════════════════════════════════════════════════════
// شروع Session - بعد از لاگین موفق صدا زده می‌شه
// ═══════════════════════════════════════════════════════
export async function startSession() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      console.warn('[Session] No user logged in');
      return;
    }

    // بستن session های قبلی این کاربر که logout نشدن
    await sb.from('user_sessions')
      .update({ logout_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('logout_at', null);

    const fullName = user.user_metadata?.full_name
                  || user.email
                  || 'کاربر';

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
    console.log('[Session] ✅ Started session:', data.id, '→', fullName);
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
// پایان Session - در زمان logout صدا زده می‌شه
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
// راه‌اندازی listener ها - یک بار در main.js صدا بزن
// ═══════════════════════════════════════════════════════
export function initSessionLifecycle() {
  // هنگام بستن/رفرش تب → logout_at رو ست کن
  window.addEventListener('beforeunload', () => {
    const sessionId = localStorage.getItem(SESSION_KEY);
    if (!sessionId) return;

    try {
      const url = `${SUPABASE_URL}/rest/v1/user_sessions?id=eq.${sessionId}`;
      fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ logout_at: new Date().toISOString() }),
        keepalive: true,
      }).catch(() => {});
    } catch (e) { /* silent */ }
  });

  // وقتی تب دوباره visible شد، heartbeat آنی
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const sessionId = localStorage.getItem(SESSION_KEY);
      if (sessionId) {
        sb.from('user_sessions')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', parseInt(sessionId, 10))
          .then(() => {});
      }
    }
  });
}
