// js/forms/templates/form37.js
import { wrap, head, lbl, val, e, ltr, dots, opt, dline } from '../fs.js';

export function render(d) {
  d = d || {};
  const g = (k) => d[k] ?? '';

  return wrap(`
    ${head({ code: 'BR-FR-HS-37-00', title: 'فرم اعزام / ارجاع به مرکز درمانی' })}
    <table class="fs-grid">
      <tr>
        <td class="fs-side" rowspan="4"><span>مشخصات مراجعه کننده</span></td>
        <td>${lbl('نام و نام خانوادگی:')} ${val(g('_patientName'))}</td>
        <td>${lbl('نام پدر:')} ${val(g('fatherName'))}</td>
        <td>${lbl('کد ملی:')} ${val(g('_nationalCode'), { ltr: true })}</td>
      </tr>
      <tr>
        <td>${lbl('تاریخ تولد:')} ${val(g('_birthDate'), { ltr: true })}</td>
        <td>${lbl('محل تولد:')} ${val(g('birthPlace'))}</td>
        <td>${lbl('شماره تماس:')} ${val(g('_phone'), { ltr: true })}</td>
      </tr>
      <tr>
        <td>${lbl('کدپرسنلی:')} ${val(g('_personnelNumber'), { ltr: true })}</td>
        <td>${lbl('ساعت وقوع علائم بیماری/حادثه:')} ${dots(g('_symptomTime'), 'w60')}</td>
        <td>${lbl('شماره ردیف فرم ثبت مراجعات:')} ${val(g('rowNumber'), { ltr: true })}</td>
      </tr>
      <tr>
        <td>${lbl('نام واحد/پیمانکار:')} ${val(g('_unitContractor'))}</td>
        <td>${lbl('ساعت مراجعه به بهداری:')} ${dots(g('_visitTime'), 'w60')}</td>
        <td>${lbl('تاریخ:')} ${val(g('_date'), { ltr: true })}</td>
      </tr>
      <tr>
        <td class="fs-side" rowspan="2"><span>نظریه پزشکی</span></td>
        <td colspan="3" class="fs-mid">
          <div>${lbl('خلاصه شرح حال:')}</div>
          <div class="fs-dline fs-hand">${e(g('summaryText'))}</div>
          <div>${lbl('خلاصه سوابق پزشکی (معاینات دوره ای):')}</div>
          <div class="fs-dline fs-hand">${e(g('medicalHistory'))}</div>
          <div>${lbl('خلاصه علائم حیاتی:')} PR: ${dots(g('pr'), 'w40')} BP: ${dots(g('bp'), 'w40')} RR: ${dots(g('rr'), 'w40')} SPO₂: ${dots(g('spo2'), 'w40')}</div>
          <div>${lbl('GCS:')} E4 ${dots('', 'w40')} V5 ${dots('', 'w40')} M6 ${dots('', 'w40')} T15 ${dots('', 'w40')}</div>
          <div>${lbl('نیاز به همراه:')} ${opt(g('needsCompanion') === 'yes', 'دارد')} ${opt(g('needsCompanion') === 'no', 'ندارد')} ${lbl('نام و شماره تماس همراه:')} ${val(g('companionContact'), { ltr: true })}</div>
          <div>${lbl('نحوه اعزام/ ارجاع:')} ${opt(g('mechanism') === 'ambulance', 'با آمبولانس')} ${lbl('سایر:')} ${dots(g('mechanismOther'), 'w120')}</div>
          <div class="fs-sign">مهر و امضاء / تکنسین فوریت های پزشکی</div>
        </td>
      </tr>
      <tr>
        <td colspan="3" class="fs-mid">
          <div>${lbl('ساعت خروج از شرکت:')} ${dots(g('_exitCompany'), 'w60')}</div>
          <div>${lbl('ساعت حضور در بیمارستان:')} ${dots(g('_arriveHospital'), 'w60')}</div>
          <div>${lbl('ساعت خروج از بیمارستان:')} ${dots(g('_exitHospital'), 'w60')}</div>
          <div>${lbl('ساعت حضور در شرکت:')} ${dots(g('_arriveCompany'), 'w60')}</div>
          <div>${lbl('اقدامات صورت پذیرفته در مسیر بیمارستان و وضعیت بیمار (علائم حیاتی) در زمان تحویل:')}</div>
          <div class="fs-hand sm">${e(g('transferActions'))}</div>
          <div>${lbl('Vital Signs:')} BP: ${dots(g('bp2'), 'w40')} PR: ${dots(g('pr2'), 'w40')} RR: ${dots(g('rr2'), 'w40')} GCS: ${dots(g('gcs'), 'w40')} Tem: ${dots(g('tem'), 'w40')} SPO₂: ${dots(g('spo2'), 'w40')}</div>
          <div>${lbl('امضای تکنسین:')} ${dots('', 'w120')} ${lbl('امضای راننده:')} ${dots('', 'w120')}</div>
          <div>${lbl('توضیحات:')} <span class="fs-hand sm">${e(g('notes'))}</span></div>
          <div>${lbl('تائیدیه تحویل بیمار به پزشک — اورژانس بیمارستان:')} ${dots('', 'w160')}</div>
          <div class="fs-sign">مهر و امضا</div>
          <div class="fs-para" style="font-size:10px;line-height:1.9">
            بدینوسیله تائید می گردد فرم اعزام به بیمارستان آقای ${dots(g('_patientName'), 'w160')}
          </div>
          <div class="fs-sign">امضاء رئیس ایمنی، بهداشت و محیط زیست</div>
        </td>
      </tr>
    </table>
    <div class="fs-note">توزیع نسخ: نسخه اول: واحد بهداری — نسخه دوم: پرونده بیمارستان</div>
  `, { compact: true });
}

// ⚠️ fields و load دست‌نخورده باقی بمانند
export const fields = /* ... */;
export async function load(id) { /* ... */ }
