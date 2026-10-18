// js/ui.js
import { openInventoryList } from './modules/inventory-list.js'; // ⬅️ ایمپورت لیست به جای فرم
import { openReceive } from './modules/receive.js';
import { openDisposal } from './modules/disposal.js';

// ═══════════════════════════════════════════════════════════
// تابع مدیریت نمایش صفحات (Screen Switcher)
// ═══════════════════════════════════════════════════════════
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
    'FormsArchive': 'آرشیو فرم‌ها',
    'Guide':        'راهنمای فرآیندها',
    'VisitReports': 'گزارش ویزیت‌ها',
    'FineReward':   'جریمه و تشویقی',
  };

  const targetId = screens[screenName];
  
  // اگر صفحه در لیست نبود، کاری نکن
  if (!targetId) return; 

  // مخفی کردن همه صفحات و نمایش صفحه هدف
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(targetId);
  if (target) target.classList.add('active');

  // مدیریت منوی پایین
  const bottomNav = document.getElementById('bottomNav');
  if (bottomNav) {
    // اگر در صفحات اصلی هستیم منو را نشان بده
    if (['Home', 'Pharmacy', 'Visit', 'Profile', 'Inventory'].includes(screenName)) {
      bottomNav.classList.remove('hidden');
    } else {
      bottomNav.classList.add('hidden');
    }
  }

  // تغییر عنوان هدر
  const headerTitle = document.getElementById('headerTitle');
  if (headerTitle) headerTitle.textContent = titles[screenName] || 'کلینیک';

  // مدیریت دکمه بازگشت
  const btnBack = document.getElementById('btnBack');
  if (btnBack) {
    if (['Home', 'Pharmacy', 'Visit', 'Profile'].includes(screenName)) {
      btnBack.classList.add('hidden');
    } else {
      btnBack.classList.remove('hidden');
    }
  }
}

// ═══════════════════════════════════════════════════════════
// اتصال دکمه‌های منو به ماژول‌ها
// ═══════════════════════════════════════════════════════════
function initMenuEvents() {
  // ۱. دکمه انبارگردانی (تغییر یافته ⬅️)
  // شناسه دکمه شما در صفحه داروخانه را اینجا قرار دهید (مثلاً btnInventory یا menu-inventory)
  const btnInventory = document.getElementById('btnInventory') || document.getElementById('menu-inventory');
  if (btnInventory) {
    btnInventory.onclick = () => {
      // ⭐ تغییر اصلی: رفتن به لیست انبارگردانی به جای فرم شروع
      openInventoryList(); 
    };
  }

  // ۲. دکمه دریافت دارو
  const btnReceive = document.getElementById('btnReceive') || document.getElementById('menu-receive');
  if (btnReceive) {
    btnReceive.onclick = () => {
      openReceive();
    };
  }

  // ۳. دکمه خروج دارو
  const btnDisposal = document.getElementById('btnDisposal') || document.getElementById('menu-disposal');
  if (btnDisposal) {
    btnDisposal.onclick = () => {
      openDisposal();
    };
  }
}

// اجرای تنظیمات هنگام لود شدن فایل
document.addEventListener('DOMContentLoaded', () => {
  initMenuEvents();
});
