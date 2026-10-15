// js/forms/templates/form48.js
import { wrap, head, lbl, val, e, dots, dline } from '../fs.js';
import { gregorianToJalali } from '../../utils.js';
import { sb } from '../../sb.js';

export const fields = [
  { key: 'referralSpecialty', label: 'پزشک متخصص', editable: true, col: 6 },
  { key: 'referralReason', label: 'دلیل ارجاع', type: 'textarea', rows: 2, editable: true, col: 12 },
  { key: 'attachedDocs', label: 'مدارک پیوست', editable: true, col: 12 },
];

export async function load({ examId, patientId }) {
  const data = {
    referralSpecialty: '', referralDate: '', patientName: '', fatherName: '',
    nationalCode: '', personnelNumber: '', referralReason: '', referralDiagnosis: '',
    attachedDocs: '', referrerName: ''
  };

  if (patientId) {
    try {
      const { data: p } = await sb.from('core_patient')
        .select('first_name, last_name, father_name, national_code, personnel_number')
        .eq('id', patientId).maybeSingle();
      if (p) {
        data.patientName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        data.fatherName = p.father_name || '';
        data.nationalCode = p.national_code || '';
        data.personnelNumber = p.personnel_number || '';
      }
    } catch (e) { console.warn(e); }
  }

  if (examId) {
    try {
      const { data: ex } = await sb.from('lab_results_periodicexamination')
        .select('referral_specialty_1, referral_date_1, referral_reason_1, referral_diagnosis_1')
        .eq('id', examId).maybeSingle();
      if (ex) {
        data.referralSpecialty = ex.referral_specialty_1 || '';
        data.referralDate = ex.referral_date_1 ? gregorianToJalali(ex.referral_date_1) : '';
        data.referralReason = ex.referral_reason_1 || '';
        data.referralDiagnosis = ex.referral_diagnosis_1 || '';
      }
    } catch (e) { console.warn(e); }
  }

  try {
    const { data: { user } } = await sb.auth.getUser();
    data.referrerName = user?.user_metadata?.full_name || user?.email || '';
  } catch {}

  return { data, meta: {} };
}

export function render(d) {
  d = d || {};
  const g = (k) => d[k] ?? '';
  const reasonTxt = g('referralReason');
  const diagTxt = g('referralDiagnosis');
  let reasonLine = '';
  if (reasonTxt && diagTxt) reasonLine = `${reasonTxt} — ${diagTxt}`;
  else if (reasonTxt) reasonLine = reasonTxt;
  else if (diagTxt) reasonLine = diagTxt;

  return wrap(`
    ${head({ code: 'BR-FR-HS-48-00', title: 'فرم ارجاع به متخصص' })}
    <table class="fs-grid">
      <tr>
        <td colspan="2">${lbl('پزشک محترم متخصص:')} ${val(g('referralSpecialty'))}</td>
        <td>${lbl('تاریخ ارجاع:')} ${val(g('referralDate'), { ltr: true })}</td>
      </tr>
      <tr>
        <td colspan="3" style="min-height:90px;">
          <p class="fs-para">با سلام و احترام</p>
          <p class="fs-para">
            بدین وسیله آقای/خانم ${dots(g('patientName'), 'w160')}
            فرزند ${dots(g('fatherName'), 'w120')}
            به شماره ملی ${dots(g('nationalCode'), 'w120')}
            به دلیل ${dots(reasonLine, 'w220')}
            جهت ویزیت و صدور دستورات پزشکی و درمانی به حضور معرفی می‌گردد.
          </p>
          <div style="margin-top:6px;">${lbl('مدارک پیوست:')} ${dots(g('attachedDocs'), 'w220')}</div>
          <div class="fs-sign">امضاء کارشناس بهداشت</div>
        </td>
      </tr>

      <tr><td colspan="3" class="fs-bar">تعهد مراجعه به متخصص و پیگیری درمان</td></tr>
      <tr>
        <td colspan="3">
          <p class="fs-para">
            اینجانب آقا/خانم ${dots(g('patientName'), 'w140')}
            به کد ملی ${dots(g('nationalCode'), 'w110')}
            به شماره پرسنلی ${dots(g('personnelNumber'), 'w90')}
            توسط ${dots('', 'w110')}
            به پزشک متخصص ${dots(g('referralSpecialty'), 'w120')}
            معرفی و متعهد می گردم سریعا جهت درمان مراجعه نموده و مسئولیت عواقب ناشی از عدم مراجعه بر عهده اینجانب خواهد بود و شرکت مسئولیتی در قبال آن نداشته و می تواند مطابق ضوابط انضباطی با اینجانب برخورد نماید.
          </p>
          <div class="fs-sign">امضاء و اثر انگشت</div>
        </td>
      </tr>

      <tr><td colspan="3" class="fs-bar">نظریه پزشک متخصص</td></tr>
      <tr>
        <td colspan="3">
          <div>${lbl('تاریخ:')} ${dots('', 'w140')}</div>
          <div>${lbl('تشخیص احتمالی:')} ${dots('', 'w260')}</div>
          <div style="margin-top:6px;">${lbl('دستورات و توصیه های پزشکی:')}</div>
          ${dline(3)}
          <div style="margin-top:6px;">${lbl('مدت زمان طول درمان(استعلاجی):')} ${dots('', 'w150')}</div>
          <div class="fs-sign">مهر و امضاء پزشک متخصص</div>
        </td>
      </tr>

      <tr><td colspan="3" class="fs-bar">نظریه پزشک طب کار</td></tr>
      <tr>
        <td colspan="3">
          <div>${lbl('دستورات و توصیه های پزشکی:')}</div>
          ${dline(2)}
          <div class="fs-sign">مهر و امضاء پزشک طب کار</div>
        </td>
      </tr>

      <tr><td colspan="3" class="fs-bar">نظریه کارشناس بهداشت</td></tr>
      <tr>
        <td colspan="3">
          <div>${lbl('دستورات و توصیه های پزشکی بررسی شد.')}</div>
          <div>${lbl('توضیحات:')} ${dots('', 'w240')}</div>
          <div class="fs-sign">امضاء کارشناس بهداشت</div>
        </td>
      </tr>
    </table>

    <div class="fs-note">بایگانی یک نسخه از این فرم در پرونده پزشکی فرد ارجاع شده ضروری است.</div>
  `, { compact: true });
}
