// js/forms/registry.js
// ═══════════════════════════════════════════════════════
// ثبت همه‌ی فرم‌ها. هر فرم: { code, title, processCode, source, load(ctx), render(data), fields }
// - source: 'exam' | 'visit' | 'shift' | 'none'
// - load(ctx): ctx = { examId?, visitId?, patientId? } → برمی‌گرداند { data, meta }
// - render(data): رشته HTML (فقط بخش inner .form-sheet)
// - render({}): باید بدون خطا «نمونه‌ی خام» بدهد
// ═══════════════════════════════════════════════════════
import { render as render48, load as load48, fields as fields48 } from './templates/form48.js';
import { render as render49, load as load49, fields as fields49 } from './templates/form49.js';
import { render as render50, load as load50, fields as fields50 } from './templates/form50.js';

export const FORMS = {
  'BR-FR-HS-48-00': {
    code: 'BR-FR-HS-48-00',
    title: 'فرم ارجاع به متخصص',
    processCode: 'BR-HS-10-02',
    source: 'exam',
    load: load48,
    render: render48,
    fields: fields48
  },
  'BR-FR-HS-49-00': {
    code: 'BR-FR-HS-49-00',
    title: 'فرم اعلام نتایج معاینات طب کار',
    processCode: 'BR-HS-10-02',
    source: 'exam',
    load: load49,
    render: render49,
    fields: fields49
  },
  'BR-FR-HS-50-00': {
    code: 'BR-FR-HS-50-00',
    title: 'فرم تعهدنامه شروع به کار / ادامه همکاری پرسنل مشروط',
    processCode: 'BR-HS-10-02',
    source: 'exam',
    load: load50,
    render: render50,
    fields: fields50
  }
};

// ═══════════════════════════════════════════════════════
// نگاشت exam_kind ← process_code
// ═══════════════════════════════════════════════════════
export const EXAM_KIND_PROCESS_MAP = {
  pre_employment:  'BR-HS-10-01',
  periodic:        'BR-HS-10-02',
  return_to_work:  'BR-HS-10-03',
  job_change:      'BR-HS-10-04'
};

export function resolveProcessCode(formCode, examExtra) {
  const form = FORMS[formCode];
  if (!form) return null;
  // فرم‌های ۴۸ تا ۵۰ بسته به exam_kind
  if (['BR-FR-HS-48-00','BR-FR-HS-49-00','BR-FR-HS-50-00'].includes(formCode)) {
    const kind = examExtra?.exam_kind;
    if (kind && EXAM_KIND_PROCESS_MAP[kind]) return EXAM_KIND_PROCESS_MAP[kind];
    return 'BR-HS-10-02';
  }
  return form.processCode || null;
}

// ═══════════════════════════════════════════════════════
// لیست فرم‌های پیاده‌شده
// ═══════════════════════════════════════════════════════
export function listForms() {
  return Object.values(FORMS).map(f => ({
    code: f.code,
    title: f.title,
    processCode: f.processCode,
    source: f.source
  }));
}