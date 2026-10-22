// js/auth.js
import { sb } from './sb.js';
import { $, toast, escapeHtml } from './utils.js';
import { showScreen } from './ui.js';
import { startSession, endSession } from './session.js';
import { initIncidentAlertListener } from './incident-alert.js';
import { initReferralAlertListener } from './referral-alert.js';
import { initAlertCenter } from './alert-center.js';
import { initQuickIncidentButton } from './quick-incident.js';
import { initFCM } from './fcm.js';
import { openSettings } from './modules/settings.js';

export let currentUser = null;
export let isAdmin = false;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// ═══════════════════════════════════════════════════════
// راه‌اندازی listener ها (بدون بلاک کردن برنامه)
// ═══════════════════════════════════════════════════════
async function initAllListeners() {
  console.log('[AUTH] Starting background listeners...');
  
  // اجرای همه به صورت موازی تا اگر یکی گیر کرد، بقیه ادامه دهند
  const tasks = [
    startSession().catch(e => console.error('[AUTH] session:', e)),
    initIncidentAlertListener().catch(e => console.error('[AUTH] incident:', e)),
    initReferralAlertListener().catch(e => console.error('[AUTH] referral:', e)),
    initAlertCenter().catch(e => console.error('[AUTH] alertCenter:', e)),
    Promise.resolve().then(() => { 
      try { initQuickIncidentButton(); } catch (e) { console.error('[AUTH] quickIncident:', e); } 
    }),
    initFCM().catch(e => console.error('[AUTH] fcm:', e))
  ];

  await Promise.allSettled(tasks);
  console.log('[AUTH] Background listeners initialized.');
}

// ═══════════════════════════════════════════════════════
// تشخیص خطای قطعی
// ═══════════════════════════════════════════════════════
function isDefinitiveAuthError(err) {
  const msg = (err?.message || String(err)).toLowerCase();
  return msg.includes('invalid_grant') ||
         msg.includes('refresh_token_not_found') ||
         msg.includes('invalid_token') ||
         msg.includes('user_not_found') ||
         msg.includes('jwt');
}

// ═══════════════════════════════════════════════════════
// checkAuth (بررسی وضعیت ورود)
// ═══════════════════════════════════════════════════════
export async function checkAuth() {
  console.log('[AUTH] checkAuth called');

  let lastError = null;
  let session = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await sb.auth.getSession();
      if (res.error) throw res.error;
      session = res.data?.session;
      lastError = null;
      break;
    } catch (e) {
      lastError = e;
      if (isDefinitiveAuthError(e)) break;
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  if (session?.user) {
    currentUser = session.user;
    $('userEmail').textContent = currentUser.email;
    
    // ⭐ ۱. نمایش فوری صفحه اصلی
    showScreen('Home');
    bindSettingsButton();

    // ⭐ ۲. اجرای لیسنرها در پس‌زمینه
    loadAdminStatus().catch(e => console.error(e));
    initAllListeners().catch(e => console.error(e));
    
    return;
  }

  if (lastError && isDefinitiveAuthError(lastError)) {
    localStorage.removeItem('clinic-auth-token');
    showScreen('Login');
    return;
  }

  const hasToken = localStorage.getItem('clinic-auth-token');
  if (lastError && hasToken) {
    setupWeakNetScreen();
    showScreen('WeakNet');
    return;
  }

  showScreen('Login');
}

// ═══════════════════════════════════════════════════════
// لاگین (با اضافه کردن خودکار پسوند)
// ═══════════════════════════════════════════════════════
export async function doLogin() {
  console.log('[AUTH] doLogin called');
  let email = $('loginEmail').value.trim();
  const pass = $('loginPass').value;

  if (!email || !pass) {
    toast('نام کاربری و رمز را وارد کنید', 'warning');
    return;
  }

  if (!email.includes('@')) {
    email = email + '@clinic.local';
  }

  const msgEl = $('loginMsg');
  if (msgEl) msgEl.innerHTML = '<div class="alert alert-info py-2 small">در حال ورود...</div>';
  
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    
    if (error) {
      if (msgEl) msgEl.innerHTML = `<div class="alert alert-danger py-2 small">${escapeHtml(error.message)}</div>`;
      return;
    }
    
    if (msgEl) msgEl.innerHTML = '';
    currentUser = data.user;
    $('userEmail').textContent = currentUser.email;
    
    // ⭐ ۱. نمایش فوری صفحه اصلی بدون منتظر ماندن برای سرورهای دیگر
    showScreen('Home');
    bindSettingsButton();
    
    // ⭐ ۲. کارهای پس‌زمینه (بدون await)
    loadAdminStatus().catch(e => console.error(e));
    initAllListeners().catch(e => console.error(e));
    
  } catch (err) {
    if (msgEl) msgEl.innerHTML = `<div class="alert alert-danger py-2 small">خطای ارتباط: ${escapeHtml(err.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════
// اتصال دکمه تنظیمات
// ═══════════════════════════════════════════════════════
function bindSettingsButton() {
  const btn = $('btnSettings');
  if (btn) {
    btn.onclick = () => {
      showScreen('Profile');
      setTimeout(() => openSettings(), 100);
    };
  }
}

// ═══════════════════════════════════════════════════════
// صفحه اتصال ضعیف
// ═══════════════════════════════════════════════════════
function setupWeakNetScreen() {
  const retryBtn = $('btnWeakNetRetry');
  const logoutBtn = $('btnWeakNetLogout');
  
  if (retryBtn) retryBtn.onclick = () => { showScreen('Loading'); setTimeout(() => checkAuth(), 100); };
  if (logoutBtn) logoutBtn.onclick = async () => {
    if (!confirm('از حساب خارج می‌شوید؟')) return;
    localStorage.removeItem('clinic-auth-token');
    await sb.auth.signOut();
    location.reload();
  };
}

export async function loadAdminStatus() {
  if (!currentUser?.email) { isAdmin = false; return; }
  const { data } = await sb.from('pwa_admins').select('email').eq('email', currentUser.email).maybeSingle();
  isAdmin = !!data;
}

export async function doLogout() {
  if (!confirm('از حساب خارج می‌شوید؟')) return;
  try { await endSession(); } catch (e) {}
  await sb.auth.signOut();
  location.reload();
}

export function updateCurrentUser(user) { currentUser = user; }
