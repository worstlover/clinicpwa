// js/auth.js
import { sb } from './sb.js';
import { $, toast, escapeHtml } from './utils.js';
import { showScreen } from './ui.js';
import { startSession, endSession } from './session.js';
import { initIncidentAlertListener } from './incident-alert.js';
import { initReferralAlertListener } from './referral-alert.js';
import { initAlertCenter } from './alert-center.js';
import { initQuickIncidentButton } from './quick-incident.js';
import { initFCM } from './fcm.js';                        // 🌟 جدید
import { openSettings } from './modules/settings.js';      // 🌟 جدید

export let currentUser = null;
export let isAdmin = false;

async function initAllListeners() {
  try { await startSession(); } catch (e) { console.error('[AUTH] session:', e); }
  try { await initIncidentAlertListener(); } catch (e) { console.error('[AUTH] incident:', e); }
  try { await initReferralAlertListener(); } catch (e) { console.error('[AUTH] referral:', e); }
  try { await initAlertCenter(); } catch (e) { console.error('[AUTH] alertCenter:', e); }
  try { initQuickIncidentButton(); } catch (e) { console.error('[AUTH] quickIncident:', e); }
  try { await initFCM(); } catch (e) { console.error('[AUTH] fcm:', e); }   // 🌟
}

export async function doLogin() {
  console.log('[AUTH] doLogin called');
  let email = $('loginEmail').value.trim();
  const pass = $('loginPass').value;

  if (!email || !pass) { toast('نام کاربری و رمز را وارد کنید', 'warning'); return; }
  if (!email.includes('@')) email = email + '@clinic.local';

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
  bindSettingsButton();     // 🌟
  showScreen('Home');
}

export async function checkAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    $('userEmail').textContent = currentUser.email;
    await loadAdminStatus();
    await initAllListeners();
    bindSettingsButton();   // 🌟
    showScreen('Home');
  } else {
    showScreen('Login');
  }
}

// 🌟 بایند کردن دکمه تنظیمات
function bindSettingsButton() {
  const btn = $('btnSettings');
  if (btn) {
    btn.onclick = () => {
      showScreen('Profile');
      setTimeout(() => openSettings(), 100);
    };
  }
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
