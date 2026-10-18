// js/ui.js
export function showScreen(screenName) {
  const screens = {
    'Login':        'screenLogin',
    'Home':         'screenHome',
    'Pharmacy':     'screenPharmacy',
    'Visit':        'screenVisit',
    'Patients':     'screenPatients',
    'Inventory':    'screenInventory',
    'Receive':      'screenReceive',
    'Disposal':     'screenDisposal',
    'Report':       'screenReport',
    'Profile':      'screenProfile',
    'Occupational': 'screenOccupational',
    'Forms':        'screenForms',
    'FormsMenu':    'screenFormsMenu',
    'FormsArchive': 'screenFormsArchive',
    'Guide':        'screenGuide',
    'VisitReports': 'screenVisitReports',
    'FineReward':   'screenFineReward',
  };

  const targetId = screens[screenName];
  if (!targetId) return;

  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(targetId);
  if (target) target.classList.add('active');

  const appHeader = document.getElementById('appHeader');
  const bottomNav = document.getElementById('bottomNav');
  const sideNav = document.getElementById('sideNav');
  const btnBack = document.getElementById('btnBack');
  const headerTitle = document.getElementById('headerTitle');

  // ⬅️ منطق مخفی و نمایش سایدبار
  if (screenName === 'Login') {
    if (appHeader) appHeader.classList.add('hidden');
    if (bottomNav) bottomNav.classList.add('hidden');
    if (sideNav) sideNav.style.display = 'none'; // ⬅️ مخفی کردن قاطع سایدبار
  } else {
    if (appHeader) appHeader.classList.remove('hidden');
    if (bottomNav) bottomNav.classList.remove('hidden');
    if (sideNav) sideNav.style.display = ''; // نمایش مجدد
  }

  const titles = {
    'Home': 'کلینیک', 'Pharmacy': 'داروخانه', 'Visit': 'ویزیت‌ها',
    'Patients': 'مدیریت بیماران', 'Inventory': 'انبارگردانی', 'Receive': 'دریافت دارو',
    'Disposal': 'خروج منقضی', 'Report': 'گزارش‌ها', 'Profile': 'پروفایل',
    'Occupational': 'طب کار', 'Forms': 'فرم‌ها', 'FormsMenu': 'فرآیندها و فرم‌ها',
    'FormsArchive': 'آرشیو فرم‌ها', 'Guide': 'راهنمای فرآیندها',
    'VisitReports': 'گزارش ویزیت‌ها', 'FineReward': 'جریمه و تشویقی'
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
    if (a.dataset.nav === screenName.toLowerCase()) a.classList.add('active');
  });
  
  document.querySelectorAll('.side-links a').forEach(a => {
    a.classList.remove('active');
    if (a.dataset.nav === screenName.toLowerCase() || (screenName === 'Home' && a.dataset.nav === 'home')) {
      a.classList.add('active');
    }
  });
}
