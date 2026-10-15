// js/forms/templates/form39.js
import { wrap, head, lbl, e, ltr, dots } from '../fs.js';

export function render(d) {
  d = d || {};
  const g = (k) => d[k] ?? '';

  return wrap(`
    ${head({ code: 'BR-FR-HS-39-00', title: 'فرم تحویل Safety box/ پسماند عفونی به بیمارستان' })}
    <table class="fs-grid">
      <tr>
        <td class="fs-mid" style="height:260px">
          <div class="fs-para bold fs-hand">
            بدین وسیله گواهی می شود ${dots(g('_count'), 'w60')} عدد ظرف پسماند عفونی Safety box/ ${dots(g('_type'), 'w120')}
            در تاریخ ${dots(g('_date'), 'w90')}، به بیمارستان ${dots(g('_hospital'), 'w160')} تحویل داده شد.
          </div>
          <table style="width:100%;margin-top:36px;border:none">
            <tr>
              <td style="border:none;text-align:right;width:50%">
                ${lbl('تحویل دهنده:')} ${dots('', 'w160')}
                <div class="fs-sign" style="padding-top:6px">امضاء</div>
              </td>
              <td style="border:none;text-align:right;width:50%">
                ${lbl('تحویل گیرنده:')} ${dots('', 'w160')}
                <div class="fs-sign" style="padding-top:6px">امضاء</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `);
}

// ⚠️ fields و load دست‌نخورده باقی بمانند
export const fields = /* ... */;
export async function load(id) { /* ... */ }
