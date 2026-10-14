// js/ui.js
export function showScreen(screenName) {
  // 🌟 مپ اسکرین‌ها - screenPharmacy اضافه شد
  const screens = {
    'Login':        'screenLogin',
    'Home':         'screenHome',
    'Pharmacy':     'screenPharmacy',       // 🌟 جدید
    'Visit':        'screenVisit',
    'Inventory':    'screenInventory',
    'Receive':      'screenReceive',
    'Disposal':     'screenDisposal',
    'Report':       'screenReport',
    'Profile':      'screenProfile',
    'Occupational': 'screenOccupational',
  };

  const targetId = screens[screenName];
  if (!targetId) {
    console.warn('[UI] صفحه ناشناخته:', screenName);
    return;
  }

  // مخفی کردن همه اسکرین‌ها
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));

  // نمایش صفحه هدف
  const target = document.getElementById(targetId);
  if (target) target.classList.add('active');

  // هدر
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

  // عنوان هدر
  const titles = {
    'Home':         'کلینیک',
    'Pharmacy':     'داروخانه',      // 🌟 جدید
    'Visit':        'ویزیت‌ها',
    'Inventory':    'انبارگردانی',
    'Receive':      'دریافت دارو',
    'Disposal':     'خروج منقضی',
    'Report':       'گزارش‌ها',
    'Profile':      'پروفایل',
    'Occupational': 'طب کار',
  };
  if (headerTitle) headerTitle.textContent = titles[screenName] || 'کلینیک';

  // دکمه بازگشت
  if (btnBack) {
    if (screenName === 'Home' || screenName === 'Login') {
      btnBack.classList.add('hidden');
    } else {
      btnBack.classList.remove('hidden');
    }
  }

  // هایلایت نوار پایین
  document.querySelectorAll('.bottom-nav a').forEach(a => {
    a.classList.remove('active');
    if (a.dataset.nav === screenName.toLowerCase()) {
      a.classList.add('active');
    }
  });
}
