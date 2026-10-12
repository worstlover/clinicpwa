import { $ } from './utils.js';

const SCREENS = [
  'screenLogin',
  'screenHome',
  'screenVisit',
  'screenInventory',
  'screenReceive',
  'screenDisposal',
  'screenReport',
  'screenProfile',
  'screenOccupational'
];

const TITLES = {
  Home: 'کلینیک',
  Visit: 'ویزیت‌ها',
  Inventory: 'انبارگردانی',
  Receive: 'دریافت دارو',
  Disposal: 'خروج منقضی',
  Report: 'گزارش‌ها',
  Profile: 'پروفایل',
  Occupational: 'طب کار'
};

export function showScreen(name) {
  SCREENS.forEach(s => {
    const el = $(s);
    if (el) el.classList.remove('active');
  });

  const target = $('screen' + name);
  if (target) target.classList.add('active');

  if (name === 'Login') {
    $('appHeader')?.classList.add('hidden');
    $('bottomNav')?.classList.add('hidden');
  } else {
    $('appHeader')?.classList.remove('hidden');
    $('bottomNav')?.classList.remove('hidden');
    const titleEl = $('headerTitle');
    if (titleEl) titleEl.textContent = TITLES[name] || 'کلینیک';
    $('btnBack')?.classList.toggle('hidden', name === 'Home');
    document.querySelectorAll('.bottom-nav a').forEach(a => {
      a.classList.toggle('active', a.dataset.nav === name.toLowerCase());
    });
  }
  window.scrollTo(0, 0);
}
