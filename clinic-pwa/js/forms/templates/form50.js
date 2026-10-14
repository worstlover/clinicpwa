// js/forms/templates/form50.js
import { escapeHtml } from '../../utils.js';
import { sb } from '../../sb.js';
import { loadPatientExtra } from '../../modules/extra-data.js';

export const fields = [
  { key: 'workUnit', label: 'واحد', editable: true,
    persist: { table: 'patient_extra', column: 'work_unit' }, col: 6 },
  { key: 'supervisorName', label: 'نام سرپرست (بخش دوم فرم)', editable: true, col: 6 },
  { key: 'conditions', label: 'شروط پرونده (هر شرط در یک خط)', type: 'textarea', rows: 5,
    editable: true, col: 12 },
];

export async function load({ examId, patientId }) {
  const data = {
    patientName: '', fatherName: '', nationalCode: '', occupation: '',
    workUnit: '', conditions: '', supervisorName: ''
  };

  if (patientId) {
    try {
      const { data: p } = await sb.from('core_patient')
        .select('first_name, last_name, father_name, national_code, passport_number, is_foreign_national, occupation')
        .eq('id', patientId).maybeSingle();
      if (p) {
        data.patientName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        data.fatherName = p.father_name || '';
        data.nationalCode = p.is_foreign_national ? (p.passport_number || '') : (p.national_code || '');
        data.occupation = p.occupation || '';
      }
      const { data: pe } = await loadPatientExtra(patientId);
      if (pe?.work_unit) data.workUnit = pe.work_unit;
    } catch (e) { console.warn('form50 load patient', e); }
  }

  if (examId) {
    try {
      const { data: ex } = await sb.from('lab_results_periodicexamination')
        .select('final_opinion_conditions').eq('id', examId).maybeSingle();
      if (ex?.final_opinion_conditions) data.conditions = ex.final_opinion_conditions;
    } catch (e) { console.warn('form50 load exam', e); }
  }

  return { data, meta: {} };
}

const DOTS = '................';

function conditionLines(text) {
  const lines = [];
  if (text) {
    const parts = String(text).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) parts.slice(0, 5).forEach(p => lines.push(p));
    else lines.push(String(text).trim());
  }
  while (lines.length < 5) lines.push('');
  return lines;
}

export function render(d) {
  d = d || {};
  const name = d.patientName || DOTS;
  const father = d.fatherName || DOTS;
  const nc = d.nationalCode || DOTS;
  const occ = d.occupation || DOTS;
  const unit = d.workUnit || DOTS;
  const conditions = conditionLines(d.conditions);
  const supervisor = d.supervisorName || DOTS;

  const inline = (v) =>
    `<span style="display:inline-block;min-width:130px;border-bottom:1px dotted #000;padding:0 4px;">${escapeHtml(v)}</span>`;

  return `
    <div style="text-align:center;font-weight:700;font-size:10px;margin-bottom:8px;" dir="ltr">
      کد فرم: BR-FR-HS-50-00
    </div>
    <table style="width:100%;border:none;margin-bottom:8px;">
      <tr>
        <td style="border:none;width:80px;text-align:center;">
          <img id="formLogo" src="icons/logo-form.png" style="max-width:60px;max-height:60px;"
            onerror="this.style.display='none'">
        </td>
        <td style="border:none;text-align:center;">
          <div style="font-size:14px;font-weight:800;">فرم تعهد نامه شروع به کار /ادامه همکاری پرسنل مشروط</div>
        </td>
        <td style="border:none;width:80px;"></td>
      </tr>
    </table>

    <p style="text-align:justify;line-height:2.4;margin-top:12px;font-size:12px;">
      اینجانب ${inline(name)}
      فرزند ${inline(father)}
      به شماره ملی ${inline(nc)}
      متصدی شغل ${inline(occ)}
      در واحد ${inline(unit)}
      متعهد می‌شوم تمامی الزامات و دستورالعمل های ایمنی را رعایت نموده و شروط ذکر شده در پرونده طب کار معاینات بدو استخدامی طی نظریه پزشک طب کار که شامل موارد زیر می‌باشد را رعایت نمایم:
    </p>

    <div style="margin:10px 0;">
      ${conditions.map(c => `
        <div style="border-bottom:1px dotted #000;min-height:26px;padding:3px 6px;font-size:11px;">
          ${escapeHtml(c)}
        </div>
      `).join('')}
    </div>

    <p style="text-align:justify;line-height:2.2;font-size:12px;">
      و در صورت سرپیچی از موارد فوق و همه موارد ذکر شده در پرونده، شرکت هیچگونه مسئولیتی نخواهد داشت.
    </p>

    <div style="display:flex;justify-content:space-between;margin-top:20px;gap:20px;">
      <div style="flex:1;">
        <span style="font-weight:700;">تاریخ:</span>
        <span style="display:inline-block;min-width:140px;border-bottom:1px dotted #000;">&nbsp;</span>
      </div>
      <div style="flex:1;">
        <span style="font-weight:700;">محل امضاء:</span>
        <span style="display:inline-block;min-width:160px;border-bottom:1px dotted #000;">&nbsp;</span>
      </div>
    </div>

    <hr style="margin:24px 0;border:none;border-top:1px dashed #999;">

    <p style="text-align:justify;line-height:2.4;font-size:12px;">
      اینجانب ${inline(supervisor)}
      سرپرست نامبرده متعهد می‌شوم خلاف شروط ذکر شده در پرونده معاینات بدو استخدامی را از پرسنل نخواهم و طبق توصیه های پزشک طب کار عمل نماید.
    </p>

    <div style="display:flex;justify-content:space-between;margin-top:20px;gap:20px;">
      <div style="flex:1;">
        <span style="font-weight:700;">تاریخ:</span>
        <span style="display:inline-block;min-width:140px;border-bottom:1px dotted #000;">&nbsp;</span>
      </div>
      <div style="flex:1;">
        <span style="font-weight:700;">محل امضاء:</span>
        <span style="display:inline-block;min-width:160px;border-bottom:1px dotted #000;">&nbsp;</span>
      </div>
    </div>
  `;
}