// js/forms/templates/form34.js
import { wrap, head, lbl, val, e, ltr, dots, opt, dline } from '../fs.js';

export function render(d) {
  d = d || {};
  const g = (k) => d[k] ?? '';

  return wrap(`
    ${head({ code: 'BR-FR-HS-34-00', title: 'فرم بستری موقت مراجعه کننده' })}
    <table class="fs-grid">
      <tr>
        <td class="fs-side gray" rowspan="4"><span>مشخصات مراجعه کننده: (بیمار/مصدوم)</span></td>
        <td>${lbl('نام و نام خانوادگی:')} ${val(g('_patientName'))}</td>
        <td>${lbl('کد پرسنلی:')} ${val(g('_personnelNumber'), { ltr: true })}</td>
        <td>${lbl('تاریخ:')} ${val(g('_date'), { ltr: true })}</td>
      </tr>
      <tr>
        <td>${lbl('سن:')} ${val(g('age'), { ltr: true })}</td>
        <td>${lbl('شماره تماس:')} ${val(g('_phone'), { ltr: true })}</td>
        <td>${lbl('شماره ردیف فرم ثبت مراجعات:')} ${val(g('rowNumber'), { ltr: true })}</td>
      </tr>
      <tr>
        <td>${lbl('در صورت وقوع حادثه محل آن:')} ${val(g('incidentLocation'))}</td>
        <td>${lbl('نام واحد/پیمانکار:')} ${val(g('_unitContractor'))}</td>
        <td>${lbl('محل کار:')} ${val(g('workplace'))}</td>
      </tr>
      <tr>
        <td colspan="2">${lbl('ساعت شروع علائم/وقوع حادثه:')} ${dots(g('_symptomTime'), 'w60')}</td>
        <td>${lbl('ساعت مراجعه به واحد بهداری:')} ${dots(g('_visitTime'), 'w60')}</td>
      </tr>
      <tr>
        <td colspan="4" class="fs-mid">
          <div>${lbl('علت مراجعه:')} ${opt(g('reason') === 'disease', 'بیماری')} ${opt(g('reason') === 'incident', 'حادثه')}</div>
          <div>${lbl('وضعیت مراجعه کننده:')} BP: ${dots(g('bp'), 'w60')} PR: ${dots(g('pr'), 'w60')} RR: ${dots(g('rr'), 'w60')} Tem: ${dots(g('tem'), 'w60')} SPO₂: ${dots(g('spo2'), 'w60')}</div>
          <div>${lbl('شرح حال و شرح اقدامات انجام شده:')}</div>
          <div class="fs-hand">${e(g('summaryText'))}</div>
          <div class="fs-sign">نام و نام خانوادگی و امضاء پرستار</div>
        </td>
      </tr>
      <tr>
        <td class="fs-side gray" rowspan="3"><span>تعیین تکلیف بیمار/مصدوم</span></td>
        <td colspan="3">
          <div>${lbl('الف) ترخیص:')}</div>
          <div>${lbl('توصیه‌ها:')}</div>
          <div class="fs-hand sm">${e(g('dischargeAdvice'))}</div>
          <div class="fs-sign">امضای پرستار</div>
          <div class="fs-para" style="font-size:10px;line-height:1.9">
            توصیه های فوق به اطلاع اینجانب ${dots(g('_patientName'), 'w120')} رسانده شد.
          </div>
          <div class="fs-sign">امضای مراجعه کننده</div>
        </td>
      </tr>
      <tr>
        <td colspan="3">
          <div>${lbl('ب) اعزام:')}</div>
          <div class="fs-sign">امضای پرستار</div>
        </td>
      </tr>
      <tr>
        <td colspan="3">
          <div>${lbl('پ) ترک با رضایت شخصی:')}</div>
          <div class="fs-sign">امضاء و اثر انگشت مراجعه کننده</div>
        </td>
      </tr>
    </table>
  `, { compact: true });
}

// ⚠️ fields و load دست‌نخورده باقی بمانند
export const fields = /* ... */;
export async function load(id) { /* ... */ }
