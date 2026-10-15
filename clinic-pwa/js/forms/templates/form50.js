// js/forms/templates/form50.js
import { wrap, lbl, e, dots, dline } from '../fs.js';
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
  const g = (k) => d[k] ?? '';
  const conditions = conditionLines(d.conditions);

  return wrap(`
    <div class="fs-frame">
      <table style="width:100%;border:none;margin-bottom:8px;">
        <tr>
          <td class="fs-noborder" style="text-align:right;width:80px;">
            <img src="icons/logo-form.png" width="62"
              onerror="this.style.visibility='hidden'" alt="">
          </td>
          <td class="fs-noborder" style="text-align:left;font-size:10px;font-weight:700;">
            کد فرم: <bdi dir="ltr">BR-FR-HS-50-00</bdi>
          </td>
        </tr>
      </table>

      <h2 style="text-align:center;font-size:18px;font-weight:800;margin:10px 0 16px;">
        فرم تعهد نامه شروع به کار /ادامه همکاری پرسنل مشروط
      </h2>

      <p class="fs-para">
        اینجانب ${dots(g('patientName'), 'w160')}
        فرزند ${dots(g('fatherName'), 'w120')}
        به شماره ملی ${dots(g('nationalCode'), 'w130')}
        متصدی شغل ${dots(g('occupation'), 'w130')}
        در واحد ${dots(g('workUnit'), 'w130')}
        متعهد می‌شوم تمامی الزامات و دستورالعمل های ایمنی را رعایت نموده و شروط ذکر شده در پرونده طب کار معاینات بدو استخدامی طی نظریه پزشک طب کار که شامل موارد زیر می‌باشد را رعایت نمایم:
      </p>

      <div style="margin:12px 0;">
        ${conditions.map(c => `
          <div class="fs-dline fs-hand" style="min-height:26px;">${e(c)}</div>
        `).join('')}
      </div>

      <p class="fs-para">
        و در صورت سرپیچی از موارد فوق و همه موارد ذکر شده در پرونده، شرکت هیچگونه مسئولیتی نخواهد داشت.
      </p>

      <table style="width:100%;border:none;margin-top:16px;">
        <tr>
          <td class="fs-noborder">${lbl('تاریخ:')} ${dots('', 'w140')}</td>
          <td class="fs-noborder">${lbl('محل امضاء:')} ${dots('', 'w160')}</td>
        </tr>
      </table>

      <hr style="margin:24px 0;border:none;border-top:1px dashed #999;">

      <p class="fs-para">
        اینجانب ${dots(g('supervisorName'), 'w160')}
        سرپرست نامبرده متعهد می‌شوم خلاف شروط ذکر شده در پرونده معاینات بدو استخدامی را از پرسنل نخواهم و طبق توصیه های پزشک طب کار عمل نماید.
      </p>

      <table style="width:100%;border:none;margin-top:16px;">
        <tr>
          <td class="fs-noborder">${lbl('تاریخ:')} ${dots('', 'w140')}</td>
          <td class="fs-noborder">${lbl('محل امضاء:')} ${dots('', 'w160')}</td>
        </tr>
      </table>
    </div>
  `);
}
