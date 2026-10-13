// js/auth.js
import { sb } from './sb.js';
import { $, toast, escapeHtml } from './utils.js';
import { showScreen } from './ui.js';
import { startSession, endSession } from './session.js';
import { initIncidentAlertListener } from './incident-alert.js';
import { initReferralAlertListener } from './referral-alert.js';   // 🌟 جدید

export let currentUser = null;
export let isAdmin = false;

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

  // 🌟 شروع Session
  try {
    await startSession();
    console.log('[AUTH] startSession OK');
  } catch (e) {
    console.error('[AUTH] startSession FAILED:', e);
  }

  // 🌟 راه‌اندازی listener هشدار حادثه
  try {
    await initIncidentAlertListener();
    console.log('[AUTH] incident listener OK');
  } catch (e) {
    console.error('[AUTH] incident listener FAILED:', e);
  }

  // 🌟 راه‌اندازی listener هشدار ارجاع
  try {
    await initReferralAlertListener();
    console.log('[AUTH] referral listener OK');
  } catch (e) {
    console.error('[AUTH] referral listener FAILED:', e);
  }

  showScreen('Home');
}

export async function loadAdminStatus() {
  if (!currentUser?.email) { isAdmin = false; return; }
  const { data } = await sb.from('pwa_admins').select('email').eq('email', currentUser.email).maybeSingle();
  isAdmin = !!data;
}

export async function checkAuth() {
  console.log('[AUTH] checkAuth called');
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    $('userEmail').textContent = currentUser.email;
    await loadAdminStatus();

    // 🌟 شروع Session
    try {
      await startSession();
      console.log('[AUTH] startSession OK (checkAuth)');
    } catch (e) {
      console.error('[AUTH] startSession FAILED (checkAuth):', e);
    }

    // 🌟 راه‌اندازی listener هشدار حادثه
    try {
      await initIncidentAlertListener();
      console.log('[AUTH] incident listener OK (checkAuth)');
    } catch (e) {
      console.error('[AUTH] incident listener FAILED (checkAuth):', e);
    }

    // 🌟 راه‌اندازی listener هشدار ارجاع
    try {
      await initReferralAlertListener();
      console.log('[AUTH] referral listener OK (checkAuth)');
    } catch (e) {
      console.error('[AUTH] referral listener FAILED (checkAuth):', e);
    }

    showScreen('Home');
  } else {
    showScreen('Login');
  }
}

export async function doLogout() {
  if (!confirm('از حساب خارج می‌شوید؟')) return;

  console.log('[AUTH] doLogout - ending session');
  try {
    await endSession();
  } catch (e) {
    console.error('[AUTH] endSession FAILED:', e);
  }

  await sb.auth.signOut();
  location.reload();
}

export function updateCurrentUser(user) {
  currentUser = user;
}
