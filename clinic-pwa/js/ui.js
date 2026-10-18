// js/ui.js
import { $ } from './utils.js';
import { openInventoryList } from './modules/inventory-list.js'; // ⬅️ ایمپورت لیست به جای فرم
import { openReceive } from './modules/receive.js';
import { openDisposal } from './modules/disposal.js';
// در صورت نیاز، سایر ماژول‌ها را اینجا ایمپورت کنید:
// import { openDrugSearch } from './modals.js';

// ═══════════════════════════════════════════════════════════
// تابع مدیریت نمایش صفحات (Screen Switcher)
// ═══════════════════════════════════════════════════════════
export function showScreen(screenName) {
  // مخفی کردن همه صفحات
  document.querySelectorAll('.screen').forEach(el => {
    el.classList.remove('active');
  });

  // نمایش صفحه درخواستی (با استفاده از id یا data-attribute)
  // فرض بر این است که هر صفحه یک id دارد مثل screen-Inventory
  const targetScreen = document.getElementById(`screen-${screenName}`) || document.getElementById(screenName);
  
  if (targetScreen) {
    targetScreen.classList.add('active');
  } else {
    console.warn(`⚠ صفحه با نام ${screenName} پیدا نشد.`);
  }

  // به‌روزرسانی منوی پایین (Bottom Navigation) در صورت وجود
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.screen === screenName);
  });
}

// ═══════════════════════════════════════════════════════════
// اتصال دکمه‌های منو به ماژول‌ها
// ═══════════════════════════════════════════════════════════
export function initUI() {
  
  // ۱. دکمه انبارگردانی (تغییر یافته ⬅️)
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

  // ۴. دکمه‌های منوی پایین (در صورت وجود)
  document.querySelectorAll('[data-screen]').forEach(el => {
    if (el.classList.contains('nav-item')) {
      el.onclick = () => {
        const screen = el.dataset.screen;
        showScreen(screen);
        
        // اگر صفحه‌ای نیاز به لود اولیه دارد
        if (screen === 'Inventory') openInventoryList();
        if (screen === 'Receive') openReceive();
        if (screen === 'Disposal') openDisposal();
      };
    }
  });
}

// اجرای خودکار تنظیمات هنگام لود شدن فایل
document.addEventListener('DOMContentLoaded', () => {
  initUI();
});
