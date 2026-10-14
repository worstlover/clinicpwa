// js/forms/templates/form49.js
import { escapeHtml, gregorianToJalali } from '../../utils.js';
import { sb } from '../../sb.js';
import { loadExamExtra } from '../../modules/extra-data.js';

export const fields = [
  { key: 'personnelNumber', label: 'شماره پرسنلی', editable: true, col: 6 },
  { key: 'examKind', label: 'نوع معاینات', type: 'select', editable: true, col: 6,
    options: [
      { value: '', label: '—' },
      { value: 'pre_employment', label: 'بدو استخدام' },
      { value: 'periodic', label: 'دوره ای' },
      { value: 'return_to_work', label: 'بازگشت به کار' },
      { value: 'job_change', label: 'جابجایی شغلی' },
    ],
    persist: { table: 'exam_extra', column: 'exam_kind' } },
  { key: 'healthStatus', label: 'نتیجه معاینات', type: 'select', editable: true, col: 6,
    options: [
      { value: '', label: '—' },
      { value: 'full', label: 'صحت و سلامت کامل' },
      { value: 'relative', label: 'سلامت نسبی' },
      { value: 'conditional', label: 'مشروط' },
    ],
    persist: { table: 'exam_extra', column: 'health_status' } },
  { key: 'otherFindings', label: 'سایر موارد (شرح معاینات)', editable: true, col: 12,
    persist: { table: 'exam_extra', column: 'other_findings' } },
  { key: 'otherRecommendation', label: 'سایر موارد (توصیه پزشک)', editable: true, col: 12,
    persist: { table: 'exam_extra', column: 'other_recommendation' } },
];

export async function load({ examId, patientId }) {
  const data = {
    patientName: '', personnelNumber: '', occupation: '', examYear: '',
    examKind: '', healthStatus: '',
    flaggedTests: [], recommendations: [],
    otherFindings: '', otherRecommendation: '',
    opinionText: '', labHints: {}
  };

  if (patientId) {
    try {
      const { data: p } = await sb.from('core_patient')
        .select('first_name, last_name, personnel_number, occupation')
        .eq('id', patientId).maybeSingle();
      if (p) {
        data.patientName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        data.personnelNumber = p.personnel_number || '';
        data.occupation = p.occupation || '';
      }
    } catch (e) { console.warn(e); }
  }

  if (examId) {
    try {
      const { data: ex } = await sb.from('lab_results_periodicexamination')
        .select('exam_date, exam_type, final_opinion_text')
        .eq('id', examId).maybeSingle();
      if (ex) {
        data.opinionText = ex.final_opinion_text || '';
        if (ex.exam_date) {
          const jd = gregorianToJalali(ex.exam_date);
          data.examYear = (jd || '').split('/')[0] || '';
        }
        data.examKind = (ex.exam_type === 'pre_employment') ? 'pre_employment' : 'periodic';
      }

      const { data: exx } = await loadExamExtra(examId);
      if (exx) {
        if (exx.exam_kind) data.examKind = exx.exam_kind;
        if (exx.health_status) data.healthStatus = exx.health_status;
        else if (data.opinionText === 'مشروط') data.healthStatus = 'conditional';
        data.flaggedTests = Array.isArray(exx.flagged_tests) ? exx.flagged_tests : [];
        data.recommendations = Array.isArray(exx.recommendations) ? exx.recommendations : [];
        data.otherFindings = exx.other_findings || '';
        data.otherRecommendation = exx.other_recommendation || '';
      }

      // مقادیر آزمایش (فقط راهنما)
      const { data: labs } = await sb.from('lab_results_labparameterresult')
        .select('result_value, test_type:lab_results_testtype(name)')
        .eq('periodic_exam_id', examId);
      (labs || []).forEach(l => {
        const n = (l.test_type?.name || '').toLowerCase();
        if (n.includes('cholesterol')) data.labHints.CHO = l.result_value;
        if (n.includes('triglycerides')) data.labHints.TG = l.result_value;
        if (n === 'ast') data.labHints.SGOT = l.result_value;
        if (n === 'alt') data.labHints.SGPT = l.result_value;
        if (n === 'fbs') data.labHints.FBS = l.result_value;
      });
    } catch (e) { console.warn(e); }
  }

  return { data, meta: {} };
}

const cbox = (checked) => `<span class="check-box${checked ? ' checked' : ''}"></span>`;
const hint = (v) => `(${escapeHtml(String(v ?? 'ثبت نشده'))})`;

