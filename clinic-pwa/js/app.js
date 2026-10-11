import { $ } from './utils.js';
import { showScreen } from './ui.js';
import { doLogin, doLogout, checkAuth } from './auth.js';
import { initScannerButtons, closeScanner } from './scanner.js';
import { initQtyModal, initSearchModal } from './modals.js';
import { openInventory } from './modules/inventory.js';
import { openDispense } from './modules/dispense.js';
import { openReceive } from './modules/receive.js';
import { openReport } from './modules/report.js';

// init modals
initQtyModal();
initSearchModal();
initScannerButtons();

// login
$('btnLogin').onclick = doLogin;
$('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

// nav
$('btnBack').onclick = () => showScreen('Home');
$('btnLogout').onclick = doLogout;
document.querySelectorAll('[data-nav]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    const n = el.dataset.nav;
    if (n === 'home') showScreen('Home');
    else if (n === 'inventory') openInventory();
    else if (n === 'dispense') openDispense();
    else if (n === 'receive') openReceive();
    else if (n === 'report') openReport();
  });
});

// escape closes scanner
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('scannerWrap').classList.contains('active')) closeScanner();
});

// auth + boot
(async () => {
  await checkAuth();
})();

// SW
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(console.error);
}