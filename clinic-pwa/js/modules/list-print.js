رش// js/modules/list-print.js
// Helper مشترک چاپ A4 برای لیست‌ها و اسناد (سازگار با وب + Capacitor)

const A4_STYLES = `
  @import url('https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/misc/web/Vazirmatn-Regular.woff2');
  * { box-sizing: border-box; }
  :root {
    --primary-color:#1e3a8a;
    --secondary-color:#475569;
    --border-color:#e2e8f0;
    --bg-light:#f8fafc;
  }
  body {
    font-family: 'Vazirmatn', Tahoma, sans-serif;
    margin: 0; padding: 0; direction: rtl;
    color: #1e293b; background: #cbd5e1;
  }
  .paper {
    background: #fff; width: 210mm; min-height: 297mm;
    margin: 0 auto; padding: 40px 30px;
    box-shadow: 0 10px 25px rgba(0,0,0,.2);
  }
  .hdr {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 2px solid var(--primary-color);
    padding-bottom: 16px; margin-bottom: 22px;
  }
  .hdr h1 { color: var(--primary-color); font-size: 24px; font-weight: 900; margin: 0; }
  .hdr .sub { color: #64748b; font-size: 12px; margin-top: 4px; }
  .hdr .meta { text-align: left; font-size: 12px; color: var(--secondary-color); line-height: 1.8; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 20px; }
  .info-card {
    border: 1px solid var(--border-color); padding: 12px; border-radius: 4px;
    background: var(--bg-light); font-size: 13px;
  }
  .info-card h4 {
    color: var(--primary-color); border-bottom: 1px solid #cbd5e1;
    padding-bottom: 6px; margin: 0 0 10px 0; font-size: 13px; font-weight: bold;
  }
  .info-row { display: flex; margin-bottom: 5px; }
  .info-label { color: #64748b; width: 110px; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  table th {
    background: var(--primary-color); color: #fff; text-align: center;
    padding: 10px 6px; font-size: 12px; font-weight: bold;
  }
  table td {
    padding: 10px 6px; border-bottom: 1px solid var(--border-color);
    font-size: 12px; text-align: center;
  }
  table tr:nth-child(even) td { background: #fcfcfc; }
  .name { text-align: right !important; font-weight: bold; }
  .diff-plus { color: #059669; font-weight: bold; }
  .diff-minus { color: #dc2626; font-weight: bold; }
  .total-box {
    border: 1px solid var(--border-color); padding: 12px;
    border-radius: 4px; background: var(--bg-light);
    display: flex; justify-content: space-between; font-size: 14px;
  }
  .total-box strong { color: var(--primary-color); font-size: 16px; }
  .sig {
    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;
    margin-top: 55px; text-align: center;
  }
  .sig-box {
    height: 100px; border: 1px dashed #cbd5e1; padding: 8px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .sig-title { font-size: 12px; font-weight: bold; color: var(--secondary-color); }
  .alert-ok {
    background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46;
    padding: 12px; border-radius: 6px; text-align: center; font-size: 13px;
  }
  @media print {
    body { background: none; }
    .paper { box-shadow: none; margin: 0; width: 100%; padding: 15mm; }
    table th {
      background: #1e3a8a !important; color: #fff !important;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
  }
  @page { size: A4; margin: 0; }
`;

/**
 * چاپ محتوای A4.
 * @param {Object} opts
 * @param {string} opts.title       - عنوان اصلی (مثلاً «رسید دریافت کالا»)
 * @param {string} [opts.subtitle]  - زیرعنوان
 * @param {Object} [opts.headerMeta]- { code, date, status }  برای نمایش در هدر سمت چپ
 * @param {Array}  [opts.infoCards] - [{ title, rows: [[label, value], ...] }]
 * @param {Array}  [opts.columns]   - [{ label, key, align, cls, formatter }]
 * @param {Array}  [opts.rows]      - آرایه‌ی آیتم‌ها
 * @param {string} [opts.footerHTML]- HTML اضافه قبل از امضاها
 * @param {Array}  [opts.signatures]- ['تنظیم‌کننده', 'تأییدکننده', 'مدیریت انبار']
 * @param {string} [opts.primaryColor] - رنگ اصلی (پیش‌فرض #1e3a8a)
 */
