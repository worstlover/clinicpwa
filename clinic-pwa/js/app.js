// js/app.js
import { $ } from './utils.js';
import { showScreen } from './ui.js';
import { doLogin, doLogout, checkAuth } from './auth.js';
import { initScannerButtons, closeScanner } from './scanner.js';
import { initQtyModal, initSearchModal } from './modals.js';
import { openInventory } from './modules/inventory.js';
import { openInventoryList } from './modules/inventory-list.js'; // ⬅️ اضافه شد
import { openReceive } from './modules/receive.js';
import { openDisposal } from './modules/disposal.js';
import { openReport } from './modules/report.js';
import { openProfile } from './modules/profile.js';
import { openOccupational } from './modules/occupational.js';
import { openVisits } from './modules/visit/index.js';
import { openForms } from './forms/engine.js';
import { openGuide } from './process/guide.js';
import { initFCM } from './fcm.js';

// ماژول‌هایی که در کد اصلی شما بودند و باید برگردند:
import { openFormsMenu } from './modules/forms-menu.js';
import { openFormsArchive } from './modules/forms-archive.js';
import { openVisitReports } from './modules/visit-reports.js';
import { openFineReward } from './modules/fine-reward.js';

initQtyModal();
initSearchModal();
initScannerButtons();

// لاگین
$('btnLogin').onclick = doLogin;
$('loginPass').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    doLogin();
  }
});

// هدر
$('btnBack').onclick = () => showScreen('Home');
$('btnLogout').onclick = doLogout;

const btnProfile = $('btnProfile');
if (btnProfile) btnProfile.onclick = () => openProfile();

const userEmailEl = $('userEmail');
if (userEmailEl) {
  userEmailEl.style.cursor = 'pointer';
  userEmailEl.onclick = () => openProfile();
}

// ═══════════════════════════════════════════════════════
// ناوبری (برگردانده شد به حالت اصلی + تغییر انبارگردانی)
// ═══════════════════════════════════════════════════════
document.querySelectorAll('[data-nav]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    const n = el.dataset.nav;
    try {
      if (n === 'home') showScreen('Home');
      else if (n === 'pharmacy') showScreen('Pharmacy');
      else if (n === 'visits') openVisits();
      else if (n === 'inventory') openInventoryList(); // ⬅️ تغییر اصلی: رفتن به لیست
      else if (n === 'receive') openReceive();
      else if (n === 'disposal') openDisposal();
      else if (n === 'report') openReport();
      else if (n === 'profile') openProfile();
      else if (n === 'occupational') openOccupational();
      else if (n === 'forms') openForms();
      else if (n === 'formsMenu') openFormsMenu();
      else if (n === 'formsArchive') openFormsArchive();
      else if (n === 'guide') openGuide();
      else if (n === 'visitReports') openVisitReports();
      else if (n === 'fineReward') openFineReward();
      else console.warn('[NAV] unknown target:', n);
    } catch (err) {
      console.error('[NAV] error for', n, ':', err);
    }
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('scannerWrap')?.classList.contains('active')) {
    closeScanner();
  }
});

// نصب PWA
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
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
};

// راه‌اندازی اولیه
(async () => {
  await checkAuth();
  await initFCM();
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(console.error);
}
