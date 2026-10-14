// js/auth.js
import { sb } from './sb.js';
import { $, toast, escapeHtml } from './utils.js';
import { showScreen } from './ui.js';
import { startSession, endSession } from './session.js';
import { initIncidentAlertListener } from './incident-alert.js';
import { initReferralAlertListener } from './referral-alert.js';
import { initAlertCenter } from './alert-center.js';
import { initQuickIncidentButton } from './quick-incident.js';
import { initFCM } from './fcm.js';                            // 🌟 جدید
import { openSettings } from './modules/settings.js';

export let currentUser = null;
export let isAdmin = false;

// ═══════════════════════════════════════════════════════
// راه‌اندازی همه listener ها (مشترک)
// ═══════════════════════════════════════════════════════
async function initAllListeners() {
  try { await startSession(); } catch (e) { console.error('[AUTH] session:', e); }
  try { await initIncidentAlertListener(); } catch (e) { console.error('[AUTH] incident:', e); }
  try { await initReferralAlertListener(); } catch (e) { console.error('[AUTH] referral:', e); }
  try { await initAlertCenter(); } catch (e) { console.error('[AUTH] alertCenter:', e); }
  try { initQuickIncidentButton(); } catch (e) { console.error('[AUTH] quickIncident:', e); }
  
  // 🌟 initFCM فقط اگه permission قبلاً داده شده باشه کار می‌کنه
  try { await initFCM(); } catch (e) { console.error('[AUTH] fcm:', e); }
}

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

  $('loginMsg').innerHTML = '<div class="alert alert-info py-2 small">در حال ورود...</div>';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) {
    $('loginMsg').innerHTML = `<div class="alert alert-danger py-2 small">${escapeHtml(error.message)}</div>`;
    return;
  }
  $('loginMsg').innerHTML = '';
  currentUser = data.user;
  $('userEmail').textContent = currentUser.email;
  await loadAdminStatus();

  await initAllListeners();
  bindSettingsButton();
  showScreen('Home');

  // 🌟 چک کردن نیاز به بنر درخواست اجازه نوتیفیکیشن
  setTimeout(() => maybeShowPermissionBanner(), 800);
}

export async function checkAuth() {
  console.log('[AUTH] checkAuth called');
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    $('userEmail').textContent = currentUser.email;
    await loadAdminStatus();
    await initAllListeners();
    bindSettingsButton();
    showScreen('Home');

    setTimeout(() => maybeShowPermissionBanner(), 800);
  } else {
    showScreen('Login');
  }
}

// ═══════════════════════════════════════════════════════
// بایند دکمه تنظیمات
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
// بنر درخواست اجازه نوتیفیکیشن (فقط اگه کاربر قبلاً نداده باشه)
// ═══════════════════════════════════════════════════════
async function maybeShowPermissionBanner() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'default') return;

  // اگه کاربر قبلاً بست، تا ۳ روز نشون نده
  const dismissed = localStorage.getItem('fcm_banner_dismissed_until');
  if (dismissed && Date.now() < parseInt(dismissed)) return;

  document.querySelectorAll('.fcm-permission-banner').forEach(el => el.remove());

  const banner = document.createElement('div');
  banner.className = 'fcm-permission-banner';
  banner.innerHTML = `
    <div class="fcm-banner-content">
      <div class="fcm-banner-icon">🔔</div>
      <div class="fcm-banner-body">
        <div class="fcm-banner-title">فعال‌سازی هشدارها</div>
        <div class="fcm-banner-text">برای دریافت اعلان حادثه و ارجاع، نوتیفیکیشن را فعال کنید.</div>
      </div>
      <div class="fcm-banner-actions">
        <button class="fcm-banner-enable" id="fcmBannerEnable">فعال کن</button>
        <button class="fcm-banner-close" id="fcmBannerClose" title="بعداً">✕</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);

  // استایل
  if (!document.getElementById('fcmBannerStyle')) {
    const style = document.createElement('style');
    style.id = 'fcmBannerStyle';
    style.textContent = `
      .fcm-permission-banner {
        position: fixed;
        top: 70px;
        left: 12px; right: 12px;
        z-index: 9998;
        background: linear-gradient(135deg, #0d6efd, #4c1d95);
        color: #fff;
        padding: 14px;
        border-radius: 14px;
        box-shadow: 0 8px 24px rgba(13, 110, 253, 0.4);
        animation: fcmBannerSlide 0.4s ease-out;
      }
      @keyframes fcmBannerSlide {
        from { transform: translateY(-20px); opacity: 0; }
        to   { transform: translateY(0); opacity: 1; }
      }
      .fcm-banner-content {
        display: flex; align-items: center; gap: 12px;
      }
      .fcm-banner-icon {
        font-size: 2rem;
        animation: fcmBellRing 2s infinite;
      }
      @keyframes fcmBellRing {
        0%, 100% { transform: rotate(0); }
        10%, 30% { transform: rotate(-15deg); }
        20%, 40% { transform: rotate(15deg); }
        50% { transform: rotate(0); }
      }
      .fcm-banner-body { flex: 1; }
      .fcm-banner-title {
        font-weight: 800; font-size: 0.95rem; margin-bottom: 2px;
      }
      .fcm-banner-text {
        font-size: 0.75rem; opacity: 0.9; line-height: 1.4;
      }
      .fcm-banner-actions {
        display: flex; align-items: center; gap: 6px; flex-shrink: 0;
      }
      .fcm-banner-enable {
        background: #fff; color: #0d6efd; border: none;
        padding: 8px 14px; border-radius: 10px;
        font-weight: 700; font-size: 0.8rem;
        cursor: pointer; font-family: inherit; white-space: nowrap;
      }
      .fcm-banner-enable:active { transform: scale(0.96); }
      .fcm-banner-close {
        background: rgba(255,255,255,0.2); color: #fff;
        border: none; width: 32px; height: 32px;
        border-radius: 50%; font-size: 1rem; font-weight: 700;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
      }
      .fcm-banner-close:active { background: rgba(255,255,255,0.35); }
    `;
    document.head.appendChild(style);
  }

  $('fcmBannerEnable').onclick = async () => {
    const { requestPermissionAndInit } = await import('./fcm.js');
    const token = await requestPermissionAndInit();
    if (token) {
      banner.remove();
      toast('✅ هشدارها فعال شد', 'success');
    }
  };

  $('fcmBannerClose').onclick = () => {
    const until = Date.now() + 3 * 24 * 60 * 60 * 1000;
    localStorage.setItem('fcm_banner_dismissed_until', String(until));
    banner.remove();
  };
}

export async function loadAdminStatus() {
  if (!currentUser?.email) { isAdmin = false; return; }
  const { data } = await sb.from('pwa_admins').select('email').eq('email', currentUser.email).maybeSingle();
  isAdmin = !!data;
}

export async function doLogout() {
  if (!confirm('از حساب خارج می‌شوید؟')) return;

  console.log('[AUTH] doLogout - ending session');
  try { await endSession(); } catch (e) { console.error('[AUTH] endSession:', e); }

  await sb.auth.signOut();
  location.reload();
}

export function updateCurrentUser(user) { currentUser = user; }
