// js/auth.js
import { sb } from './sb.js';
import { showScreen } from './ui.js';
import { $, toast } from './utils.js';

// ⬅️ این متغیرها باید Export شوند تا بقیه فایل‌ها بتوانند از آن‌ها استفاده کنند
export let currentUser = null;
export let isAdmin = false;

// ═══════════════════════════════════════════════════════
// بررسی وضعیت لاگین
// ═══════════════════════════════════════════════════════
export const checkAuth = async () => {
  try {
    const { data: { session }, error } = await sb.auth.getSession();
    if (error) throw error;

    if (session) {
      currentUser = session.user;
      
      // تعیین سطح دسترسی (Admin)
      // اگر ایمیل شامل admin باشد یا در گروه خاصی باشد
      isAdmin = currentUser?.email?.includes('admin') || currentUser?.user_metadata?.role === 'Supervisor';
      
      // نمایش ایمیل در هدر و سایدبار
      const emailEl = $('userEmail');
      if (emailEl) emailEl.textContent = currentUser.email;
      
      const sideUserEmail = $('sideUserEmail');
      if (sideUserEmail) sideUserEmail.textContent = currentUser.email;

      showScreen('Home');
    } else {
      showScreen('Login');
    }
  } catch (err) {
    console.error('[AUTH] error:', err);
    showScreen('Login');
  }
};

// ═══════════════════════════════════════════════════════
// ورود به سیستم
// ═══════════════════════════════════════════════════════
export const doLogin = async () => {
  const email = $('loginEmail').value.trim();
  const password = $('loginPass').value.trim();
  
  if (!email || !password) {
    toast('لطفا نام کاربری و رمز عبور را وارد کنید', 'warning');
    return;
  }

  const btn = $('btnLogin');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ورود...';
  }

  try {
    // ورود با استاندارد Supabase (اگر از سیستم اختصاصی استفاده می‌کنید، این قسمت را تغییر دهید)
    const { data, error } = await sb.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) throw error;
    
    currentUser = data.user;
    isAdmin = currentUser?.email?.includes('admin') || currentUser?.user_metadata?.role === 'Supervisor';
    
    toast('✅ خوش آمدید', 'success');
    
    // رفرش صفحه برای بارگذاری آمار و تنظیم دکمه شناور
    window.location.reload();

  } catch (err) {
    toast(err.message || 'نام کاربری یا رمز عبور اشتباه است', 'danger');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'ورود';
    }
  }
};

// ═══════════════════════════════════════════════════════
// خروج از سیستم
// ═══════════════════════════════════════════════════════
export const doLogout = async () => {
  try {
    await sb.auth.signOut();
    currentUser = null;
    isAdmin = false;
    
    // مخفی کردن المان‌های UI به صورت دستی قبل از رفرش
    document.getElementById('appHeader')?.classList.add('hidden');
    document.getElementById('bottomNav')?.classList.add('hidden');
    document.getElementById('sideNav')?.classList.add('hidden');
    
    showScreen('Login');
    
    // رفرش کامل برای پاکسازی حافظه
    window.location.reload(); 
  } catch (err) {
    console.error('[AUTH] Logout error:', err);
    toast('خطا در خروج از حساب', 'danger');
  }
};
