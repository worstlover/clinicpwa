// js/forms/registry.js
// ═══════════════════════════════════════════════════════
// ثبت همه‌ی فرم‌ها. هر فرم: { code, title, processCode, source, load(ctx), render(data), fields, saveArchive? }
// ═══════════════════════════════════════════════════════

import { render as render48, load as load48, fields as fields48 } from './templates/form48.js';
import { render as render49, load as load49, fields as fields49 } from './templates/form49.js';
import { render as render50, load as load50, fields as fields50 } from './templates/form50.js';

import { render as render34, load as load34, fields as fields34 } from './templates/form34.js';
import { render as render36, load as load36, fields as fields36 } from './templates/form36.js';
import { render as render37, load as load37, fields as fields37 } from './templates/form37.js';
import { render as render38, load as load38, fields as fields38, saveArchive as save38 } from './templates/form38.js';
import { render as render39, load as load39, fields as fields39 } from './templates/form39.js';

// فرم جدید HS-07
import { render as renderHS07, load as loadHS07, fields as fieldsHS07 } from './templates/hs07.js';

export const FORMS = {

  // ═══════════════════════════════════════════════════════
  // فرم اخطار کتبی و جریمه HSE
  // ═══════════════════════════════════════════════════════
  'BR-FR-HS-07-00': {
    code: 'BR-FR-HS-07-00',
    title: 'فرم اخطار کتبی و جریمه HSE',
    processCode: null,
    source: 'none',
    load: loadHS07,
    render: renderHS07,
    fields: fieldsHS07
  },

  // ═══════════════════════════════════════════════════════
  // فرم‌های طب کار (source: exam)
  // ═══════════════════════════════════════════════════════
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
  },

  // ═══════════════════════════════════════════════════════
  // فرم‌های ویزیت (source: visit)
  // ═══════════════════════════════════════════════════════
  'BR-FR-HS-34-00': {
    code: 'BR-FR-HS-34-00',
    title: 'فرم بستری موقت مراجعه کننده',
    processCode: 'BR-HS-07-01',
    source: 'visit',
    load: load34,
    render: render34,
    fields: fields34
  },
  'BR-FR-HS-36-00': {
    code: 'BR-FR-HS-36-00',
    title: 'فرم گزارش مراجعات حوادث ناشی از کار به بهداری',
    processCode: 'BR-HS-07-01',
    source: 'visit',
    load: load36,
    render: render36,
    fields: fields36
  },
  'BR-FR-HS-37-00': {
    code: 'BR-FR-HS-37-00',
    title: 'فرم اعزام / ارجاع به مرکز درمانی',
    processCode: 'BR-HS-07-01',
    source: 'visit',
    load: load37,
    render: render37,
    fields: fields37
  },

  // ═══════════════════════════════════════════════════════
  // فرم شیفت (source: shift)
  // ═══════════════════════════════════════════════════════
  'BR-FR-HS-38-00': {
    code: 'BR-FR-HS-38-00',
    title: 'فرم گزارش شیفت بهداری',
    processCode: 'BR-HS-07-01',
    source: 'shift',
    load: load38,
    render: render38,
    fields: fields38,
    saveArchive: save38
  },

  // ═══════════════════════════════════════════════════════
  // فرم بدون منبع (source: none)
  // ═══════════════════════════════════════════════════════
  'BR-FR-HS-39-00': {
    code: 'BR-FR-HS-39-00',
    title: 'فرم تحویل Safety box / پسماند عفونی به بیمارستان',
    processCode: 'BR-HS-07-01',
    source: 'none',
    load: load39,
    render: render39,
    fields: fields39
  }
};

// ═══════════════════════════════════════════════════════
// نگاشت exam_kind ← process_code (فقط فرم‌های طب کار)
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

  if (['BR-FR-HS-48-00', 'BR-FR-HS-49-00', 'BR-FR-HS-50-00'].includes(formCode)) {
    const kind = examExtra?.exam_kind;
    if (kind && EXAM_KIND_PROCESS_MAP[kind]) return EXAM_KIND_PROCESS_MAP[kind];
    return 'BR-HS-10-02';
  }
  return form.processCode || null;
}

// ═══════════════════════════════════════════════════════
// لیست فرم‌ها
// ═══════════════════════════════════════════════════════
export function listForms() {
  return Object.values(FORMS).map(f => ({
    code: f.code,
    title: f.title,
    processCode: f.processCode,
    source: f.source
  }));
}