export function render(d) {
  d = d || {};
  const name = d.patientName || '................';
  const pn = d.personnelNumber || '................';
  const occ = d.occupation || '................';
  const year = d.examYear || '................';

  const kinds = ['pre_employment', 'periodic', 'return_to_work', 'job_change'];
  const kindLabels = { pre_employment: 'بدو استخدام', periodic: 'دوره ای', return_to_work: 'بازگشت به کار', job_change: 'جابجایی شغلی' };
  const ftests = Array.isArray(d.flaggedTests) ? d.flaggedTests : [];
  const recs = Array.isArray(d.recommendations) ? d.recommendations : [];
  const lab = d.labHints || {};
  const curKind = d.examKind || '';
  const curHealth = d.healthStatus || '';

  return `
    <div class="header-table">
      <table>
        <tr>
          <td class="header-form-code" style="width:120px;">BR-FR-HS-49-00</td>
          <td class="header-center" style="font-size:13px;font-weight:800;">فـرم اعلام نتایج معاینات طب کار</td>
          <td class="header-logo">
            <img id="formLogo" src="icons/logo-form.png" onerror="this.style.display='none'">
          </td>
        </tr>
      </table>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
      <tr>
        <td style="border:1.5px solid #000;padding:6px;width:60%;font-size:11px;">
          نوع معاینات:
          ${kinds.map(k => `<span style="display:inline-flex;align-items:center;gap:4px;margin-left:10px;">${cbox(curKind === k)} ${kindLabels[k]}</span>`).join('')}
        </td>
        <td style="border:1.5px solid #000;padding:6px;font-size:11px;">
          شماره پرسنلی: <strong dir="ltr">${escapeHtml(pn)}</strong>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="border:1.5px solid #000;padding:6px;font-size:11px;">
          نتیجه معاینات:
          <span style="display:inline-flex;align-items:center;gap:4px;margin-left:10px;">${cbox(curHealth === 'full')} صحت و سلامت کامل</span>
          <span style="display:inline-flex;align-items:center;gap:4px;margin-left:10px;">${cbox(curHealth === 'relative')} سلامت نسبی</span>
          <span style="display:inline-flex;align-items:center;gap:4px;margin-left:10px;">${cbox(curHealth === 'conditional')} مشروط</span>
        </td>
      </tr>
    </table>

    <p style="text-align:justify;line-height:2.2;font-size:12px;">
      آقای/خانم
      <span style="display:inline-block;min-width:180px;border-bottom:1px dotted #000;">${escapeHtml(name)}</span>
      با پست
      <span style="display:inline-block;min-width:140px;border-bottom:1px dotted #000;">${escapeHtml(occ)}</span>
      نتایج معاینات شما در سال
      <span style="display:inline-block;min-width:80px;border-bottom:1px dotted #000;">${escapeHtml(year)}</span>
      به شرح ذیل می‌باشد.
    </p>

    <div style="margin-top:14px;">
      <div style="font-weight:700;margin-bottom:6px;">شرح معاینات:</div>
      <div style="display:flex;flex-wrap:wrap;gap:12px 18px;">
        <span style="display:inline-flex;align-items:center;gap:4px;">${cbox(ftests.includes('CHO'))} CHO ${hint(lab.CHO)}</span>
        <span style="display:inline-flex;align-items:center;gap:4px;">${cbox(ftests.includes('TG'))} TG ${hint(lab.TG)}</span>
        <span style="display:inline-flex;align-items:center;gap:4px;">${cbox(ftests.includes('SGOT'))} SGOT ${hint(lab.SGOT)}</span>
        <span style="display:inline-flex;align-items:center;gap:4px;">${cbox(ftests.includes('SGPT'))} SGPT ${hint(lab.SGPT)}</span>
        <span style="display:inline-flex;align-items:center;gap:4px;">${cbox(ftests.includes('ALK'))} ALK (ثبت نشده)</span>
        <span style="display:inline-flex;align-items:center;gap:4px;">${cbox(ftests.includes('FBS'))} FBS ${hint(lab.FBS)}</span>
      </div>
    </div>

    <div style="margin-top:10px;">
      <div style="font-weight:700;">سایر موارد:</div>
      <div style="min-height:40px;border-bottom:1px dotted #000;padding:4px 2px;font-size:11px;">
        ${escapeHtml(d.otherFindings || '')}
      </div>
    </div>

    <div style="margin-top:14px;">
      <div style="font-weight:700;margin-bottom:6px;">توصیه پزشک:</div>
      <div style="display:flex;flex-wrap:wrap;gap:12px 18px;">
        <span style="display:inline-flex;align-items:center;gap:4px;">${cbox(recs.includes('low_fat'))} کاهش مصرف غذاهای چرب</span>
        <span style="display:inline-flex;align-items:center;gap:4px;">${cbox(recs.includes('daily_exercise'))} انجام ورزش روزانه</span>
        <span style="display:inline-flex;align-items:center;gap:4px;">${cbox(recs.includes('weight_loss'))} کاهش وزن</span>
        <span style="display:inline-flex;align-items:center;gap:4px;">${cbox(recs.includes('healthy_diet'))} استفاده از تغذیه سالم</span>
      </div>
    </div>

    <div style="margin-top:10px;">
      <div style="font-weight:700;">سایر موارد:</div>
      <div style="min-height:40px;border-bottom:1px dotted #000;padding:4px 2px;font-size:11px;">
        ${escapeHtml(d.otherRecommendation || '')}
      </div>
    </div>

    <div style="margin-top:16px;">
      <div style="min-height:60px;border:1px dashed #999;padding:6px;font-size:11px;">
        ${d.opinionText ? `<strong>نظریه ثبت‌شده در پرونده:</strong> ${escapeHtml(d.opinionText)}` : '&nbsp;'}
      </div>
    </div>

    <p style="text-align:center;font-weight:800;margin-top:16px;font-size:12px;">
      در صورت مشروط، بایستی فرد به متخصص مراجعه (به مدت ۱ ماه) و سوابق ارجاع و دستور پزشک به واحد HSE تحویل گردد.
    </p>

    <div class="signature-row">
      <div class="signature-item">
        <div>تاریخ و امضاء پزشک:</div>
        <div class="line"></div>
      </div>
      <div class="signature-item">
        <div>تاریخ و امضاء متقاضی:</div>
        <div class="line"></div>
      </div>
    </div>
  `;
}