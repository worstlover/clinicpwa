// js/modules/forms-menu.js
import { $ } from '../utils.js';
import { openForms } from '../forms/engine.js';
import { openGuide } from '../process/guide.js';
import { openFormsArchive } from './forms-archive.js';

/** نمایش صفحه بدون وابستگی به ui.js */
function showScreenDirect(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen' + name);
  if (!el) {
    console.error('[FORMS-MENU] screen not found: screen' + name);
    return false;
  }
  el.classList.add('active');
  window.scrollTo(0, 0);
  return true;
}

export function openFormsMenu() {
  console.log('[FORMS-MENU] openFormsMenu called');
  showScreenDirect('FormsMenu');

  const wrap = $('formsMenuContent');
  if (!wrap) {
    console.error('[FORMS-MENU] #formsMenuContent not found!');
    return;
  }

  wrap.innerHTML = `
    <div class="forms-menu-page">
      <div class="forms-menu-header">
        <div class="forms-menu-title">فرآیندها و فرم‌ها</div>
        <div class="forms-menu-sub">مدیریت کامل فرم‌های کلینیک</div>
      </div>

      <button class="forms-menu-card" data-action="forms">
        <div class="forms-menu-card-icon" style="background:#ede9fe;color:#7c3aed;">
          <i class="bi bi-file-earmark-text-fill"></i>
        </div>
        <div class="forms-menu-card-body">
          <div class="forms-menu-card-title">فرم‌ها</div>
          <div class="forms-menu-card-desc">پر کردن و چاپ فرم‌های خام</div>
          <div class="forms-menu-card-meta">
            <span class="badge-soft" style="background:#ede9fe;color:#7c3aed;">
              <i class="bi bi-file-earmark"></i>
              فرم‌های قابل ثبت
            </span>
          </div>
        </div>
        <i class="bi bi-chevron-left forms-menu-card-arrow"></i>
      </button>

      <button class="forms-menu-card" data-action="guide">
        <div class="forms-menu-card-icon" style="background:#dbeafe;color:#2563eb;">
          <i class="bi bi-diagram-3-fill"></i>
        </div>
        <div class="forms-menu-card-body">
          <div class="forms-menu-card-title">فرآیندها</div>
          <div class="forms-menu-card-desc">راهنمای گام‌به‌گام هر فرآیند با فرم مربوطه</div>
          <div class="forms-menu-card-meta">
            <span class="badge-soft" style="background:#dbeafe;color:#2563eb;">
              <i class="bi bi-book"></i>
              راهنمای کاربری
            </span>
          </div>
        </div>
        <i class="bi bi-chevron-left forms-menu-card-arrow"></i>
      </button>

      <button class="forms-menu-card" data-action="archive">
        <div class="forms-menu-card-icon" style="background:#fef3c7;color:#d97706;">
          <i class="bi bi-archive-fill"></i>
        </div>
        <div class="forms-menu-card-body">
          <div class="forms-menu-card-title">آرشیو فرم‌ها</div>
          <div class="forms-menu-card-desc">جستجوی کارگر، فیلتر تاریخ و مشاهده فرم‌های ثبت‌شده</div>
          <div class="forms-menu-card-meta">
            <span class="badge-soft" style="background:#fef3c7;color:#b45309;">
              <i class="bi bi-clock-history"></i>
              بایگانی
            </span>
          </div>
        </div>
        <i class="bi bi-chevron-left forms-menu-card-arrow"></i>
      </button>
    </div>
  `;

  wrap.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action;
      console.log('[FORMS-MENU] action:', a);
      try {
        if (a === 'forms') openForms();
        else if (a === 'guide') openGuide();
        else if (a === 'archive') openFormsArchive();
      } catch (err) {
        console.error('[FORMS-MENU] action error:', err);
      }
    });
  });
}
