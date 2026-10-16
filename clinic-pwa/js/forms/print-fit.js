// js/forms/print-fit.js
/**
 * Auto-fit helper برای چاپ فرم‌ها روی یک صفحه A4
 * استفاده: قبل از window.print() تابع fitFormsToA4(area) را صدا بزنید.
 * بعد از چاپ: resetFormFit(area) تا فرم برای نمایش دوباره درست شود.
 */

const A4_WIDTH_MM  = 210;
const A4_HEIGHT_MM = 297;
// 96dpi → 3.7795px per mm
const MM_TO_PX = 96 / 25.4;

export function a4WidthPx()  { return A4_WIDTH_MM  * MM_TO_PX; }
export function a4HeightPx() { return A4_HEIGHT_MM * MM_TO_PX; }

/**
 * هر فرم را به اندازه A4 قید می‌کند و در صورت سرریز، scale می‌کند.
 * @param {HTMLElement} rootEl - مثل #formPrintArea
 * @returns {Array<{scale:number, naturalH:number, targetH:number}>}
 */
export function fitFormsToA4(rootEl) {
  if (!rootEl) return [];
  const targetH = a4HeightPx();

  // شیت‌ها را جمع کن؛ اگر .form-sheet نبود، فرزندان مستقیم را در نظر بگیر
  let sheets = Array.from(rootEl.querySelectorAll('.form-sheet'));
  if (!sheets.length) {
    sheets = Array.from(rootEl.children).filter(el => {
      // از اگر ریشه فقط یک div لخت است، همان را بگیر
      return el.nodeType === 1 && !el.classList.contains('no-print');
    });
  }

  const results = [];

  sheets.forEach(sheet => {
    // ═══ ریست ═══
    sheet.style.transform = '';
    sheet.style.transformOrigin = '';
    sheet.style.width = '';
    sheet.style.minHeight = '';
    sheet.style.height = '';
    sheet.style.overflow = '';
    sheet.style.boxShadow = 'none';
    sheet.style.margin = '0';
    sheet.style.padding = '';
    // کلاس A4 را اضافه کن
    sheet.classList.add('form-sheet-a4');

    // ═══ قید عرض A4 ═══
    sheet.style.width = `${A4_WIDTH_MM}mm`;
    sheet.style.boxSizing = 'border-box';

    // ═══ اندازه‌گیری ارتفاع طبیعی ═══
    // ارتفاع را آزاد بگذاریم تا scrollHeight درست دربیاید
    const prevMinH = sheet.style.minHeight;
    const prevH    = sheet.style.height;
    sheet.style.minHeight = '0';
    sheet.style.height = 'auto';
    const naturalH = sheet.scrollHeight;   // شامل padding
    sheet.style.minHeight = prevMinH;
    sheet.style.height = prevH;

    // ═══ اگر سرریز کرد، scale کن ═══
    let scale = 1;
    if (naturalH > targetH + 2) {   // 2px tolerance
      scale = targetH / naturalH;
      // حاشیه‌ی اطمینان ۲٪
      scale *= 0.985;
      sheet.style.transformOrigin = 'top right';
      sheet.style.transform = `scale(${scale})`;
      sheet.style.overflow = 'hidden';
    }

    results.push({ sheet, scale, naturalH, targetH });
  });

  return results;
}

/**
 * ریست کردن transform و ابعاد
 */
export function resetFormFit(rootEl) {
  if (!rootEl) return;
  rootEl.querySelectorAll('.form-sheet, .form-sheet-a4').forEach(s => {
    s.style.transform = '';
    s.style.transformOrigin = '';
    s.style.width = '';
    s.style.minHeight = '';
    s.style.height = '';
    s.style.overflow = '';
    s.style.boxShadow = '';
    s.style.margin = '';
  });
}

/**
 * راحت‌ترین روش: داخل setTimeout قبل از print صدا بزن
 */
export function fitAndPrint(rootEl, { delay = 120 } = {}) {
  // منتظر یک فریم بمون تا فونت/استایل لود شود
  requestAnimationFrame(() => {
    fitFormsToA4(rootEl);
    setTimeout(() => {
      window.print();
      setTimeout(() => resetFormFit(rootEl), 800);
    }, delay);
  });
}
