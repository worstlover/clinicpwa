import { sb } from './sb.js';
import { $, toast, escapeHtml } from './utils.js';
import { showScreen } from './ui.js';

export let currentUser = null;
export let isAdmin = false;

export async function doLogin() {
  let email = $('loginEmail').value.trim();
  const pass = $('loginPass').value;

  if (!email || !pass) {
    toast('نام کاربری و رمز را وارد کنید', 'warning');
    return;
  }

  // ⭐ اگر @ نداشت، پسوند @clinic.local اضافه کن
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
  showScreen('Home');
}

export async function loadAdminStatus() {
  if (!currentUser?.email) { isAdmin = false; return; }
  const { data } = await sb.from('pwa_admins').select('email').eq('email', currentUser.email).maybeSingle();
  isAdmin = !!data;
}

export async function checkAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    $('userEmail').textContent = currentUser.email;
    await loadAdminStatus();
    showScreen('Home');
  } else {
    showScreen('Login');
  }
}

export async function doLogout() {
  if (!confirm('از حساب خارج می‌شوید؟')) return;
  await sb.auth.signOut();
  location.reload();
}

// ⭐ در دسترس قرار دادن در window برای استفاده در ماژول‌های دیگر
export function updateCurrentUser(user) {
  currentUser = user;
}
