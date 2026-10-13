// js/sb.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: window.localStorage,
    storageKey: 'clinic-auth-token',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  },
  global: {
    headers: { 'x-application-name': 'clinic-pwa' }
  },
  db: { schema: 'public' }
});

// ═══════════════════════════════════════════════════════
// نظارت بر وضعیت احراز هویت
// ═══════════════════════════════════════════════════════

let refreshTimer = null;

function startTokenRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  
  // 🌟 هر ۳۰ دقیقه refresh می‌کنه (مطمئن‌تر برای پایداری)
  refreshTimer = setInterval(async () => {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session) {
        const { error } = await sb.auth.refreshSession();
        if (error) {
          console.warn('⚠️ خطا در refresh توکن:', error.message);
        } else {
          console.log('✅ توکن refresh شد');
        }
      }
    } catch (e) {
      console.warn('⚠️ خطا در refresh:', e.message);
    }
  }, 30 * 60 * 1000);
}

startTokenRefreshTimer();

sb.auth.onAuthStateChange((event, session) => {
  console.log('🔐 Auth event:', event);
  
  if (event === 'SIGNED_OUT') {
    console.warn('🚪 کاربر خارج شد');
  }
  
  if (event === 'TOKEN_REFRESHED') {
    console.log('✅ توکن با موفقیت refresh شد');
  }
  
  if (event === 'SIGNED_IN') {
    console.log('✅ کاربر وارد شد:', session?.user?.email);
  }
});

// ═══════════════════════════════════════════════════════
// 🌟 مدیریت 401 - فقط refresh، logout نکن
// مثل واتساپ: تا وقتی کاربر خودش logout نکنه، session می‌مونه
// ═══════════════════════════════════════════════════════
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  
  if (response.status === 401) {
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const body = await response.clone().text();
      
      if (body.includes('JWT') || body.includes('jwt') || body.includes('expired')) {
        console.warn('⚠️ JWT منقضی شد - تلاش برای refresh');
        
        // فقط refresh کن - logout نکن!
        const { data, error } = await sb.auth.refreshSession();
        if (error || !data?.session) {
          console.warn('⚠️ refresh ناموفق - کاربر همچنان با session قبلی ادامه می‌ده');
          // 🚫 دیگه signOut نمی‌کنیم
        } else {
          console.log('✅ توکن با موفقیت refresh شد');
        }
      }
    } catch (e) {
      console.warn('خطا در بررسی 401:', e);
    }
  }
  
  return response;
};

export default sb;
