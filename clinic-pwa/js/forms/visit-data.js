// js/forms/visit-data.js
// ═══════════════════════════════════════════════════════
// ماژول مشترک بارگذاری ویزیت برای فرم‌های ۳۴، ۳۶، ۳۷
// ═══════════════════════════════════════════════════════
import { sb } from '../sb.js';
import jalaali from '../../lib/jalaali.js';
import { loadVisitExtra, loadPatientExtra } from '../modules/extra-data.js';

export const TREATMENT_DISPATCH = 4;   // اعزام به بیمارستان (MTC)
export const TREATMENT_REFERRAL = 6;   // ارجاع به بیمارستان

export function isDispatchTreatment(id) { return Number(id) === TREATMENT_DISPATCH; }
export function isReferralTreatment(id) { return Number(id) === TREATMENT_REFERRAL; }
export function isDispatchedOrReferred(id) {
  return isDispatchTreatment(id) || isReferralTreatment(id);
}

export function isIncidentVisit(v) {
  if (!v) return false;
  const t = String(v.incident_type || '').trim().toLowerCase();
  if (t && t !== 'none') return true;
  return v.is_incident === true;
}

// ─── تبدیل زمان به وقت تهران ───
export function toTehranParts(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d)) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tehran',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d);
    const o = {};
    parts.forEach(p => { o[p.type] = p.value; });
    const hour = o.hour === '24' ? '00' : o.hour;
    return {
      year: Number(o.year), month: Number(o.month), day: Number(o.day),
      hour: Number(hour), minute: Number(o.minute),
      dateISO: `${o.year}-${o.month}-${o.day}`,
      timeHM: `${String(hour).padStart(2,'0')}:${String(o.minute).padStart(2,'0')}`
    };
  } catch { return null; }
}

export function formatTehranTime(iso) {
  const p = toTehranParts(iso);
  return p ? p.timeHM : '';
}

export function tehranJalali(iso) {
  const p = toTehranParts(iso);
  if (!p) return '';
  try {
    const j = jalaali.toJalaali(p.year, p.month, p.day);
    return `${j.jy}/${String(j.jm).padStart(2,'0')}/${String(j.jd).padStart(2,'0')}`;
  } catch { return ''; }
}

// ─── کمکی‌های ساخت متن ───
export function buildSummaryText(data) {
  const parts = [];
  if (data.reason?.name) parts.push(`علت: ${data.reason.name}`);
  if (data.visit?.notes) parts.push(data.visit.notes);
  if (data.visit?.incident_description) parts.push(`شرح حادثه: ${data.visit.incident_description}`);
  if (data.items?.length) {
    parts.push(`اقدامات/داروها: ${data.items.map(i => `${i.name} × ${i.quantity}`).join('، ')}`);
  }
  return parts.join(' | ');
}

export function buildMedicalHistoryText(data) {
  const parts = [];
  if (data.lastExam) {
    const jd = tehranJalali(data.lastExam.exam_date);
    const op = data.lastExam.final_opinion_text || '—';
    const cond = data.lastExam.final_opinion_conditions || '';
    let s = `آخرین معاینه ${jd}: ${op}`;
    if (cond) s += `؛ شرایط: ${cond}`;
    parts.push(s);
  }
  if (data.patient?.medical_history) parts.push(`سابقه پزشکی: ${data.patient.medical_history}`);
  if (data.patient?.allergies) parts.push(`حساسیت‌ها: ${data.patient.allergies}`);
  return parts.join(' | ');
}

export function buildVitalsSummary(data) {
  const v = data.visit || {};
  const e = data.extra || {};
  const parts = [];
  if (v.blood_pressure) parts.push(`BP: ${v.blood_pressure}`);
  if (v.heart_rate) parts.push(`PR: ${v.heart_rate}`);
  if (e.rr) parts.push(`RR: ${e.rr}`);
  if (v.temperature) parts.push(`Tem: ${v.temperature}`);
  if (v.spo2) parts.push(`SPO₂: ${v.spo2}`);
  return parts.join(' — ') || '—';
}

// ─── بارگذاری کامل ───
export async function loadVisitFull(visitId) {
  const { data: v, error: e1 } = await sb.from('visits_visit').select(`
    *,
    patient:core_patient(
      id, first_name, last_name, father_name, national_code, passport_number,
      is_foreign_national, personnel_number, phone_number, occupation,
      date_of_birth, medical_history, allergies, gender, company_id,
      company:core_company(name)
    ),
    reason:visits_reasonforvisit(id, name),
    result:visits_treatmentresult(id, name),
    incident_location:visits_incidentlocation(id, name)
  `).eq('id', visitId).maybeSingle();

  if (e1) throw e1;
  if (!v) throw new Error('ویزیت یافت نشد');

  const [items, injuries, extra, pe, doctor, lastExam] = await Promise.all([
    sb.from('visits_visititem')
      .select('quantity, notes, drug:drugs_drug(id, name)')
      .eq('visit_id', visitId),
    sb.from('visits_visit_injury_locations')
      .select('loc:visits_injurylocation(id, name, svg_key)')
      .eq('visit_id', visitId),
    loadVisitExtra(visitId).catch(() => ({ data: null })),
    v.patient?.id
      ? loadPatientExtra(v.patient.id).catch(() => ({ data: null }))
      : Promise.resolve({ data: null }),
    v.doctor_id
      ? sb.from('auth_user')
          .select('id, first_name, last_name, username')
          .eq('id', v.doctor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    v.patient?.id
      ? sb.from('lab_results_periodicexamination')
          .select('id, exam_date, final_opinion_text, final_opinion_conditions')
          .eq('patient_id', v.patient.id)
          .order('exam_date', { ascending: false })
          .limit(1).maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  const doctorName = doctor?.data
    ? (`${doctor.data.first_name || ''} ${doctor.data.last_name || ''}`.trim() || doctor.data.username || '')
    : '';

  return {
    visit: v,
    patient: v.patient || {},
    company: v.patient?.company || {},
    reason: v.reason || {},
    result: v.result || {},
    incidentLocation: v.incident_location || {},
    items: (items.data || []).map(x => ({
      name: x.drug?.name || '',
      quantity: x.quantity,
      notes: x.notes
    })),
    injuries: (injuries.data || []).map(x => x.loc?.name).filter(Boolean),
    extra: extra?.data || {},
    patientExtra: pe?.data || {},
    doctorName,
    lastExam: lastExam?.data || null,
    isIncident: isIncidentVisit(v),
    isDispatch: isDispatchTreatment(v.treatment_result_id),
    isReferral: isReferralTreatment(v.treatment_result_id),
    isCompleted: v.status === 'completed'
  };
}

export function computeAge(dob) {
  if (!dob) return '';
  try {
    const d = new Date(dob);
    if (isNaN(d)) return '';
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age > 0 ? String(age) : '';
  } catch { return ''; }
}
