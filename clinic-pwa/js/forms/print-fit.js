// js/forms/print-fit.js
/**
 * Auto-fit helper برای چاپ فرم‌ها روی یک صفحه‌ی A4
 * ────────────────────────────────────────────────
 * اگر محتوای یک .form-sheet از 297mm بیشتر شود،
 * به صورت خودکار scale می‌شود تا در یک صفحه جا بگیرد.
 *
 * استفاده:
 *   import { fitAndPrint } from './print-fit.js';
 *   fitAndPrint(document.getElementById('formPrintArea'));
 */

const A4_WIDTH_MM  = 210;
const A4_HEIGHT_MM = 297;
const MM_TO_PX     = 96 / 25.4;   // ≈ 3.7795 px/mm

const MIN_SCALE     = 0.72;       // کوچک‌تر از این نشود
const SAFETY_FACTOR = 0.99;       // حاشیه‌ی اطمینان (۱٪ کمتر از A4)

export function a4WidthPx()  { return A4_WIDTH_MM  * MM_TO_PX; }
export function a4HeightPx() { return A4_HEIGHT_MM * MM_TO_PX; }

/**
 * همه‌ی شیت‌های فرم را در یک A4 جا می‌دهد (در صورت لزوم scale).
 * @param {HTMLElement} rootEl - مثلاً #formPrintArea
 * @returns {Array<{sheet:HTMLElement, scale:number, naturalH:number, targetH:number}>}
 */
export function fitFormsToA4(rootEl) {
  if (!rootEl) return [];

  const targetH = a4HeightPx() * SAFETY_FACTOR;

  // ═══ پیدا کردن شیت‌ها ═══
  let sheets = Array.from(rootEl.querySelectorAll('.form-sheet'));
  if (!sheets.length) {
    // اگر فرم‌ها .form-sheet ندارند، فرزندان مستقیم را حساب کن
    sheets = Array.from(rootEl.children).filter(
      el => el.nodeType === 1 && !el.classList.contains('no-print')
    );
  }

  const results = [];

  sheets.forEach(sheet => {
    // ═══ ۱. ریست کامل ═══
    sheet.style.transform       = '';
    sheet.style.transformOrigin = '';
    sheet.style.width           = '';
    sheet.style.minHeight       = '';
    sheet.style.height          = '';
    sheet.style.overflow        = '';
    sheet.style.boxShadow       = 'none';
    sheet.style.margin          = '';
    sheet.style.padding         = '';
    sheet.classList.add('form-sheet-a4');

    // ═══ ۲. قید عرض A4 ═══
    sheet.style.width      = `${A4_WIDTH_MM}mm`;
    sheet.style.boxSizing  = 'border-box';

    // ═══ ۳. اندازه‌گیری ارتفاع طبیعی ═══
    // ارتفاع را آزاد بگذار تا scrollHeight دقیق باشد
    const prevMinH = sheet.style.minHeight;
    const prevH    = sheet.style.height;
    sheet.style.minHeight = '0';
    sheet.style.height    = 'auto';
    // force reflow
    void sheet.offsetHeight;
    const naturalH = sheet.scrollHeight;
    sheet.style.minHeight = prevMinH;
    sheet.style.height    = prevH;

    // ═══ ۴. تصمیم بر scale ═══
    let scale = 1;
    if (naturalH > targetH + 1) {   // 1px تلورانس
      scale = targetH / naturalH;
      // حاشیه‌ی اطمینان اضافی
      scale *= 0.99;
      // کف scale
      if (scale < MIN_SCALE) scale = MIN_SCALE;

      sheet.style.transformOrigin = 'top right';
      sheet.style.transform       = `scale(${scale})`;
      sheet.style.overflow        = 'hidden';
    }

    results.push({ sheet, scale, naturalH, targetH });
  });

  return results;
}

/**
 * پاک کردن transform و ابعاد دستی
 */
export function resetFormFit(rootEl) {
  if (!rootEl) return;
  rootEl.querySelectorAll('.form-sheet, .form-sheet-a4').forEach(s => {
    s.style.transform       = '';
    s.style.transformOrigin = '';
    s.style.width           = '';
    s.style.minHeight       = '';
    s.style.height          = '';
    s.style.overflow        = '';
    s.style.boxShadow       = '';
    s.style.margin          = '';
    s.style.padding         = '';
  });
}

/**
 * آماده‌سازی + چاپ + ریست
 * @param {HTMLElement} rootEl - ناحیه‌ی چاپ
 * @param {Object} [opts]
 * @param {number} [opts.delay=150] - تأخیر قبل از print (ms)
 * @param {Function} [opts.onAfterPrint] - اختیاری
 */
export function fitAndPrint(rootEl, { delay = 150, onAfterPrint } = {}) {
  if (!rootEl) return;

  // مرحله ۱: بعد از رندر شدن DOM
  requestAnimationFrame(() => {
    // مرحله ۲: اعمال scale
    fitFormsToA4(rootEl);

    // مرحله ۳: کمی صبر تا فونت‌ها/رندر نهایی شود
    setTimeout(() => {
      const afterPrint = () => {
        resetFormFit(rootEl);
        if (typeof onAfterPrint === 'function') onAfterPrint();
        window.removeEventListener('afterprint', afterPrint);
      };
      window.addEventListener('afterprint', afterPrint);

      window.print();

      // فال‌بک اگر afterprint اجرا نشد (بعضی مرورگرها)
      setTimeout(afterPrint, 2000);
    }, delay);
  });
}

/**
 * فقط آماده‌سازی (بدون چاپ) — برای preview
 */
export function preparePrint(rootEl) {
  if (!rootEl) return [];
  return fitFormsToA4(rootEl);
}
