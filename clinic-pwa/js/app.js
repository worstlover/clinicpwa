// js/app.js
import { $, faNum, toast } from './utils.js';
import { showScreen } from './ui.js';
import { doLogin, doLogout, checkAuth, currentUser, isAdmin } from './auth.js';
import { initScannerButtons, closeScanner } from './scanner.js';
import { initQtyModal, initSearchModal } from './modals.js';
import { openInventoryList } from './modules/inventory-list.js';
import { openReceive } from './modules/receive.js';
import { openDisposal } from './modules/disposal.js';
import { openReport } from './modules/report.js';
import { openProfile } from './modules/profile.js';
import { openOccupational } from './modules/occupational.js';
import { openVisits } from './modules/visit/index.js';
import { openCreate } from './modules/visit/create.js'; 
import { openPatients } from './modules/patients.js';
import { openForms } from './forms/engine.js';
import { openGuide } from './process/guide.js';
import { openFormsMenu } from './modules/forms-menu.js';
import { openFormsArchive } from './modules/forms-archive.js';
import { openVisitReports } from './modules/visit-reports.js';
import { openFineReward } from './modules/fine-reward.js';
import { initFCM } from './fcm.js';
import { sb } from './sb.js';

console.log('[APP] module loaded');

// ═══════════════════════════════════════════════════════
// انیمیشن نوار پیشرفت
// ═══════════════════════════════════════════════════════
function startLoadingProgress() {
  const bar = document.getElementById('loadingProgressBar');
  const percent = document.getElementById('loadingPercent');
  if (!bar || !percent) return;
  bar.style.width = '0%'; percent.textContent = '0%';
  if (window.__loadingInterval) clearInterval(window.__loadingInterval);
  let value = 0;
  window.__loadingInterval = setInterval(() => {
    value += Math.random() * 12 + 4;
    if (value >= 95) { value = 95; clearInterval(window.__loadingInterval); }
    bar.style.width = value + '%'; percent.textContent = Math.floor(value) + '%';
  }, 280);
}

function finishLoadingProgress() {
  const bar = document.getElementById('loadingProgressBar');
  const percent = document.getElementById('loadingPercent');
  if (window.__loadingInterval) clearInterval(window.__loadingInterval);
  if (bar && percent) {
    bar.style.width = '100%'; percent.textContent = '100%';
    setTimeout(() => {
      document.getElementById('screenLoading')?.classList.remove('active');
    }, 400);
  }
}

window.startLoadingProgress = startLoadingProgress;
window.finishLoadingProgress = finishLoadingProgress;
try { startLoadingProgress(); } catch (e) {}

// ═══════════════════════════════════════════════════════
// راه‌اندازی ماژول‌ها
// ═══════════════════════════════════════════════════════
try { initQtyModal(); }        catch (e) { console.error(e); }
try { initSearchModal(); }     catch (e) { console.error(e); }
try { initScannerButtons(); }  catch (e) { console.error(e); }

// لاگین و هدر
const btnLogin = $('btnLogin'); if (btnLogin) btnLogin.onclick = doLogin;
const loginPass = $('loginPass');
if (loginPass) loginPass.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
const btnBack = $('btnBack'); if (btnBack) btnBack.onclick = () => showScreen('Home');
const btnLogout = $('btnLogout'); if (btnLogout) btnLogout.onclick = doLogout;
const btnProfile = $('btnProfile'); if (btnProfile) btnProfile.onclick = () => openProfile();
const userEmailEl = $('userEmail'); if (userEmailEl) userEmailEl.onclick = () => openProfile();

// ═══════════════════════════════════════════════════════
// ناوبری
// ═══════════════════════════════════════════════════════
document.querySelectorAll('[data-nav]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    const n = el.dataset.nav;
    try {
      if (n === 'home') showScreen('Home');
      else if (n === 'pharmacy') showScreen('Pharmacy');
      else if (n === 'visits') openVisits();
      else if (n === 'patients') openPatients();
      else if (n === 'inventory') openInventoryList();
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
    } catch (err) { console.error('[NAV] error:', n, err); }
  });
});

