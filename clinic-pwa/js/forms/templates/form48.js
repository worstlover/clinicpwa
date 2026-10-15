// js/forms/templates/form48.js
import { wrap, head, lbl, val, e, ltr, dots, dline } from '../fs.js';

export function render(d) {
  d = d || {};
  const g = (k) => d[k] ?? '';

  return wrap(`
    ${head({ code: 'BR-FR-HS-48-00', title: 'فرم ارجاع به متخصص' })}
    <table class="fs-grid">
      <tr>
        <td colspan="2">${lbl('پزشک محترم متخصص:')} ${val(g('specialistName'))}</td>
        <td>${lbl('تاریخ ارجاع:')} ${val(g('_referralDate'), { ltr: true })}</td>
      </tr>
      <tr>
        <td colspan="3" class="fs-mid">
          <div>${lbl('با سلام و احترام')}</div>
          <div class="fs-para fs-hand">
            بدین‌وسیله آقای/خانم ${dots(g('_patientName'), 'w160')} فرزند ${dots(g('fatherName'), 'w120')}
            به شماره ملی ${dots(g('_nationalCode'), 'w120')} به دلیل ${dots(g('reason'), 'w220')}
            جهت ویزیت و صدور دستورات پزشکی و درمانی به حضور معرفی می گردد.
          </div>
          <div>${lbl('مدارک پیوست:')} ${dots(g('attachments'), 'w220')}</div>
          <div class="fs-sign">امضاء کارشناس بهداشت</div>
        </td>
      </tr>
      <tr>
        <td colspan="3" class="fs-bar">تعهد مراجعه به متخصص و پیگیری درمان</td>
      </tr>
      <tr>
        <td colspan="3" class="fs-mid">
          <div class="fs-hand">${e(g('commitmentText'))}</div>
          <div class="fs-sign">امضاء و اثر انگشت</div>
        </td>
      </tr>
      <tr>
        <td colspan="3" class="fs-bar">نظریه پزشک متخصص</td>
      </tr>
      <tr>
        <td colspan="3" class="fs-mid">
          <div>${lbl('تاریخ:')} ${dots(g('_specialistDate'), 'w90')}</div>
          <div>${lbl('تشخیص احتمالی:')} <span class="fs-hand sm">${e(g('diagnosis'))}</span></div>
          <div>${lbl('دستورات و توصیه های پزشکی:')}</div>
          <div class="fs-hand">${dline(3)}</div>
          <div>${lbl('مدت زمان طول درمان(استعلاجی):')} ${dots(g('treatmentDuration'), 'w90')}</div>
          <div class="fs-sign">مهر و امضاء پزشک متخصص</div>
        </td>
      </tr>
      <tr>
        <td colspan="3" class="fs-bar">نظریه پزشک طب کار</td>
      </tr>
      <tr>
        <td colspan="3" class="fs-mid">
          <div>${lbl('دستورات و توصیه های پزشکی:')}</div>
          <div class="fs-hand">${dline(2)}</div>
          <div class="fs-sign">مهر و امضاء پزشک طب کار</div>
        </td>
      </tr>
      <tr>
        <td colspan="3" class="fs-bar">نظریه کارشناس بهداشت</td>
      </tr>
      <tr>
        <td colspan="3" class="fs-mid">
          <div>${lbl('دستورات و توصیه های پزشکی بررسی شد')}</div>
          <div>${lbl('توضیحات:')} <span class="fs-hand sm">${e(g('expertNotes'))}</span></div>
          <div class="fs-sign">امضاء کارشناس بهداشت</div>
        </td>
      </tr>
    </table>
    <div class="fs-note">بایگانی یک نسخه از این فرم در پرونده پزشکی فرد ارجاع شده ضروری است.</div>
  `, { compact: true });
}

// ⚠️ fields و load دست‌نخورده باقی بمانند
export const fields = /* ... */;
export async function load(id) { /* ... */ }
