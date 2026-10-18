// js/ui.js
import { openInventoryList } from './modules/inventory-list.js'; 
import { openReceive } from './modules/receive.js';
import { openDisposal } from './modules/disposal.js';

export function showScreen(screenName) {
  const screens = {
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
    'FormsMenu':    'screenFormsMenu',
    'FormsArchive': 'screenFormsArchive',
    'Guide':        'screenGuide',
    'VisitReports': 'screenVisitReports',
    'FineReward':   'screenFineReward',
  };

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
    'FormsMenu':    'فرآیندها و فرم‌ها',
    'FormsArchive': 'بایگانی فرم‌ها', // ⬅️ تغییر به بایگانی
    'Guide':        'راهنمای فرآیندها',
    'VisitReports': 'گزارش ویزیت‌ها',
    'FineReward':   'جریمه و تشویقی',
  };

  const targetId = screens[screenName];
  if (!targetId) return; 

  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(targetId);
  if (target) target.classList.add('active');

  const bottomNav = document.getElementById('bottomNav');
  if (bottomNav) {
    if (['Home', 'Pharmacy', 'Visit', 'Profile', 'Inventory'].includes(screenName)) {
      bottomNav.classList.remove('hidden');
    } else {
      bottomNav.classList.add('hidden');
    }
  }

  const headerTitle = document.getElementById('headerTitle');
  if (headerTitle) headerTitle.textContent = titles[screenName] || 'کلینیک';

  const btnBack = document.getElementById('btnBack');
  if (btnBack) {
    if (['Home', 'Pharmacy', 'Visit', 'Profile'].includes(screenName)) {
      btnBack.classList.add('hidden');
    } else {
      btnBack.classList.remove('hidden');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btnInv = document.getElementById('btnInventory') || document.getElementById('menu-inventory');
  if (btnInv) {
    btnInv.onclick = () => openInventoryList(); 
  }

  const btnRecv = document.getElementById('btnReceive') || document.getElementById('menu-receive');
  if (btnRecv) {
    btnRecv.onclick = () => openReceive();
  }

  const btnDisp = document.getElementById('btnDisposal') || document.getElementById('menu-disposal');
  if (btnDisp) {
    btnDisp.onclick = () => openDisposal();
  }
});
