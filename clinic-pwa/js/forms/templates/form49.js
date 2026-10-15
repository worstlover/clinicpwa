// js/forms/templates/form49.js
import { wrap, head, lbl, val, e, opt, dline } from '../fs.js';
import { gregorianToJalali } from '../../utils.js';
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

export function render(d) {
  d = d || {};
  const g = (k) => d[k] ?? '';
  const ftests = Array.isArray(d.flaggedTests) ? d.flaggedTests : [];
  const recs = Array.isArray(d.recommendations) ? d.recommendations : [];
  const lab = d.labHints || {};
  const curKind = d.examKind || '';
  const curHealth = d.healthStatus || '';

  const hint = (v) => `<span class="fs-hand">(${e(String(v ?? 'ثبت نشده'))})</span>`;

  return wrap(`
    ${head({ code: 'BR-FR-HS-49-00', title: 'فـرم اعلام نتایج معاینات طب کار' })}
    <table class="fs-grid">
      <tr>
        <td colspan="2" style="height:480px;">
          <div>${lbl('نوع معاینات:')}
            ${opt(curKind === 'pre_employment', 'بدو استخدام')}
            ${opt(curKind === 'periodic', 'دوره ای')}
            ${opt(curKind === 'return_to_work', 'بازگشت به کار')}
            ${opt(curKind === 'job_change', 'جابجایی شغلی')}
          </div>
          <div>${lbl('شماره پرسنلی:')} ${val(g('personnelNumber'), { ltr: true })}</div>
          <div>${lbl('نتیجه معاینات:')}
            ${opt(curHealth === 'full', 'صحت و سلامت کامل')}
            ${opt(curHealth === 'relative', 'سلامت نسبی')}
            ${opt(curHealth === 'conditional', 'مشروط')}
          </div>
          <p class="fs-para">
            آقای/خانم ${dots(g('patientName'), 'w160')}
            با پست ${dots(g('occupation'), 'w140')}
            نتایج معاینات شما در سال ${dots(g('examYear'), 'w80')}
            به شرح ذیل می‌باشد.
          </p>
          <div>${lbl('شرح معاینات:')}
            ${opt(ftests.includes('CHO'), 'CHO')} ${hint(lab.CHO)}
            ${opt(ftests.includes('TG'), 'TG')} ${hint(lab.TG)}
            ${opt(ftests.includes('SGOT'), 'SGOT')} ${hint(lab.SGOT)}
            ${opt(ftests.includes('SGPT'), 'SGPT')} ${hint(lab.SGPT)}
            ${opt(ftests.includes('ALK'), 'ALK')} ${hint('ثبت نشده')}
            ${opt(ftests.includes('FBS'), 'FBS')} ${hint(lab.FBS)}
          </div>
          <div style="margin-top:8px;">${lbl('سایر موارد:')}</div>
          <div class="fs-dline fs-hand" style="min-height:40px;">${e(g('otherFindings'))}</div>

          <div style="margin-top:10px;">${lbl('توصیه پزشک:')}
            ${opt(recs.includes('low_fat'), 'کاهش مصرف غذاهای چرب')}
            ${opt(recs.includes('daily_exercise'), 'انجام ورزش روزانه')}
            ${opt(recs.includes('weight_loss'), 'کاهش وزن')}
            ${opt(recs.includes('healthy_diet'), 'استفاده از تغذیه سالم')}
          </div>
          <div style="margin-top:6px;">${lbl('سایر موارد:')}</div>
          <div class="fs-dline fs-hand" style="min-height:40px;">${e(g('otherRecommendation'))}</div>

          ${d.opinionText ? `<div class="fs-dline fs-hand" style="min-height:50px;margin-top:8px;"><strong>نظریه ثبت‌شده در پرونده:</strong> ${e(d.opinionText)}</div>` : ''}

          <p class="fs-para bold" style="text-align:center;margin-top:14px;">
            در صورت مشروط، بایستی فرد به متخصص مراجعه (به مدت ۱ ماه) و سوابق ارجاع و دستور پزشک به واحد HSE تحویل گردد.
          </p>
        </td>
      </tr>
      <tr>
        <td class="fs-small">${lbl('تاریخ و امضاء پزشک:')}</td>
        <td class="fs-small">${lbl('تاریخ و امضاء متقاضی:')}</td>
      </tr>
    </table>
  `);
}
