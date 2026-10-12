import { $ } from './utils.js';

const SCREENS = [
  'screenLogin',
  'screenHome',
  'screenInventory',
  'screenDispense',
  'screenReceive',
  'screenDisposal',
  'screenReport',
  'screenProfile'
];

const TITLES = {
  Home: 'داروخانه',
  Inventory: 'انبارگردانی',
  Dispense: 'تحویل دارو',
  Receive: 'دریافت دارو',
  Disposal: 'خروج منقضی',
  Report: 'گزارش‌ها',
  Profile: 'پروفایل'
};

export function showScreen(name) {
  SCREENS.forEach(s => {
    const el = $(s);
    if (el) el.classList.remove('active');
  });
  const target = $('screen' + name);
  if (target) target.classList.add('active');

  if (name === 'Login') {
    $('appHeader').classList.add('hidden');
    $('bottomNav').classList.add('hidden');
  } else {
    $('appHeader').classList.remove('hidden');
    $('bottomNav').classList.remove('hidden');
    $('headerTitle').textContent = TITLES[name] || 'داروخانه';
    $('btnBack').classList.toggle('hidden', name === 'Home');
    document.querySelectorAll('.bottom-nav a').forEach(a => {
      a.classList.toggle('active', a.dataset.nav === name.toLowerCase());
    });
  }
  window.scrollTo(0, 0);
}