export function printA4(opts) {
  const {
    title,
    subtitle = '',
    headerMeta = {},
    infoCards = [],
    columns = [],
    rows = [],
    footerHTML = '',
    signatures = ['تنظیم‌کننده', 'تأییدکننده', 'مدیریت انبار'],
    primaryColor = '#1e3a8a',
  } = opts;

  const styles = A4_STYLES.replace(/--primary-color:#1e3a8a;/g, `--primary-color:${primaryColor};`);

  const metaHTML = [
    headerMeta.code   ? `<div><strong>شماره:</strong> ${escapeHtmlSafe(headerMeta.code)}</div>`   : '',
    headerMeta.date   ? `<div><strong>تاریخ:</strong> ${escapeHtmlSafe(headerMeta.date)}</div>`   : '',
    headerMeta.status ? `<div><strong>وضعیت:</strong> ${escapeHtmlSafe(headerMeta.status)}</div>` : '',
  ].filter(Boolean).join('');

  const infoHTML = infoCards.length
    ? `<div class="info-grid">${infoCards.map(c => `
        <div class="info-card">
          <h4>${escapeHtmlSafe(c.title || '')}</h4>
          ${(c.rows || []).map(([l, v]) => `
            <div class="info-row">
              <span class="info-label">${escapeHtmlSafe(l)}:</span>
              <span>${v == null ? '-' : v}</span>
            </div>`).join('')}
        </div>`).join('')}
      </div>`
    : '';

  const theadHTML = columns.length
    ? `<thead><tr>${columns.map(c => `<th>${escapeHtmlSafe(c.label)}</th>`).join('')}</tr></thead>`
    : '';

  const tbodyHTML = rows.length
    ? `<tbody>${rows.map((row, idx) => `
        <tr>${columns.map(c => {
          const raw = typeof c.formatter === 'function' ? c.formatter(row, idx) : row[c.key];
          const cls = [c.cls || '', c.align === 'right' ? 'name' : ''].filter(Boolean).join(' ');
          return `<td class="${cls}">${raw == null ? '-' : raw}</td>`;
        }).join('')}</tr>`).join('')}</tbody>`
    : `<tbody><tr><td colspan="${columns.length || 1}" style="text-align:center;padding:20px;color:#64748b;">موردی یافت نشد</td></tr></tbody>`;

  const bodyHTML = `
    <div class="hdr">
      <div>
        <h1>${escapeHtmlSafe(title)}</h1>
        ${subtitle ? `<div class="sub">${escapeHtmlSafe(subtitle)}</div>` : ''}
      </div>
      ${metaHTML ? `<div class="meta">${metaHTML}</div>` : ''}
    </div>
    ${infoHTML}
    ${columns.length ? `<table>${theadHTML}${tbodyHTML}</table>` : ''}
    ${footerHTML}
    <div class="sig">
      ${signatures.map(s => `
        <div class="sig-box">
          <span class="sig-title">${escapeHtmlSafe(s)}</span>
          <div></div>
        </div>`).join('')}
    </div>
  `;

  const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>${escapeHtmlSafe(title)}</title>
  <style>${styles}</style>
</head>
<body>
  <div class="paper">${bodyHTML}</div>
  <script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script>
</body>
</html>`;

  openPrintWindow(html);
}

// ═══════════════════════════════════════════════════════════
// باز کردن پنجره/iframe چاپ (سازگار با Capacitor)
// ═══════════════════════════════════════════════════════════
function openPrintWindow(html) {
  // ۱) اول تلاش: پنجره‌ی جدید (وب)
  let win = null;
  try {
    win = window.open('', '_blank', 'width=900,height=1000');
  } catch (e) { /* ممکن است بلاک شده باشد */ }

  if (win && win.document) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    return;
  }

  // ۲) فال‌بک: iframe مخفی (Capacitor / بلاک پاپ‌آپ)
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  // کمی صبر کن تا فونت‌ها/استایل لود شوند، بعد چاپ
  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      console.warn('[PRINT] iframe print failed:', e);
    }
    setTimeout(() => iframe.remove(), 3000);
  }, 600);
}

// ═══════════════════════════════════════════════════════════
// escape محلی (تا مستقل از utils.js باشد)
// ═══════════════════════════════════════════════════════════
function escapeHtmlSafe(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
