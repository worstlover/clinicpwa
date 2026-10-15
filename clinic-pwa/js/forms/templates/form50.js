// js/forms/templates/form50.js
import { wrap, lbl, e, ltr, dots, dline } from '../fs.js';

export function render(d) {
  d = d || {};
  const g = (k) => d[k] ?? '';
  const conditions = g('conditionLines') || [];

  return wrap(`
    <div class="fs-frame">
      <table style="width:100%;border:none;margin-bottom:10px">
        <tr>
          <td style="border:none;text-align:right;width:30%">
            <img src="icons/logo-form.png" width="62" alt="" onerror="this.style.visibility='hidden'">
          </td>
          <td style="border:none;text-align:left;width:70%">
            ${lbl('کد فرم:')} ${dots('BR-FR-HS-50-00', 'w120')}
          </td>
        </tr>
      </table>

      <div style="text-align:center;font-weight:800;font-size:18px;margin:14px 0 20px">
        فرم تعهد نامه شروع به کار /ادامه همکاری پرسنل مشروط
      </div>

      <div class="fs-para fs-hand">
        اینجانب ${dots(g('_patientName'), 'w160')} فرزند ${dots(g('fatherName'), 'w120')}
        به شماره ملی ${dots(g('_nationalCode'), 'w120')} به شماره پرسنلی ${dots(g('_personnelNumber'), 'w90')}
        بدینوسیله متعهد می‌گردم که:
      </div>

      <div class="fs-hand" style="margin-top:10px">
        ${Array.from({ length: 5 }, (_, i) => {
          const line = conditions[i] || '';
          return `<div class="fs-dline">${e(line)}</div>`;
        }).join('')}
      </div>

      <div class="fs-para fs-hand" style="margin-top:14px">
        و در صورت سرپیچی از هر یک از موارد فوق، این واحد محق است نسبت به قطع همکاری اینجانب اقدام نماید.
      </div>

      <table style="width:100%;border:none;margin-top:20px">
        <tr>
          <td style="border:none;text-align:right;width:50%">
            ${lbl('تاریخ:')} ${dots('', 'w90')}
          </td>
          <td style="border:none;text-align:right;width:50%">
            ${lbl('محل امضاء:')} ${dots('', 'w160')}
          </td>
        </tr>
      </table>

      <hr style="border:none;border-top:1px dashed #000;margin:24px 0">

      <div class="fs-para fs-hand">
        اینجانب ${dots(g('supervisorName'), 'w160')} سرپرست واحد، بدینوسیله تایید می‌نمایم که موارد فوق به اطلاع نامبرده رسانده شد.
      </div>

      <table style="width:100%;border:none;margin-top:20px">
        <tr>
          <td style="border:none;text-align:right;width:50%">
            ${lbl('تاریخ:')} ${dots('', 'w90')}
          </td>
          <td style="border:none;text-align:right;width:50%">
            ${lbl('محل امضاء:')} ${dots('', 'w160')}
          </td>
        </tr>
      </table>
    </div>
  `);
}

// ⚠️ fields و load دست‌نخورده باقی بمانند
export const fields = /* ... */;
export async function load(id) { /* ... */ }
