// js/sb.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // ⭐ ذخیره‌سازی امن توکن‌ها در localStorage
    storage: window.localStorage,
    storageKey: 'clinic-auth-token',
    
    // ⭐ تغییر خودکار توکن هر بار
    autoRefreshToken: true,
    
    // ⭐ ماندگاری session حتی بعد از بستن تب
    persistSession: true,
    
    // ⭐ تشخیص خودکار session از URL (برای magic link/oauth)
    detectSessionInUrl: true,
    
    // ⭐ مدت زمان refresh (پیش‌فرض ۳۰ ثانیه قبل از انقضا)
    flowType: 'pkce'
  },
  
  // ⭐ تنظیمات global برای درخواست‌ها
  global: {
    headers: {
      'x-application-name': 'clinic-pwa'
    }
  },
  
  // ⭐ مدیریت خطا و retry
  db: {
    schema: 'public'
  }
});

// ═══════════════════════════════════════════════════════
// ⭐ نظارت بر وضعیت احراز هویت و refresh خودکار
// ═══════════════════════════════════════════════════════

// هر ۵۰ دقیقه یک بار توکن را دستی refresh کن
let refreshTimer = null;

function startTokenRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  
  refreshTimer = setInterval(async () => {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session) {
        // refresh توکن
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
  }, 50 * 60 * 1000); // هر ۵۰ دقیقه
}

startTokenRefreshTimer();

// ⭐ گوش دادن به رویدادهای auth
sb.auth.onAuthStateChange((event, session) => {
  console.log('🔐 Auth event:', event);
  
  if (event === 'SIGNED_OUT') {
    // اگر کاربر از سیستم خارج شد، ریدایرکت به لاگین
    if (window.location.hash !== '#login') {
      // پاک کردن state
      try { localStorage.removeItem('clinic-auth-token'); } catch (e) {}
    }
  }
  
  if (event === 'TOKEN_REFRESHED') {
    console.log('✅ توکن با موفقیت refresh شد');
  }
  
  if (event === 'SIGNED_IN') {
    console.log('✅ کاربر وارد شد:', session?.user?.email);
  }
});

// ⭐ مدیریت خطای JWT در همه درخواست‌ها
// اگر JWT منقضی شد، کاربر را به لاگین بفرست
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  
  // ⭐ چک 401 (Unauthorized) روی درخواست‌های Supabase
  if (response.status === 401) {
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const body = await response.clone().text();
      
      // اگر خطای JWT بود
      if (body.includes('JWT') || body.includes('jwt') || body.includes('expired')) {
        console.warn('⚠️ JWT منقضی شد - تلاش برای refresh');
        
        // تلاش برای refresh
        const { data, error } = await sb.auth.refreshSession();
        if (error || !data?.session) {
          console.error('❌ refresh ناموفق - کاربر باید دوباره لاگین کند');
          
          // پاک کردن session و ریدایرکت به لاگین
          await sb.auth.signOut();
          if (!window.location.hash.includes('login')) {
            alert('نشست شما منقضی شده است. لطفاً دوباره وارد شوید.');
            window.location.reload();
          }
        }
      }
    } catch (e) {
      console.warn('خطا در بررسی 401:', e);
    }
  }
  
  return response;
};

export default sb;
