// js/forms/templates/form48.js
import { escapeHtml, gregorianToJalali } from '../../utils.js';
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

const DOTS = '................';
const inline = (v, w) =>
  `<span style="display:inline-block;min-width:${w || 130}px;border-bottom:1px dotted #000;padding:0 4px;">${escapeHtml(v)}</span>`;

function emptyLine() {
  return `<div style="border-bottom:1px dotted #000;min-height:22px;"></div>`;
}

export function render(d) {
  d = d || {};
  const name = d.patientName || DOTS;
  const father = d.fatherName || DOTS;
  const nc = d.nationalCode || DOTS;
  const pn = d.personnelNumber || DOTS;
  const spec = d.referralSpecialty || DOTS;
  const date = d.referralDate || DOTS;

  const reasonTxt = d.referralReason || '';
  const diagTxt = d.referralDiagnosis || '';
  let reasonLine;
  if (reasonTxt && diagTxt) reasonLine = `${escapeHtml(reasonTxt)} — ${escapeHtml(diagTxt)}`;
  else if (reasonTxt) reasonLine = escapeHtml(reasonTxt);
  else if (diagTxt) reasonLine = escapeHtml(diagTxt);
  else reasonLine = DOTS;

  return `
    <div class="header-table">
      <table>
        <tr>
          <td class="header-form-code" style="width:120px;">BR-FR-HS-48-00</td>
          <td class="header-center" style="font-size:13px;font-weight:800;">فرم ارجاع به متخصص</td>
          <td class="header-logo">
            <img id="formLogo" src="icons/logo-form.png" onerror="this.style.display='none'">
          </td>
        </tr>
      </table>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
      <tr>
        <td style="border:1.5px solid #000;padding:6px;width:60%;font-size:11px;">
          پزشک محترم متخصص: <strong>${escapeHtml(spec)}</strong>
        </td>
        <td style="border:1.5px solid #000;padding:6px;font-size:11px;">
          تاریخ ارجاع: <strong>${escapeHtml(date)}</strong>
        </td>
      </tr>
    </table>

    <p style="line-height:2;font-size:12px;">با سلام و احترام</p>

    <p style="text-align:justify;line-height:2.4;font-size:12px;">
      بدین وسیله آقای/خانم ${inline(name, 170)}
      فرزند ${inline(father, 120)}
      به شماره ملی ${inline(nc, 130)}
      به دلیل ${inline(reasonLine, 220)}
      جهت ویزیت و صدور دستورات پزشکی و درمانی به حضور معرفی می‌گردد.
    </p>

    <div style="margin-top:10px;font-size:12px;">
      <span style="font-weight:700;">مدارک پیوست:</span>
      <span style="display:inline-block;min-width:220px;border-bottom:1px dotted #000;">${escapeHtml(d.attachedDocs || '')}</span>
    </div>

    <div class="signature-row" style="margin-top:14px;">
      <div class="signature-item" style="text-align:left;">
        <div class="line"></div>
        <div style="font-size:11px;">امضاء کارشناس بهداشت</div>
      </div>
      <div class="signature-item"></div>
    </div>

    <div class="box" style="margin-top:18px;">
      <div class="box-title">تعهد مراجعه به متخصص و پیگیری درمان</div>
      <p style="text-align:justify;line-height:2.3;font-size:11px;">
        اینجانب آقا/خانم ${inline(name, 140)}
        به کد ملی ${inline(nc, 110)}
        به شماره پرسنلی ${inline(pn, 90)}
        توسط ${inline(DOTS, 110)}
        به پزشک متخصص ${inline(spec, 120)}
        معرفی و متعهد می گردم سریعا جهت درمان مراجعه نموده و مسئولیت عواقب ناشی از عدم مراجعه بر عهده اینجانب خواهد بود و شرکت مسئولیتی در قبال آن نداشته و می تواند مطابق ضوابط انضباطی با اینجانب برخورد نماید.
      </p>
      <div style="margin-top:20px;text-align:left;">
        <span style="font-weight:700;">امضاء و اثر انگشت:</span>
        <span style="display:inline-block;min-width:180px;border-bottom:1px dotted #000;">&nbsp;</span>
      </div>
    </div>

    <div class="box">
      <div class="box-title">نظریه پزشک متخصص</div>
      <div style="font-size:11px;">تاریخ: <span style="display:inline-block;min-width:140px;border-bottom:1px dotted #000;">&nbsp;</span></div>
      <div style="margin-top:6px;font-size:11px;">تشخیص احتمالی: <span style="display:inline-block;min-width:260px;border-bottom:1px dotted #000;">&nbsp;</span></div>
      <div style="margin-top:8px;font-weight:700;font-size:11px;">دستورات و توصیه های پزشکی:</div>
      ${emptyLine()}${emptyLine()}${emptyLine()}
      <div style="margin-top:8px;font-size:11px;">مدت زمان طول درمان(استعلاجی): <span style="display:inline-block;min-width:150px;border-bottom:1px dotted #000;">&nbsp;</span></div>
      <div style="margin-top:22px;text-align:left;font-size:11px;">
        مهر و امضاء پزشک متخصص
      </div>
    </div>

    <div class="box">
      <div class="box-title">نظریه پزشک طب کار</div>
      <div style="font-weight:700;font-size:11px;">دستورات و توصیه های پزشکی:</div>
      ${emptyLine()}${emptyLine()}
      <div style="margin-top:22px;text-align:left;font-size:11px;">
        مهر و امضاء پزشک طب کار
      </div>
    </div>

    <div class="box">
      <div class="box-title">نظریه کارشناس بهداشت</div>
      <div style="font-weight:700;font-size:11px;">دستورات و توصیه های پزشکی بررسی شد.</div>
      <div style="margin-top:6px;font-size:11px;">توضیحات: <span style="display:inline-block;min-width:240px;border-bottom:1px dotted #000;">&nbsp;</span></div>
      <div style="margin-top:22px;text-align:left;font-size:11px;">
        امضاء کارشناس بهداشت
      </div>
    </div>

    <div class="footer-note">
      بایگانی یک نسخه از این فرم در پرونده پزشکی فرد ارجاع شده ضروری است.
    </div>
  `;
}