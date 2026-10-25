// js/auth.js
import { sb } from './sb.js';
import { $, toast, escapeHtml } from './utils.js';
import { showScreen } from './ui.js';
import { startSession, endSession } from './session.js';
import { initIncidentAlertListener } from './incident-alert.js';
import { initReferralAlertListener } from './referral-alert.js';
import { initAlertCenter } from './alert-center.js';
import { initQuickIncidentButton } from './quick-incident.js';
import { initFCM, removeFCMToken } from './fcm.js';
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
    
    showScreen('Home');
    bindSettingsButton();

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
// لاگین با لودینگ دکمه
// ═══════════════════════════════════════════════════════
export async function doLogin() {
  console.log('[AUTH] doLogin called');
  let email = $('loginEmail').value.trim();
  const pass = $('loginPass').value;
  const btn = $('btnLogin');
  const emailInput = $('loginEmail');
  const passInput = $('loginPass');
  const msgEl = $('loginMsg');

  if (!email || !pass) {
    toast('نام کاربری و رمز را وارد کنید', 'warning');
    return;
  }

  if (!email.includes('@')) {
    email = email + '@clinic.local';
  }

  // ⭐ ذخیره وضعیت اولیه دکمه و غیرفعال کردن آن
  const originalBtnHtml = btn ? btn.innerHTML : 'ورود';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> در حال ورود...';
  }
  if (emailInput) emailInput.disabled = true;
  if (passInput) passInput.disabled = true;
  if (msgEl) msgEl.innerHTML = ''; 
  
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    
    if (error) {
      if (msgEl) msgEl.innerHTML = `<div class="alert alert-danger py-2 small">${escapeHtml(error.message)}</div>`;
      // بازگرداندن دکمه به حالت اول
      if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
      if (emailInput) emailInput.disabled = false;
      if (passInput) passInput.disabled = false;
      return;
    }
    
    if (msgEl) msgEl.innerHTML = '';
    currentUser = data.user;
    $('userEmail').textContent = currentUser.email;
    
    showScreen('Home');
    bindSettingsButton();
    
    loadAdminStatus().catch(e => console.error(e));
    initAllListeners().catch(e => console.error(e));
    
  } catch (err) {
    if (msgEl) msgEl.innerHTML = `<div class="alert alert-danger py-2 small">خطای ارتباط: ${escapeHtml(err.message)}</div>`;
    // بازگرداندن دکمه به حالت اول در صورت خطای شبکه
    if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
    if (emailInput) emailInput.disabled = false;
    if (passInput) passInput.disabled = false;
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

// ═══════════════════════════════════════════════════════
// خروج از حساب با لودینگ تمام صفحه (مدرن)
// ═══════════════════════════════════════════════════════
export async function doLogout() {
  if (!confirm('از حساب خارج می‌شوید؟')) return;

  // ⭐ ساخت لایه گرافیکی مدرن برای لودینگ خروج
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999999;
    background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: white; font-family: inherit; animation: fadeIn 0.3s ease;
  `;
  overlay.innerHTML = `
    <style>@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }</style>
    <div class="spinner-border text-light mb-4" style="width: 3.5rem; height: 3.5rem; border-width: 0.25em;" role="status"></div>
    <h4 class="fw-bold mb-2">در حال خروج...</h4>
    <p class="text-light opacity-75" style="font-size: 0.9rem;">در حال پاک‌سازی اطلاعات نشست</p>
  `;
  document.body.appendChild(overlay);
  
  try { 
    await removeFCMToken(); 
  } catch (e) { 
    console.error('[AUTH] Error removing token:', e); 
  }

  try { await endSession(); } catch (e) {}
  
  try {
    await sb.auth.signOut();
  } catch(e) {
    console.error(e);
  }
  
  location.reload();
}

export function updateCurrentUser(user) { currentUser = user; }