// ═══════════════════════════════════════════════════════
// 📊 بارگذاری آمار داشبورد
// ═══════════════════════════════════════════════════════
async function loadDashboardStats() {
  try {
    const setStat = (key, val) => {
      const el = document.querySelector(`[data-stat="${key}"]`);
      if (el) el.textContent = faNum(val !== undefined && val !== null ? val : 0);
    };

    const todayStr = new Date().toISOString().slice(0, 10);
    const monthStart = todayStr.slice(0, 8) + '01';
    const threeMonthsLater = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const { count: patCount, error: patErr } = await sb.from('core_patient').select('*', { count: 'exact', head: true });
    setStat('patientsTotal', patErr ? 0 : patCount);

    const { count: visToday, error: visErr } = await sb.from('visits_visit').select('*', { count: 'exact', head: true }).gte('visit_date', todayStr);
    setStat('visitsToday', visErr ? 0 : visToday);

    const { count: occCount, error: occErr } = await sb.from('lab_results_periodicexamination').select('*', { count: 'exact', head: true }).gte('exam_date', monthStart);
    setStat('examsMonth', occErr ? 0 : occCount);

    try {
      let fineCount = 0;
      const { count: c1, error: e1 } = await sb.from('safety_finereward').select('*', { count: 'exact', head: true }).gte('created_at', monthStart);
      if (!e1) fineCount = c1;
      else {
        const { count: c2 } = await sb.from('safety_finereward').select('*', { count: 'exact', head: true });
        fineCount = c2;
      }
      setStat('finesMonth', fineCount);
    } catch(e) { setStat('finesMonth', 0); }

    try {
      const { count: formCount, error: formErr } = await sb.from('form_records').select('*', { count: 'exact', head: true });
      setStat('formsCount', formErr ? 0 : formCount);
    } catch(e) { setStat('formsCount', 0); }

    const { data: stockData, error: stockErr } = await sb.from('v_drug_stock').select('drug_id, total_quantity');
    if (!stockErr && stockData) {
      const totalDrugTypes = stockData.length; 
      const lowStock = stockData.filter(s => s.total_quantity > 0 && s.total_quantity <= 10).length;
      setStat('drugsTotal', totalDrugTypes);
      setStat('drugsLow', lowStock);
    } else {
      setStat('drugsTotal', 0);
      setStat('drugsLow', 0);
    }
    
    const { count: expCount, error: expErr } = await sb.from('drugs_drugbatch').select('*', { count: 'exact', head: true }).lt('expiry_date', threeMonthsLater).gt('quantity', 0);
    setStat('drugsExpiring', expErr ? 0 : expCount);

  } catch (err) {
    console.error('[Stats] Error loading dashboard stats:', err);
  }
}

// ═══════════════════════════════════════════════════════
// ➕ تنظیم هوشمند دکمه شناور وسط (FAB)
// ═══════════════════════════════════════════════════════
function initFab() {
  const fab = document.getElementById('navFab');
  if (!fab) return;

  const role = currentUser?.user_metadata?.role || currentUser?.role;

  if (role === 'Nurse' || role === 'doctor') {
    fab.innerHTML = '<i class="bi bi-plus-lg"></i>';
    fab.title = 'ثبت ویزیت جدید';
    fab.onclick = (e) => { e.preventDefault(); openCreate(); };
  } else if (role === 'safety' || role === 'Supervisor' || isAdmin) {
    fab.innerHTML = '<i class="bi bi-shield-plus"></i>';
    fab.title = 'ثبت جریمه / تشویقی';
    fab.onclick = (e) => { e.preventDefault(); openFineReward(); };
  } else {
    fab.innerHTML = '<i class="bi bi-plus-lg"></i>';
    fab.onclick = (e) => { e.preventDefault(); openVisits(); };
  }
}

// ═══════════════════════════════════════════════════════
// 📱 مدیریت نصب PWA (اصلاح‌شده)
// ═══════════════════════════════════════════════════════
let deferredInstallPrompt = null;
const btnInstall = document.getElementById('btnInstallPWA');

// اگر برنامه از قبل نصب شده باشد، دکمه را مخفی کن
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
  if (btnInstall) btnInstall.style.display = 'none';
} else {
  if (btnInstall) btnInstall.style.display = 'flex'; // دکمه به صورت پیش‌فرض دیده شود
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (btnInstall) btnInstall.style.display = 'flex';
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  if (btnInstall) btnInstall.style.display = 'none';
  toast('✅ اپلیکیشن با موفقیت نصب شد', 'success');
});

window._triggerInstall = async () => {
  if (!deferredInstallPrompt) {
    alert('مرورگر شما از نصب خودکار پشتیبانی نمی‌کند.\n\nلطفاً از منوی مرورگر خود اقدام کنید:\n\n• در اندروید (کروم): منوی سه نقطه ⋮ ➔ Install app یا Add to Home screen\n• در آیفون (سافاری): دکمه Share ➔ Add to Home Screen\n• در دسکتاپ (کروم): آیکون نصب در نوار آدرس کنار ستاره');
    return;
  }
  
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  
  if (outcome === 'accepted') {
    if (btnInstall) btnInstall.style.display = 'none';
  }
  deferredInstallPrompt = null;
};

// ═══════════════════════════════════════════════════════
// راه‌اندازی اولیه
// ═══════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('scannerWrap')?.classList.contains('active')) closeScanner();
});

(async () => {
  try {
    await checkAuth();
    await loadDashboardStats();
    initFab();
  } catch (e) {
    console.error('[APP] Init error:', e);
  } finally {
    finishLoadingProgress();
  }
  try { await initFCM(); } catch (e) { console.error('[APP] initFCM:', e); }
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(console.error);
}
