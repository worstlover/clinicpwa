// js/ui.js
export function showScreen(screenName) {
  const screens = {
    'Login':        'screenLogin',
    'Home':         'screenHome',
    'Pharmacy':     'screenPharmacy',
    'Visit':        'screenVisit',
    'Inventory':    'screenInventory',
    'Receive':      'screenReceive',
    'Disposal':     'screenDisposal',
    'Report':       'screenReport',
    'Profile':      'screenProfile',
    'Occupational': 'screenOccupational',
    'Forms':        'screenForms',
    'FormsMenu':    'screenFormsMenu',      // ← اضافه شد
    'FormsArchive': 'screenFormsArchive',   // ← اضافه شد
    'Guide':        'screenGuide',
  };

  const targetId = screens[screenName];
  if (!targetId) {
    console.warn('[UI] صفحه ناشناخته:', screenName);
    return;
  }

  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));

  const target = document.getElementById(targetId);
  if (target) target.classList.add('active');

  const appHeader = document.getElementById('appHeader');
  const bottomNav = document.getElementById('bottomNav');
  const btnBack = document.getElementById('btnBack');
  const headerTitle = document.getElementById('headerTitle');

  if (screenName === 'Login') {
    if (appHeader) appHeader.classList.add('hidden');
    if (bottomNav) bottomNav.classList.add('hidden');
  } else {
    if (appHeader) appHeader.classList.remove('hidden');
    if (bottomNav) bottomNav.classList.remove('hidden');
  }

  const titles = {
    'Home':         'کلینیک',
    'Pharmacy':     'داروخانه',
    'Visit':        'ویزیت‌ها',
    'Inventory':    'انبارگردانی',
    'Receive':      'دریافت دارو',
    'Disposal':     'خروج منقضی',
    'Report':       'گزارش‌ها',
    'Profile':      'پروفایل',
    'Occupational': 'طب کار',
    'Forms':        'فرم‌ها',
    'FormsMenu':    'فرآیندها و فرم‌ها',    // ← اضافه شد
    'FormsArchive': 'آرشیو فرم‌ها',         // ← اضافه شد
    'Guide':        'راهنمای فرآیندها',
  };
  if (headerTitle) headerTitle.textContent = titles[screenName] || 'کلینیک';

  if (btnBack) {
    if (screenName === 'Home' || screenName === 'Login') {
      btnBack.classList.add('hidden');
    } else {
      btnBack.classList.remove('hidden');
    }
  }

  document.querySelectorAll('.bottom-nav a').forEach(a => {
    a.classList.remove('active');
    if (a.dataset.nav === screenName.toLowerCase()) {
      a.classList.add('active');
    }
  });
}
