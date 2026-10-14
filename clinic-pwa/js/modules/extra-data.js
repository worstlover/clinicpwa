// js/modules/extra-data.js
// ═══════════════════════════════════════════════════════
// ماژول مشترک اطلاعات تکمیلی (patient_extra / visit_extra / exam_extra)
// همه‌ی توابع async هستند و در خطا { data, error } برمی‌گردانند.
// ═══════════════════════════════════════════════════════
import { sb } from '../sb.js';

export const REQUIRED_EXTRA_FIELDS = [];

const TABLES = {
  patient: 'patient_extra',
  visit:   'visit_extra',
  exam:    'exam_extra'
};

async function getUserEmail() {
  try {
    const { data } = await sb.auth.getUser();
    return data?.user?.email || null;
  } catch {
    return null;
  }
}

function cleanPartial(partial) {
  const out = {};
  for (const [k, v] of Object.entries(partial || {})) {
    if (v === undefined) continue;
    if (v === '') continue; // مقدار خالی، مقدار قبلی را بازنویسی نکند
    out[k] = v;
  }
  return out;
}

async function upsertExtra(table, idCol, idVal, partial) {
  const payload = cleanPartial(partial);
  if (Object.keys(payload).length === 0) return { data: null, error: null };

  payload[idCol] = idVal;
  payload.updated_at = new Date().toISOString();
  payload.updated_by_email = await getUserEmail();

  const { data, error } = await sb
    .from(table)
    .upsert(payload, { onConflict: idCol })
    .select()
    .single();

  return { data, error };
}

export async function loadPatientExtra(patientId) {
  const { data, error } = await sb
    .from(TABLES.patient)
    .select('*')
    .eq('patient_id', patientId)
    .maybeSingle();
  return { data, error };
}

export async function savePatientExtra(patientId, partial) {
  return upsertExtra(TABLES.patient, 'patient_id', patientId, partial);
}

export async function loadVisitExtra(visitId) {
  const { data, error } = await sb
    .from(TABLES.visit)
    .select('*')
    .eq('visit_id', visitId)
    .maybeSingle();
  return { data, error };
}

export async function saveVisitExtra(visitId, partial) {
  return upsertExtra(TABLES.visit, 'visit_id', visitId, partial);
}

export async function loadExamExtra(examId) {
  const { data, error } = await sb
    .from(TABLES.exam)
    .select('*')
    .eq('exam_id', examId)
    .maybeSingle();
  return { data, error };
}

export async function saveExamExtra(examId, partial) {
  return upsertExtra(TABLES.exam, 'exam_id', examId, partial);
}

export function validateExtra(fields) {
  if (!Array.isArray(REQUIRED_EXTRA_FIELDS) || REQUIRED_EXTRA_FIELDS.length === 0) {
    return true;
  }
  return REQUIRED_EXTRA_FIELDS.every((key) => {
    const v = fields?.[key];
    return v !== undefined && v !== null && v !== '';
  });
}

export function timeToIso(hhmm, baseDate = new Date()) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;

  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;

  const d = new Date(baseDate);
  d.setHours(h, min, 0, 0);
  return d.toISOString();
}
