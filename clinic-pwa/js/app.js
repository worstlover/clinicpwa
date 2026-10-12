import { $ } from './utils.js';
import { showScreen } from './ui.js';
import { doLogin, doLogout, checkAuth } from './auth.js';
import { initScannerButtons, closeScanner } from './scanner.js';
import { initQtyModal, initSearchModal } from './modals.js';
import { openInventory } from './modules/inventory.js';
import { openDispense } from './modules/dispense.js';
import { openReceive } from './modules/receive.js';
import { openDisposal } from './modules/disposal.js';
import { openReport } from './modules/report.js';
import { openProfile } from './modules/profile.js';

initQtyModal();
initSearchModal();
initScannerButtons();

$('btnLogin').onclick = doLogin;
$('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

$('btnBack').onclick = () => showScreen('Home');
$('btnLogout').onclick = doLogout;

// ⭐ دکمه پروفایل در هدر
const btnProfile = $('btnProfile');
if (btnProfile) {
  btnProfile.onclick = () => openProfile();
}

// ⭐ کلیک روی ایمیل کاربر در داشبورد
const userEmailEl = $('userEmail');
if (userEmailEl) {
  userEmailEl.style.cursor = 'pointer';
  userEmailEl.onclick = () => openProfile();
}

// ⭐ ناوبری از کارت‌ها و نوار پایین
document.querySelectorAll('[data-nav]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    const n = el.dataset.nav;
    if (n === 'home') showScreen('Home');
    else if (n === 'inventory') openInventory();
    else if (n === 'dispense') openDispense();
    else if (n === 'receive') openReceive();
    else if (n === 'disposal') openDisposal();
    else if (n === 'report') openReport();
    else if (n === 'profile') openProfile();
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('scannerWrap').classList.contains('active')) closeScanner();
});

// ⭐ نصب PWA
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('btnInstallPWA');
  if (btn) btn.style.display = 'flex';
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const btn = document.getElementById('btnInstallPWA');
  if (btn) btn.style.display = 'none';
  alert('✅ اپ با موفقیت نصب شد!');
});

window._triggerInstall = async () => {
  if (!deferredInstallPrompt) {
    alert('مرورگر شما از نصب خودکار پشتیبانی نمی‌کند.\n\nلطفاً از منوی مرورگر:\n• Android Chrome: منو ⋮ → Install app\n• iOS Safari: Share → Add to Home Screen');
    return;
  }
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') {
    console.log('User accepted PWA install');
  }
  deferredInstallPrompt = null;
};

// ⭐ راه‌اندازی
(async () => { await checkAuth(); })();

// ⭐ Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(console.error);
}
