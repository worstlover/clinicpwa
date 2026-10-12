// js/modules/visit/state.js
import { sb } from '../../sb.js';
import { $ } from '../../utils.js';

export const state = {
  view: 'list',
  filter: 'pending',
  visits: [],
  visit: null,
  userMap: {},
  patientId: null,
  patientName: '',
  step: 1,
  maxStep: 1,
  isIncident: false,
  incidentType: 'none',
  selectedInjuries: [],
  items: [],
  reasons: [],
  treatments: [],
  incidentLocations: [],
  injuryLocations: [],
  quickDrugs: [],
  drugPrefs: { order: [], hidden: [] },
  editDrugMode: false,
  formData: {
    reasonId: null, reasonText: '',
    incidentLocation: '', incidentDesc: '',
    date: '', gcsE: '', gcsV: '', gcsM: '',
    hr: '', spo2: '', bp: '', temp: '', height: '', weight: '', sugar: '',
    treatmentId: '', ecg: '', notes: '',
    dispatchTime: '', dispatchDest: ''
  }
};

export const INJURY_MAP = {};

// ═══════════════════════════════════════════════════════
// ذخیره/بازیابی فرم
// ═══════════════════════════════════════════════════════
export function saveFormState() {
  const fd = state.formData;
  const map = {
    'vReasonSearch': 'reasonText', 'vIncidentLocation': 'incidentLocation',
    'vIncidentDesc': 'incidentDesc', 'vDate': 'date',
    'vGcsE': 'gcsE', 'vGcsV': 'gcsV', 'vGcsM': 'gcsM',
    'vHR': 'hr', 'vSpo2': 'spo2', 'vBP': 'bp',
    'vTemp': 'temp', 'vHeight': 'height', 'vWeight': 'weight', 'vSugar': 'sugar',
    'vTreatment': 'treatmentId', 'vECG': 'ecg', 'vNotes': 'notes',
    'vDispatchTime': 'dispatchTime', 'vDispatchDest': 'dispatchDest'
  };
  Object.entries(map).forEach(([id, key]) => {
    const el = $(id);
    if (el) fd[key] = el.value;
  });
}

export function resetFormData() {
  state.formData = {
    reasonId: null, reasonText: '', incidentLocation: '', incidentDesc: '',
    date: '', gcsE: '', gcsV: '', gcsM: '', hr: '', spo2: '', bp: '',
    temp: '', height: '', weight: '', sugar: '', treatmentId: '',
    ecg: '', notes: '', dispatchTime: '', dispatchDest: ''
  };
}

// ═══════════════════════════════════════════════════════
// بارگذاری داده‌های مرجع
// ═══════════════════════════════════════════════════════
export async function loadRefs() {
  const [r, t, il, inj, qd] = await Promise.all([
    sb.from('visits_reasonforvisit').select('id, name').eq('is_active', true).order('name'),
    sb.from('visits_treatmentresult').select('id, name').eq('is_active', true).order('name'),
    sb.from('visits_incidentlocation').select('id, name').eq('is_active', true).order('name').limit(200),
    sb.from('visits_injurylocation').select('id, name, svg_key, view_type').eq('is_active', true),
    sb.from('visits_visititem')
      .select('drug_id, drug:drugs_drug(id, name, form)')
      .order('id', { ascending: false }).limit(500)
  ]);

  state.reasons = r.data || [];
  state.treatments = t.data || [];
  state.incidentLocations = il.data || [];
  state.injuryLocations = inj.data || [];
  state.drugPrefs = { order: [], hidden: [] };

  const counts = {};
  (qd.data || []).forEach(item => {
    const d = item.drug;
    if (!d) return;
    if (!counts[d.id]) {
      counts[d.id] = {
        id: d.id, name: d.name, form: d.form,
        count: 0,
        icon: _getIcon(d.form)
      };
    }
    counts[d.id].count++;
  });
  state.quickDrugs = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 15);

  Object.keys(INJURY_MAP).forEach(k => delete INJURY_MAP[k]);
  state.injuryLocations.forEach(loc => {
    if (loc.svg_key) INJURY_MAP[loc.svg_key] = { id: loc.id, name: loc.name };
  });
}

// این تابع فقط برای جلوگیری از circular import است
function _getIcon(form) {
  if (!form) return '💊';
  const f = String(form).toLowerCase();
  if (f.includes('آمپول') || f.includes('ویال') || f.includes('سرنگ')) return '💉';
  if (f.includes('شربت') || f.includes('سوسپانسیون')) return '🧪';
  if (f.includes('قطره') || f.includes('سرم')) return '💧';
  if (f.includes('پماد') || f.includes('کرم') || f.includes('ژل')) return '🧴';
  if (f.includes('اسپری')) return '💨';
  return '💊';
}

// ═══════════════════════════════════════════════════════
// GCS / BMI
// ═══════════════════════════════════════════════════════
export function calcGCS() {
  const e = parseInt($('vGcsE')?.value) || 0;
  const v = parseInt($('vGcsV')?.value) || 0;
  const m = parseInt($('vGcsM')?.value) || 0;
  const t = $('vGcsTotal');
  if (t) t.textContent = (e && v && m) ? String(e + v + m).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]) : '---';
}

export function calcBMI() {
  const h = parseFloat($('vHeight')?.value) / 100;
  const w = parseFloat($('vWeight')?.value);
  const b = $('vBmi');
  if (b) b.textContent = (h > 0 && w > 0) ? (w / (h * h)).toFixed(1).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]) : '---';
}

export function loadUserMapFromVisits() {
  const ids = new Set();
  state.visits.forEach(v => {
    if (v.doctor_id) ids.add(v.doctor_id);
    if (v.assigned_to_id) ids.add(v.assigned_to_id);
  });
  if (!ids.size) { state.userMap = {}; return Promise.resolve(); }
  return sb.from('auth_user')
    .select('id, first_name, last_name, username')
    .in('id', Array.from(ids))
    .then(({ data }) => {
      state.userMap = {};
      (data || []).forEach(u => {
        state.userMap[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
      });
    })
    .catch(() => { state.userMap = {}; });
}
