// js/modules/list-print.js

export function printA4(options) {
  const {
    title = 'لیست',
    subtitle = '',
    primaryColor = '#0d6efd',
    headerMeta = {},
    infoCards = [],
    columns = [],
    rows = [],
    signatures = []
  } = options;

  // ساخت هدر جدول
  const theadHTML = columns.map(col => `
    <th style="text-align: ${col.align || 'center'}; padding: 8px; border: 1px solid #cbd5e1; background-color: #f8fafc;">
      ${col.label}
    </th>
  `).join('');

  // ساخت بدنه جدول
  const tbodyHTML = rows.map((row, i) => {
    const tds = columns.map(col => {
      let val = '';
      if (col.formatter) {
        val = col.formatter(row, i);
      } else if (col.key) {
        val = row[col.key] ?? '';
      }
      return `<td style="text-align: ${col.align || 'center'}; padding: 8px; border: 1px solid #cbd5e1;">${val}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  // ساخت کارت‌های اطلاعاتی
  const cardsHTML = infoCards.map(card => `
    <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
      <div style="font-weight: bold; margin-bottom: 8px; color: ${primaryColor};">${card.title}</div>
      <table style="width: 100%; border-collapse: collapse;">
        ${card.rows.map(r => `
          <tr>
            <td style="padding: 4px; color: #64748b; font-size: 0.9em;">${r[0]}:</td>
            <td style="padding: 4px; font-weight: bold;">${r[1]}</td>
          </tr>
        `).join('')}
      </table>
    </div>
  `).join('');

  // ساخت بخش امضاها
  const signaturesHTML = signatures.length > 0 ? `
    <div style="display: flex; justify-content: space-between; margin-top: 40px; padding: 0 20px;">
      ${signatures.map(sig => `
        <div style="text-align: center;">
          <div style="border-bottom: 1px dashed #94a3b8; width: 120px; margin-bottom: 8px; height: 40px;"></div>
          <div style="font-size: 0.9em; color: #475569;">${sig}</div>
        </div>
      `).join('')}
    </div>
  ` : '';

  // قالب کلی HTML
  const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="fa">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        @import url('https://v1.fontapi.ir/css/Vazirmatn');
        * { box-sizing: border-box; }
        body { 
          font-family: 'Vazirmatn', sans-serif; 
          margin: 0; 
          padding: 30px; 
          color: #1e293b;
          font-size: 13px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 3px solid ${primaryColor};
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        .title-box h1 { margin: 0 0 8px 0; font-size: 20px; color: ${primaryColor}; }
        .title-box p { margin: 0; color: #64748b; font-size: 14px; }
        .meta-box { text-align: left; font-size: 12px; color: #475569; }
        table.data-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        @media print {
          body { padding: 0; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 15mm; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title-box">
          <h1>${title}</h1>
          <p>${subtitle}</p>
        </div>
        <div class="meta-box">
          ${headerMeta.date ? `<div>تاریخ: ${headerMeta.date}</div>` : ''}
          ${headerMeta.status ? `<div>${headerMeta.status}</div>` : ''}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
        ${cardsHTML}
      </div>

      <table class="data-table">
        <thead><tr>${theadHTML}</tr></thead>
        <tbody>${tbodyHTML}</tbody>
      </table>

      ${signaturesHTML}

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 500);
        };
      <\/script>
    </body>
    </html>
  `;

  // باز کردن پنجره چاپ
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  } else {
    alert('لطفا مسدودکننده پاپ‌آپ (Popup Blocker) مرورگر را غیرفعال کنید.');
  }
}
