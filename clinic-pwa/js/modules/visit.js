// js/modules/visit.js
import { sb } from '../sb.js';
import { $, faNum, escapeHtml, gregorianToJalali, jalaliToGregorian, todayJalali, toast, beep } from '../utils.js';
import { showScreen } from '../ui.js';
import { currentUser } from '../auth.js';

// ═══════════════════════════════════════════════════════
// وضعیت
// ═══════════════════════════════════════════════════════
const state = {
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

const INJURY_MAP = {};

// ═══════════════════════════════════════════════════════
// ⭐ گرفتن ID جنگو کاربر فعلی
// ═══════════════════════════════════════════════════════
function getMyDjangoId() {
  return currentUser?.user_metadata?.django_user_id || null;
}

function isSuperuser() {
  return currentUser?.user_metadata?.is_superuser === true
    || currentUser?.user_metadata?.is_superuser === 'true';
}

function isSafetyOrSupervisor() {
  const groups = currentUser?.user_metadata?.groups || [];
  if (Array.isArray(groups)) {
    return groups.some(g => ['safety', 'Supervisor', 'ایمنی', 'سوپروایزر'].includes(g));
  }
  return false;
}

// ═══════════════════════════════════════════════════════
// ورود
// ═══════════════════════════════════════════════════════
export function openVisits() {
  showScreen('Visit');
  state.view = 'list';
  renderList();
}

// ═══════════════════════════════════════════════════════
// لیست ویزیت‌ها
// ═══════════════════════════════════════════════════════
async function renderList() {
  const c = $('visitContent');
  c.innerHTML = `
    <div class="filter-pills">
      <button class="filter-pill ${state.filter === 'pending' ? 'active' : ''}" data-filter="pending">
        <i class="bi bi-hourglass-split"></i> در انتظار
      </button>
      <button class="filter-pill ${state.filter === 'referred' ? 'active' : ''}" data-filter="referred">
        <i class="bi bi-arrow-left-right"></i> ارجاعی
      </button>
      <button class="filter-pill ${state.filter === 'completed' ? 'active' : ''}" data-filter="completed">
        <i class="bi bi-check-circle"></i> تکمیل
      </button>
    </div>

    <button class="btn btn-primary w-100 py-3 mb-3" id="btnNewVisit">
      <i class="bi bi-plus-circle-fill"></i> ثبت ویزیت جدید
    </button>

    <div id="visitList">
      <div class="text-center py-5"><div class="spinner-border text-primary"></div></div>
    </div>
  `;

  c.querySelectorAll('[data-filter]').forEach(b => {
    b.onclick = () => { state.filter = b.dataset.filter; renderList(); };
  });

  $('btnNewVisit').onclick = () => openCreate();

  try {
    const myId = getMyDjangoId();
    const superuser = isSuperuser();

    let q = sb.from('visits_visit').select(`
      id, visit_date, status, is_incident, incident_type,
      blood_pressure, heart_rate,
      doctor_id, assigned_to_id,
      patient:core_patient(id, first_name, last_name, national_code, personnel_number),
      reason:visits_reasonforvisit(name),
      result:visits_treatmentresult(name)
    `).order('visit_date', { ascending: false }).limit(150);

    // ⭐ فیلتر: فقط ویزیت‌های من (ایجاد کننده یا مسئول فعلی)
    // سوپریوزر همه را می‌بیند
    if (!superuser && myId) {
      q = q.or(`doctor_id.eq.${myId},assigned_to_id.eq.${myId}`);
    }

    if (state.filter === 'completed') q = q.eq('status', 'completed');
    else if (state.filter === 'referred') q = q.eq('status', 'referred');
    else q = q.in('status', ['pending', 'referred']);

    const { data, error } = await q;
    if (error) throw error;
    state.visits = data || [];

    // ⭐ لود کردن نام کاربران (doctor + assigned_to)
    await loadUserMap();

    const list = $('visitList');
    if (!state.visits.length) {
      list.innerHTML = `
        <div class="card text-center py-5 muted">
          <i class="bi bi-inbox" style="font-size:2.5rem;opacity:0.5;"></i>
          <div class="mt-2">ویزیتی برای شما یافت نشد</div>
          <small style="opacity:0.7;">فقط ویزیت‌های ایجاد شده توسط شما یا ارجاع شده به شما نمایش داده می‌شوند</small>
        </div>`;
      return;
    }

    list.innerHTML = state.visits.map(v => {
      const p = v.patient || {};
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || '—';
      const jd = gregorianToJalali(v.visit_date);
      const timeStr = getTimeStr(v.visit_date);
      const isInc = v.is_incident && v.incident_type !== 'none';
      const cls = v.status === 'completed' ? 'completed' : (v.status === 'referred' ? 'referred' : (isInc ? 'incident' : ''));

      const doctorName = getUserName(v.doctor_id);
      const assigneeName = getUserName(v.assigned_to_id);
      const isMine = v.assigned_to_id === getMyDjangoId();

      return `
        <div class="visit-card ${cls}" data-visit-id="${v.id}">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1">
              <div class="visit-name">
                ${escapeHtml(name)}
                ${isInc ? `<span class="badge-soft danger" style="font-size:0.6rem;">${getIncLabel(v.incident_type)}</span>` : ''}
                ${isMine && v.status !== 'completed' ? `<span class="badge-soft primary" style="font-size:0.6rem;">مسئول من</span>` : ''}
              </div>
              <div class="visit-meta">
                <i class="bi bi-calendar3"></i> ${jd} - ${timeStr}
                ${v.reason?.name ? ` | ${escapeHtml(v.reason.name)}` : ''}
              </div>
              <div class="visit-meta">
                ${p.national_code ? `<span dir="ltr">${escapeHtml(p.national_code)}</span>` : ''}
                ${v.blood_pressure ? ` | <i class="bi bi-droplet"></i> ${escapeHtml(v.blood_pressure)}` : ''}
                ${v.heart_rate ? ` | <i class="bi bi-heart-pulse"></i> ${faNum(v.heart_rate)}` : ''}
              </div>
              <div class="visit-meta" style="border-top:1px dashed #e2e8f0;padding-top:5px;margin-top:5px;">
                <i class="bi bi-pencil-square"></i> ثبت: <strong>${escapeHtml(doctorName)}</strong>
                ${v.doctor_id !== v.assigned_to_id 
                  ? ` | <i class="bi bi-person-check"></i> مسئول: <strong>${escapeHtml(assigneeName)}</strong>` 
                  : ''}
              </div>
            </div>
            <i class="bi bi-chevron-left" style="font-size:1.5rem;color:#94a3b8;"></i>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-visit-id]').forEach(el => {
      el.onclick = () => openDetail(parseInt(el.dataset.visitId));
    });

  } catch (e) {
    console.error(e);
    $('visitList').innerHTML = `<div class="alert alert-danger">خطا: ${escapeHtml(e.message)}</div>`;
  }
}

function getTimeStr(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  } catch (e) { return ''; }
}

async function loadUserMap() {
  const ids = new Set();
  state.visits.forEach(v => {
    if (v.doctor_id) ids.add(v.doctor_id);
    if (v.assigned_to_id) ids.add(v.assigned_to_id);
  });
  if (!ids.size) { state.userMap = {}; return; }

  try {
    const { data } = await sb.from('auth_user')
      .select('id, first_name, last_name, username')
      .in('id', Array.from(ids));
    state.userMap = {};
    (data || []).forEach(u => {
      state.userMap[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
    });
  } catch (e) {
    console.warn('خطا در لود کاربران:', e);
    state.userMap = {};
  }
}

function getUserName(id) {
  if (!id) return '—';
  return state.userMap[id] || `کاربر #${id}`;
}

function getIncLabel(type) {
  return { near_miss: 'شبه حادثه', minor: 'حادثه جزئی', major: 'حادثه ماژور' }[type] || 'حادثه';
}

// ═══════════════════════════════════════════════════════
// بارگذاری داده‌های مرجع
// ═══════════════════════════════════════════════════════
async function loadRefs() {
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
    if (!counts[d.id]) counts[d.id] = { id: d.id, name: d.name, form: d.form, count: 0, icon: getIcon(d.form) };
    counts[d.id].count++;
  });
  state.quickDrugs = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 15);

  Object.keys(INJURY_MAP).forEach(k => delete INJURY_MAP[k]);
  state.injuryLocations.forEach(loc => {
    if (loc.svg_key) INJURY_MAP[loc.svg_key] = { id: loc.id, name: loc.name };
  });
}

function getIcon(form) {
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
// ذخیره و بازیابی مقادیر فرم
// ═══════════════════════════════════════════════════════
function saveFormState() {
  const fd = state.formData;
  const map = {
    'vReasonSearch': 'reasonText',
    'vIncidentLocation': 'incidentLocation',
    'vIncidentDesc': 'incidentDesc',
    'vDate': 'date',
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

function resetFormData() {
  state.formData = {
    reasonId: null, reasonText: '',
    incidentLocation: '', incidentDesc: '',
    date: '', gcsE: '', gcsV: '', gcsM: '',
    hr: '', spo2: '', bp: '', temp: '', height: '', weight: '', sugar: '',
    treatmentId: '', ecg: '', notes: '',
    dispatchTime: '', dispatchDest: ''
  };
}

// ═══════════════════════════════════════════════════════
// Wizard
// ═══════════════════════════════════════════════════════
async function openCreate() {
  state.view = 'create';
  state.step = 1; state.maxStep = 1;
  state.patientId = null; state.patientName = '';
  state.isIncident = false; state.incidentType = 'none';
  state.selectedInjuries = []; state.items = [];
  resetFormData();
  state.formData.date = `${todayJalali()} 12:00`;

  const c = $('visitContent');
  c.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
  await loadRefs();
  renderWizard();
}

function renderWizard() {
  saveFormState();
  const c = $('visitContent');
  const fd = state.formData;
  const steps = [
    { n: 1, label: 'بیمار' }, { n: 2, label: 'علت و حادثه' },
    { n: 3, label: 'مصدومیت' }, { n: 4, label: 'علائم حیاتی' },
    { n: 5, label: 'داروها' }, { n: 6, label: 'تشخیص' }
  ];

  c.innerHTML = `
    <div class="card"><div class="card-body">
      <div class="wizard-steps">
        ${steps.map(s => `
          <div class="wizard-step ${state.step === s.n ? 'active' : ''} ${s.n < state.step ? 'completed' : ''}" data-step="${s.n}">
            <div class="wizard-step-circle">${s.n < state.step ? '✓' : s.n}</div>
            <div class="wizard-step-label">${s.label}</div>
          </div>
        `).join('')}
      </div>
    </div></div>

    <div class="wizard-panel ${state.step === 1 ? 'active' : ''}">
      <div class="card">
        <div class="card-head"><i class="bi bi-person-badge"></i> مرحله ۱: انتخاب بیمار</div>
        <div class="card-body">
          <div id="vPatientBox" class="${state.patientId ? 'hidden' : ''}">
            <input type="text" class="form-control mb-2" id="vPatientSearch" placeholder="نام، کد ملی، پرسنلی..." autocomplete="off">
            <div id="vPatientResults" style="max-height:400px;overflow-y:auto;"></div>
          </div>
          <div id="vPatientSelected" class="${state.patientId ? '' : 'hidden'}">
            <div class="badge-soft success" style="display:flex;align-items:center;gap:10px;padding:12px;">
              <i class="bi bi-person-check-fill" style="font-size:1.3rem;"></i>
              <div style="flex:1;"><div style="font-weight:700;">${escapeHtml(state.patientName || '—')}</div></div>
              <button style="background:none;border:none;color:#dc3545;font-size:1.2rem;font-weight:700;" id="vPatientClear">✕</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="wizard-panel ${state.step === 2 ? 'active' : ''}">
      <div class="card">
        <div class="card-head"><i class="bi bi-clipboard-pulse"></i> مرحله ۲: علت و حادثه</div>
        <div class="card-body">
          <div class="mb-3">
            <label class="form-label">علت مراجعه *</label>
            <div id="vReasonBox" class="${fd.reasonId ? 'hidden' : ''}">
              <input type="text" class="form-control" id="vReasonSearch"
                placeholder="نام علت را تایپ کنید..." autocomplete="off" value="${escapeHtml(fd.reasonText || '')}">
              <div id="vReasonResults" style="max-height:280px;overflow-y:auto;margin-top:8px;"></div>
            </div>
            <div id="vReasonSelected" class="${fd.reasonId ? '' : 'hidden'}">
              <div class="badge-soft success" style="display:flex;align-items:center;gap:10px;padding:12px;">
                <i class="bi bi-check-circle-fill" style="font-size:1.2rem;"></i>
                <div style="flex:1;font-weight:700;">${escapeHtml(fd.reasonText || '—')}</div>
                <button style="background:none;border:none;color:#dc3545;font-size:1.2rem;font-weight:700;" id="vReasonClear">✕</button>
              </div>
            </div>
          </div>

          <h6 class="mb-3" style="font-weight:700;">آیا مورد حادثه است؟</h6>
          <div class="row g-3">
            <div class="col-6">
              <div class="incident-card ${!state.isIncident && state.maxStep >= 2 ? 'selected-no' : ''}" data-incident="no">
                <div class="icon-big">✅</div>
                <div class="title-big" style="color:var(--success);">بدون حادثه</div>
                <div class="subtitle-big">مراجعه عادی</div>
              </div>
            </div>
            <div class="col-6">
              <div class="incident-card ${state.isIncident ? 'selected-yes' : ''}" data-incident="yes">
                <div class="icon-big">⚠️</div>
                <div class="title-big" style="color:var(--warning);">حادثه</div>
                <div class="subtitle-big">شبه‌حادثه / جزئی / ماژور</div>
              </div>
            </div>
          </div>

          <div id="vIncidentTypeSection" class="mt-4 ${state.isIncident ? '' : 'hidden'}">
            <label class="form-label">نوع حادثه:</label>
            <label class="incident-type-radio ${state.incidentType === 'near_miss' ? 'active' : ''}">
              <input type="radio" name="incType" value="near_miss" ${state.incidentType === 'near_miss' ? 'checked' : ''}> 🔵 شبه حادثه
            </label>
            <label class="incident-type-radio ${state.incidentType === 'minor' ? 'active' : ''}">
              <input type="radio" name="incType" value="minor" ${state.incidentType === 'minor' ? 'checked' : ''}> 🟡 حادثه جزئی
            </label>
            <label class="incident-type-radio ${state.incidentType === 'major' ? 'active' : ''}">
              <input type="radio" name="incType" value="major" ${state.incidentType === 'major' ? 'checked' : ''}> 🔴 حادثه ماژور
            </label>
          </div>
        </div>
      </div>
    </div>

    <div class="wizard-panel ${state.step === 3 ? 'active' : ''}">
      <div class="card">
        <div class="card-head danger"><i class="bi bi-body-text"></i> مرحله ۳: محل حادثه و مصدومیت</div>
        <div class="card-body">
          <div class="mb-3">
            <label class="form-label">محل حادثه *</label>
            <input type="text" class="form-control" id="vIncidentLocation" list="vIncidentList"
              value="${escapeHtml(fd.incidentLocation || '')}" placeholder="تایپ یا انتخاب کن...">
            <datalist id="vIncidentList">
              ${state.incidentLocations.map(l => `<option value="${escapeHtml(l.name)}">`).join('')}
            </datalist>
          </div>
          <div class="mb-3">
            <label class="form-label">شرح حادثه</label>
            <textarea class="form-control" id="vIncidentDesc" rows="2">${escapeHtml(fd.incidentDesc || '')}</textarea>
          </div>
          <label class="form-label d-block mb-2">محل‌های مصدومیت (روی ادمک بزن):</label>
          ${renderBodyMap()}
          <div class="selected-parts-list" id="vInjuryList">
            ${state.selectedInjuries.length ? state.selectedInjuries.map(i => `
              <span class="part-tag">${escapeHtml(i.name)}<span class="remove-part" data-id="${i.id}">✕</span></span>
            `).join('') : '<span class="muted small">هیچ ناحیه‌ای انتخاب نشده</span>'}
          </div>
        </div>
      </div>
    </div>

    <div class="wizard-panel ${state.step === 4 ? 'active' : ''}">
      <div class="card">
        <div class="card-head warning"><i class="bi bi-heart-pulse"></i> مرحله ۴: تاریخ، GCS و علائم حیاتی</div>
        <div class="card-body">
          <div class="mb-3">
            <label class="form-label">تاریخ ویزیت (شمسی) *</label>
            <input type="text" class="form-control" id="vDate" value="${escapeHtml(fd.date || '')}" placeholder="1403/01/01 12:00" dir="ltr">
          </div>

          <h6 style="font-weight:700;margin:20px 0 10px;">🧠 GCS</h6>
          <div class="toggle-box" id="consciousToggle">
            <input type="checkbox" class="big-checkbox" id="consciousCheck">
            <label for="consciousCheck">بیمار هوشیار است (GCS = 15)</label>
          </div>

          <div class="row g-2 mb-4">
            <div class="col-6 col-md-3"><label class="form-label small">چشم (E)</label>
              <select class="form-select" id="vGcsE"><option value="">-</option>
                ${[1,2,3,4].map(n=>`<option value="${n}" ${fd.gcsE == n ? 'selected' : ''}>${n}</option>`).join('')}
              </select></div>
            <div class="col-6 col-md-3"><label class="form-label small">کلامی (V)</label>
              <select class="form-select" id="vGcsV"><option value="">-</option>
                ${[1,2,3,4,5].map(n=>`<option value="${n}" ${fd.gcsV == n ? 'selected' : ''}>${n}</option>`).join('')}
              </select></div>
            <div class="col-6 col-md-3"><label class="form-label small">حرکتی (M)</label>
              <select class="form-select" id="vGcsM"><option value="">-</option>
                ${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${fd.gcsM == n ? 'selected' : ''}>${n}</option>`).join('')}
              </select></div>
            <div class="col-6 col-md-3"><label class="form-label small">مجموع</label>
              <div class="form-control text-center fw-bold" id="vGcsTotal" style="background:#f0f8ff;color:var(--primary);font-size:1.1rem;">---</div></div>
          </div>

          <div class="toggle-box" id="vitalsToggle">
            <input type="checkbox" class="big-checkbox" id="vitalsCheck">
            <label for="vitalsCheck">همه علائم حیاتی نرمال است</label>
          </div>

          <div class="row g-2">
            <div class="col-6 col-md-3"><label class="form-label small">ضربان قلب</label>
              <input type="number" class="form-control text-center" id="vHR" value="${escapeHtml(fd.hr)}" inputmode="numeric">
              <small class="muted" style="font-size:0.65rem;">۶۰-۱۰۰</small></div>
            <div class="col-6 col-md-3"><label class="form-label small">SpO2 %</label>
              <input type="number" class="form-control text-center" id="vSpo2" value="${escapeHtml(fd.spo2)}" inputmode="numeric">
              <small class="muted" style="font-size:0.65rem;">۹۵-۱۰۰</small></div>
            <div class="col-6 col-md-3"><label class="form-label small">فشار خون</label>
              <input type="text" class="form-control text-center" id="vBP" value="${escapeHtml(fd.bp)}" placeholder="120/80" dir="ltr"></div>
            <div class="col-6 col-md-3"><label class="form-label small">دما °C</label>
              <input type="number" step="0.1" class="form-control text-center" id="vTemp" value="${escapeHtml(fd.temp)}" inputmode="decimal"></div>
            <div class="col-6 col-md-3"><label class="form-label small">قد (cm)</label>
              <input type="number" step="0.1" class="form-control text-center" id="vHeight" value="${escapeHtml(fd.height)}" inputmode="decimal"></div>
            <div class="col-6 col-md-3"><label class="form-label small">وزن (kg)</label>
              <input type="number" step="0.1" class="form-control text-center" id="vWeight" value="${escapeHtml(fd.weight)}" inputmode="decimal"></div>
            <div class="col-6 col-md-3"><label class="form-label small">قند خون</label>
              <input type="number" step="0.1" class="form-control text-center" id="vSugar" value="${escapeHtml(fd.sugar)}" inputmode="decimal"></div>
            <div class="col-6 col-md-3"><label class="form-label small">BMI</label>
              <div class="form-control text-center fw-bold" id="vBmi" style="background:#f0f8ff;">---</div></div>
          </div>
        </div>
      </div>
    </div>

    <div class="wizard-panel ${state.step === 5 ? 'active' : ''}">
      <div class="card">
        <div class="card-head success"><i class="bi bi-capsule"></i> مرحله ۵: داروها</div>
        <div class="card-body">
          <div class="quick-drug-wrapper">
            <div class="drug-edit-toolbar">
              <label>⚡ داروهای پرمصرف</label>
              <div>
                <button type="button" class="btn-edit-toggle" id="toggleEditDrugs">✏️ ویرایش</button>
                <button type="button" class="btn-edit-save" id="saveEditDrugs">💾 ذخیره</button>
              </div>
            </div>
            <div class="d-flex flex-wrap" id="quickDrugsList"></div>
          </div>
          <button class="btn btn-outline-success w-100 mb-3" id="vAddDrug">
            <i class="bi bi-plus-circle"></i> افزودن دارو
          </button>
          <div id="vItemsList"></div>
        </div>
      </div>
    </div>

    <div class="wizard-panel ${state.step === 6 ? 'active' : ''}">
      <div class="card">
        <div class="card-head"><i class="bi bi-journal-medical"></i> مرحله ۶: تشخیص و نتیجه</div>
        <div class="card-body">
          <div class="mb-3">
            <label class="form-label">نتیجه درمان *</label>
            <select class="form-select" id="vTreatment">
              <option value="">انتخاب کنید...</option>
              ${state.treatments.map(t => `<option value="${t.id}" ${fd.treatmentId == t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
            </select>
          </div>

          <div id="vDispatchSection" class="${fd.treatmentId && isDispatch(fd.treatmentId) ? '' : 'hidden'}">
            <div class="card" style="background:#fff7ed;border:2px solid #fed7aa;">
              <div class="card-body">
                <h6 style="color:#92400e;font-weight:700;margin-bottom:12px;">
                  <i class="bi bi-truck"></i> اطلاعات اعزام
                </h6>
                <div class="row g-2">
                  <div class="col-6"><label class="form-label small">ساعت اعزام</label>
                    <input type="time" class="form-control" id="vDispatchTime" value="${escapeHtml(fd.dispatchTime || '')}"></div>
                  <div class="col-6"><label class="form-label small">مقصد اعزام</label>
                    <input type="text" class="form-control" id="vDispatchDest" value="${escapeHtml(fd.dispatchDest || '')}" placeholder="نام بیمارستان"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="mb-3 mt-3"><label class="form-label">📈 تفسیر ECG</label>
            <textarea class="form-control" id="vECG" rows="2">${escapeHtml(fd.ecg || '')}</textarea></div>
          <div class="mb-3"><label class="form-label">📝 شرح حال و ملاحظات</label>
            <textarea class="form-control" id="vNotes" rows="3">${escapeHtml(fd.notes || '')}</textarea></div>
        </div>
      </div>
    </div>

    <div class="card"><div class="card-body">
      <div class="wizard-nav">
        <button class="btn btn-outline-secondary" id="btnPrev" ${state.step === 1 ? 'disabled' : ''}>
          <i class="bi bi-arrow-right"></i> قبل</button>
        <span class="step-indicator">مرحله ${faNum(state.step)} از ${faNum(6)}</span>
        <button class="btn btn-primary" id="btnNext" ${state.step === 6 ? 'style="display:none;"' : ''}>
          بعد <i class="bi bi-arrow-left"></i></button>
      </div>
      ${state.step === 6 ? `
        <button class="btn btn-success w-100 py-3 mt-3" id="vSave">
          <i class="bi bi-check-circle-fill"></i> ثبت نهایی ویزیت
        </button>
      ` : ''}
    </div></div>

    <div class="d-grid gap-2 mt-2 mb-5">
      <button class="btn btn-outline-secondary" id="btnCancelWizard">
        <i class="bi bi-x-circle"></i> انصراف</button>
    </div>

    <div class="fab-container ${state.step === 5 ? 'show' : ''}" id="vFab">
      <div class="fab-hint">افزودن دارو</div>
      <button class="fab-add-drug" id="vFabAdd">+</button>
    </div>
  `;

  bindWizard();
}

function isDispatch(treatmentId) {
  if (!treatmentId) return false;
  const t = state.treatments.find(x => String(x.id) === String(treatmentId));
  return t?.name?.includes('اعزام');
}

// ═══════════════════════════════════════════════════════
// Body Map
// ═══════════════════════════════════════════════════════
function renderBodyMap() {
  const sel = new Set(state.selectedInjuries.map(i => i.id));
  const cls = (key) => {
    const loc = INJURY_MAP[key];
    return loc && sel.has(loc.id) ? 'selected' : '';
  };

  return `
    <div class="body-map-container">
      <div class="body-map-wrap">
        <div class="body-map-title">روبرو</div>
        <div class="body-map">
          <svg viewBox="0 0 240 560" xmlns="http://www.w3.org/2000/svg">
            <ellipse class="body-part ${cls('head')}" data-part="head" cx="120" cy="45" rx="30" ry="35"/>
            <circle class="body-part ${cls('eye_left')}" data-part="eye_left" cx="130" cy="42" r="4"/>
            <circle class="body-part ${cls('eye_right')}" data-part="eye_right" cx="110" cy="42" r="4"/>
            <path class="body-part ${cls('nose')}" data-part="nose" d="M 120,45 L 116,55 L 124,55 Z"/>
            <ellipse class="body-part ${cls('lips')}" data-part="lips" cx="120" cy="63" rx="8" ry="4"/>
            <ellipse class="body-part ${cls('ear_left')}" data-part="ear_left" cx="152" cy="50" rx="5" ry="9"/>
            <ellipse class="body-part ${cls('ear_right')}" data-part="ear_right" cx="88" cy="50" rx="5" ry="9"/>
            <rect class="body-part ${cls('neck')}" data-part="neck" x="108" y="78" width="24" height="18" rx="4"/>
            <rect class="body-part ${cls('shoulder_left')}" data-part="shoulder_left" x="136" y="100" width="44" height="25" rx="10"/>
            <rect class="body-part ${cls('shoulder_right')}" data-part="shoulder_right" x="60" y="100" width="44" height="25" rx="10"/>
            <rect class="body-part ${cls('chest')}" data-part="chest" x="98" y="100" width="44" height="65" rx="8"/>
            <rect class="body-part ${cls('upper_arm_left')}" data-part="upper_arm_left" x="155" y="125" width="30" height="80" rx="12"/>
            <rect class="body-part ${cls('upper_arm_right')}" data-part="upper_arm_right" x="55" y="125" width="30" height="80" rx="12"/>
            <rect class="body-part ${cls('elbow_left')}" data-part="elbow_left" x="157" y="205" width="26" height="22" rx="8"/>
            <rect class="body-part ${cls('elbow_right')}" data-part="elbow_right" x="57" y="205" width="26" height="22" rx="8"/>
            <rect class="body-part ${cls('forearm_left')}" data-part="forearm_left" x="158" y="227" width="24" height="55" rx="8"/>
            <rect class="body-part ${cls('forearm_right')}" data-part="forearm_right" x="58" y="227" width="24" height="55" rx="8"/>
            <rect class="body-part ${cls('palm_left')}" data-part="palm_left" x="158" y="282" width="24" height="45" rx="6"/>
            <rect class="body-part ${cls('palm_right')}" data-part="palm_right" x="58" y="282" width="24" height="45" rx="6"/>
            <rect class="body-part ${cls('epigastrium')}" data-part="epigastrium" x="98" y="165" width="44" height="35" rx="6"/>
            <rect class="body-part ${cls('hypogastrium')}" data-part="hypogastrium" x="98" y="200" width="44" height="35" rx="6"/>
            <rect class="body-part ${cls('flank_left')}" data-part="flank_left" x="142" y="165" width="13" height="70" rx="5"/>
            <rect class="body-part ${cls('flank_right')}" data-part="flank_right" x="85" y="165" width="13" height="70" rx="5"/>
            <rect class="body-part ${cls('groin')}" data-part="groin" x="105" y="235" width="30" height="15" rx="5"/>
            <rect class="body-part ${cls('hip_left')}" data-part="hip_left" x="122" y="250" width="28" height="25" rx="8"/>
            <rect class="body-part ${cls('hip_right')}" data-part="hip_right" x="90" y="250" width="28" height="25" rx="8"/>
            <rect class="body-part ${cls('thigh_left')}" data-part="thigh_left" x="128" y="275" width="32" height="90" rx="12"/>
            <rect class="body-part ${cls('thigh_right')}" data-part="thigh_right" x="80" y="275" width="32" height="90" rx="12"/>
            <rect class="body-part ${cls('knee_left')}" data-part="knee_left" x="130" y="365" width="28" height="25" rx="8"/>
            <rect class="body-part ${cls('knee_right')}" data-part="knee_right" x="82" y="365" width="28" height="25" rx="8"/>
            <rect class="body-part ${cls('shin_left')}" data-part="shin_left" x="131" y="390" width="26" height="80" rx="8"/>
            <rect class="body-part ${cls('shin_right')}" data-part="shin_right" x="83" y="390" width="26" height="80" rx="8"/>
            <rect class="body-part ${cls('ankle_left')}" data-part="ankle_left" x="133" y="470" width="22" height="15" rx="5"/>
            <rect class="body-part ${cls('ankle_right')}" data-part="ankle_right" x="85" y="470" width="22" height="15" rx="5"/>
            <rect class="body-part ${cls('sole_left')}" data-part="sole_left" x="126" y="485" width="36" height="25" rx="6"/>
            <rect class="body-part ${cls('sole_right')}" data-part="sole_right" x="78" y="485" width="36" height="25" rx="6"/>
          </svg>
        </div>
      </div>
      <div class="body-map-wrap">
        <div class="body-map-title">پشت</div>
        <div class="body-map">
          <svg viewBox="0 0 240 560" xmlns="http://www.w3.org/2000/svg">
            <ellipse class="body-part ${cls('occiput')}" data-part="occiput" cx="120" cy="45" rx="30" ry="35"/>
            <ellipse class="body-part ${cls('ear_left')}" data-part="ear_left" cx="88" cy="50" rx="5" ry="9"/>
            <ellipse class="body-part ${cls('ear_right')}" data-part="ear_right" cx="152" cy="50" rx="5" ry="9"/>
            <rect class="body-part ${cls('neck_back')}" data-part="neck_back" x="108" y="78" width="24" height="18" rx="4"/>
            <rect class="body-part ${cls('shoulder_left_back')}" data-part="shoulder_left_back" x="60" y="100" width="44" height="25" rx="10"/>
            <rect class="body-part ${cls('shoulder_right_back')}" data-part="shoulder_right_back" x="136" y="100" width="44" height="25" rx="10"/>
            <rect class="body-part ${cls('upper_back')}" data-part="upper_back" x="98" y="100" width="44" height="45" rx="8"/>
            <rect class="body-part ${cls('mid_back')}" data-part="mid_back" x="98" y="145" width="44" height="45" rx="6"/>
            <rect class="body-part ${cls('lower_back')}" data-part="lower_back" x="98" y="190" width="44" height="35" rx="6"/>
            <rect class="body-part ${cls('upper_arm_left_back')}" data-part="upper_arm_left_back" x="55" y="125" width="30" height="80" rx="12"/>
            <rect class="body-part ${cls('upper_arm_right_back')}" data-part="upper_arm_right_back" x="155" y="125" width="30" height="80" rx="12"/>
            <rect class="body-part ${cls('forearm_left_back')}" data-part="forearm_left_back" x="58" y="227" width="24" height="55" rx="8"/>
            <rect class="body-part ${cls('forearm_right_back')}" data-part="forearm_right_back" x="158" y="227" width="24" height="55" rx="8"/>
            <rect class="body-part ${cls('glute_left')}" data-part="glute_left" x="90" y="255" width="28" height="35" rx="10"/>
            <rect class="body-part ${cls('glute_right')}" data-part="glute_right" x="122" y="255" width="28" height="35" rx="10"/>
            <rect class="body-part ${cls('thigh_left_back')}" data-part="thigh_left_back" x="80" y="290" width="32" height="75" rx="12"/>
            <rect class="body-part ${cls('thigh_right_back')}" data-part="thigh_right_back" x="128" y="290" width="32" height="75" rx="12"/>
            <rect class="body-part ${cls('knee_left_back')}" data-part="knee_left_back" x="82" y="365" width="28" height="25" rx="8"/>
            <rect class="body-part ${cls('knee_right_back')}" data-part="knee_right_back" x="130" y="365" width="28" height="25" rx="8"/>
            <rect class="body-part ${cls('calf_left')}" data-part="calf_left" x="83" y="390" width="26" height="75" rx="8"/>
            <rect class="body-part ${cls('calf_right')}" data-part="calf_right" x="131" y="390" width="26" height="75" rx="8"/>
            <rect class="body-part ${cls('heel_left')}" data-part="heel_left" x="78" y="480" width="36" height="30" rx="6"/>
            <rect class="body-part ${cls('heel_right')}" data-part="heel_right" x="126" y="480" width="36" height="30" rx="6"/>
          </svg>
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
// رویدادهای Wizard
// ═══════════════════════════════════════════════════════
function bindWizard() {
  document.querySelectorAll('.wizard-step').forEach(el => {
    el.onclick = () => {
      const n = parseInt(el.dataset.step);
      if (n > state.maxStep) return;
      if (n === 3 && !state.isIncident) return;
      saveFormState();
      state.step = n;
      renderWizard();
    };
  });

  const pSearch = $('vPatientSearch');
  if (pSearch) {
    let t;
    pSearch.addEventListener('input', e => {
      clearTimeout(t);
      t = setTimeout(() => searchPatients(e.target.value.trim()), 350);
    });
  }

  const resultsBox = $('vPatientResults');
  if (resultsBox && !resultsBox.dataset.bound) {
    resultsBox.dataset.bound = '1';
    resultsBox.addEventListener('click', e => {
      const btn = e.target.closest('[data-pick-patient]');
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();
      pickPatient(parseInt(btn.dataset.pickPatient), btn.dataset.patientName || '', btn.dataset.patientMeta || '');
    });
  }

  const pClear = $('vPatientClear');
  if (pClear) pClear.onclick = () => { state.patientId = null; state.patientName = ''; renderWizard(); };

  // علت مراجعه
  const reasonSearch = $('vReasonSearch');
  if (reasonSearch) {
    if (reasonSearch.value.trim().length >= 2 && !state.formData.reasonId) filterReasons(reasonSearch.value.trim());
    let rt;
    reasonSearch.addEventListener('input', e => {
      clearTimeout(rt);
      rt = setTimeout(() => filterReasons(e.target.value.trim()), 200);
    });
    reasonSearch.addEventListener('focus', () => {
      if (reasonSearch.value.trim().length < 2) filterReasons('');
    });
  }

  const reasonResults = $('vReasonResults');
  if (reasonResults && !reasonResults.dataset.bound) {
    reasonResults.dataset.bound = '1';
    reasonResults.addEventListener('click', e => {
      const btn = e.target.closest('[data-pick-reason]');
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();
      pickReason(parseInt(btn.dataset.pickReason), btn.dataset.reasonName);
    });
  }

  const reasonClear = $('vReasonClear');
  if (reasonClear) reasonClear.onclick = () => {
    state.formData.reasonId = null;
    state.formData.reasonText = '';
    renderWizard();
  };

  document.querySelectorAll('.incident-card').forEach(card => {
    card.onclick = () => {
      saveFormState();
      const yes = card.dataset.incident === 'yes';
      state.isIncident = yes;
      if (!yes) state.incidentType = 'none';
      renderWizard();
    };
  });

  document.querySelectorAll('input[name="incType"]').forEach(r => {
    r.onchange = () => {
      state.incidentType = r.value;
      document.querySelectorAll('.incident-type-radio').forEach(l => l.classList.remove('active'));
      r.closest('.incident-type-radio')?.classList.add('active');
    };
  });

  document.querySelectorAll('.body-part').forEach(p => {
    p.onclick = () => {
      const key = p.dataset.part;
      const loc = INJURY_MAP[key];
      if (!loc) { toast('این ناحیه در دیتابیس تعریف نشده', 'warning'); return; }
      saveFormState();
      const idx = state.selectedInjuries.findIndex(x => x.id === loc.id);
      if (idx >= 0) state.selectedInjuries.splice(idx, 1);
      else state.selectedInjuries.push(loc);
      renderWizard();
    };
  });

  document.querySelectorAll('.remove-part').forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      const id = parseInt(b.dataset.id);
      state.selectedInjuries = state.selectedInjuries.filter(x => x.id !== id);
      saveFormState();
      renderWizard();
    };
  });

  const consCheck = $('consciousCheck');
  if (consCheck) {
    const fd = state.formData;
    if (fd.gcsE == 4 && fd.gcsV == 5 && fd.gcsM == 6) {
      consCheck.checked = true;
      $('consciousToggle')?.classList.add('active');
    }
    consCheck.onchange = () => {
      $('consciousToggle')?.classList.toggle('active', consCheck.checked);
      if (consCheck.checked) { $('vGcsE').value = 4; $('vGcsV').value = 5; $('vGcsM').value = 6; }
      else { $('vGcsE').value = ''; $('vGcsV').value = ''; $('vGcsM').value = ''; }
      calcGCS(); saveFormState();
    };
  }

  ['vGcsE', 'vGcsV', 'vGcsM'].forEach(id => {
    const el = $(id);
    if (el) el.onchange = () => { calcGCS(); saveFormState(); };
  });

  const vitCheck = $('vitalsCheck');
  if (vitCheck) vitCheck.onchange = () => {
    $('vitalsToggle')?.classList.toggle('active', vitCheck.checked);
    if (vitCheck.checked) {
      const rand = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
      $('vHR').value = rand(68, 88); $('vSpo2').value = rand(96, 99);
      $('vBP').value = `${rand(110,125)}/${rand(70,85)}`;
      $('vTemp').value = (36.4 + Math.random()*0.8).toFixed(1);
    } else {
      ['vHR','vSpo2','vBP','vTemp'].forEach(id => { const el = $(id); if (el) el.value = ''; });
    }
    saveFormState();
  };

  ['vHeight','vWeight'].forEach(id => {
    const el = $(id);
    if (el) el.oninput = () => { calcBMI(); saveFormState(); };
  });

  ['vHR','vSpo2','vBP','vTemp','vSugar'].forEach(id => {
    const el = $(id); if (el) el.addEventListener('input', saveFormState);
  });

  const dateEl = $('vDate'); if (dateEl) dateEl.addEventListener('input', saveFormState);
  const incLocEl = $('vIncidentLocation'); if (incLocEl) incLocEl.addEventListener('input', saveFormState);
  const incDescEl = $('vIncidentDesc'); if (incDescEl) incDescEl.addEventListener('input', saveFormState);

  renderQuickDrugs();
  renderItems();

  const toggleEdit = $('toggleEditDrugs');
  if (toggleEdit) toggleEdit.onclick = () => {
    state.editDrugMode = !state.editDrugMode;
    toggleEdit.classList.toggle('active', state.editDrugMode);
    toggleEdit.textContent = state.editDrugMode ? '✖ انصراف' : '✏️ ویرایش';
    $('saveEditDrugs').style.display = state.editDrugMode ? 'inline-block' : 'none';
    renderQuickDrugs();
  };

  const saveEdit = $('saveEditDrugs');
  if (saveEdit) saveEdit.onclick = async () => {
    try {
      const { data: existing } = await sb.from('visits_usertopdrugorder').select('*').limit(1);
      if (existing?.length) {
        await sb.from('visits_usertopdrugorder').update({
          drug_order: state.drugPrefs.order, hidden_drugs: state.drugPrefs.hidden
        }).eq('id', existing[0].id);
      } else {
        await sb.from('visits_usertopdrugorder').insert({
          drug_order: state.drugPrefs.order, hidden_drugs: state.drugPrefs.hidden
        });
      }
      state.editDrugMode = false;
      toast('✅ ذخیره شد', 'success');
      if ($('toggleEditDrugs')) { $('toggleEditDrugs').classList.remove('active'); $('toggleEditDrugs').textContent = '✏️ ویرایش'; }
      if ($('saveEditDrugs')) $('saveEditDrugs').style.display = 'none';
      renderQuickDrugs();
    } catch (e) { toast('خطا: ' + e.message, 'danger'); }
  };

  const qdList = $('quickDrugsList');
  if (qdList && !qdList.dataset.bound) {
    qdList.dataset.bound = '1';
    qdList.addEventListener('click', e => {
      const btn = e.target.closest('[data-quick-drug]');
      if (!btn) return;
      e.preventDefault();
      const drugId = parseInt(btn.dataset.quickDrug);
      const action = btn.dataset.action;
      if (state.editDrugMode && action) handleEditAction(action, drugId);
      else if (!state.editDrugMode) {
        const name = btn.dataset.quickName;
        if (name) addQuickDrug(drugId, name);
      }
    });
  }

  const addBtn = $('vAddDrug'); if (addBtn) addBtn.onclick = openDrugSearchModal;
  const fabAdd = $('vFabAdd'); if (fabAdd) fabAdd.onclick = openDrugSearchModal;

  const itemsList = $('vItemsList');
  if (itemsList && !itemsList.dataset.bound) {
    itemsList.dataset.bound = '1';
    itemsList.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      const i = parseInt(btn.dataset.i);
      if (btn.dataset.action === 'remove') { state.items.splice(i, 1); renderItems(); }
      else if (btn.dataset.action === 'inc') { state.items[i].quantity++; renderItems(); }
      else if (btn.dataset.action === 'dec') { if (state.items[i].quantity > 1) state.items[i].quantity--; renderItems(); }
    });
    itemsList.addEventListener('input', e => {
      const qty = e.target.closest('[data-item-qty]');
      const notes = e.target.closest('[data-item-notes]');
      if (qty) { const i = +qty.dataset.itemQty; state.items[i].quantity = Math.max(1, parseInt(qty.value) || 1); }
      if (notes) { const i = +notes.dataset.itemNotes; state.items[i].notes = notes.value; }
    });
  }

  const treatmentSel = $('vTreatment');
  if (treatmentSel) treatmentSel.onchange = e => {
    state.formData.treatmentId = e.target.value;
    const dispatch = $('vDispatchSection');
    if (isDispatch(e.target.value)) {
      dispatch?.classList.remove('hidden');
      const dt = $('vDispatchTime');
      if (dt && !dt.value) {
        const now = new Date();
        dt.value = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
        state.formData.dispatchTime = dt.value;
      }
    } else dispatch?.classList.add('hidden');
  };

  const dtEl = $('vDispatchTime'); if (dtEl) dtEl.addEventListener('input', saveFormState);
  const ddEl = $('vDispatchDest'); if (ddEl) ddEl.addEventListener('input', saveFormState);
  const ecgEl = $('vECG'); if (ecgEl) ecgEl.addEventListener('input', saveFormState);
  const notesEl = $('vNotes'); if (notesEl) notesEl.addEventListener('input', saveFormState);

  calcGCS(); calcBMI();

  const btnPrev = $('btnPrev');
  if (btnPrev) btnPrev.onclick = () => {
    if (state.step > 1) {
      saveFormState();
      state.step--;
      if (state.step === 3 && !state.isIncident) state.step--;
      renderWizard();
    }
  };

  const btnNext = $('btnNext');
  if (btnNext) btnNext.onclick = () => {
    saveFormState();
    if (!validateStep(state.step)) return;
    if (state.step < 6) {
      state.step++;
      if (state.step === 3 && !state.isIncident) state.step++;
      if (state.step > state.maxStep) state.maxStep = state.step;
      renderWizard();
    }
  };

  const btnSave = $('vSave'); if (btnSave) btnSave.onclick = saveVisit;
  const btnCancel = $('btnCancelWizard');
  if (btnCancel) btnCancel.onclick = () => {
    if (confirm('فرم لغو شود؟')) { state.view = 'list'; resetFormData(); renderList(); }
  };
}

// ═══════════════════════════════════════════════════════
// جستجوی علت / بیمار
// ═══════════════════════════════════════════════════════
function filterReasons(q) {
  const box = $('vReasonResults');
  if (!box) return;
  let filtered = state.reasons;
  if (q && q.length >= 2) {
    const ql = q.toLowerCase();
    filtered = state.reasons.filter(r => (r.name || '').toLowerCase().includes(ql));
  }
  if (!filtered.length) { box.innerHTML = '<div class="text-center muted small py-2">یافت نشد</div>'; return; }
  box.innerHTML = filtered.slice(0, 20).map(r => `
    <button type="button" class="btn btn-light w-100 text-end mb-1 py-2"
      data-pick-reason="${r.id}" data-reason-name="${escapeHtml(r.name)}"
      style="border:1px solid #e2e8f0;border-radius:10px;">
      <strong>${escapeHtml(r.name)}</strong>
    </button>
  `).join('');
}

function pickReason(id, name) {
  state.formData.reasonId = id;
  state.formData.reasonText = name;
  renderWizard();
  beep();
}

async function searchPatients(q) {
  const box = $('vPatientResults');
  if (!box) return;
  if (!q || q.length < 2) { box.innerHTML = '<div class="text-center muted small py-2">حداقل ۲ حرف</div>'; return; }
  box.innerHTML = '<div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div></div>';
  const { data } = await sb.from('core_patient')
    .select('id, first_name, last_name, national_code, personnel_number')
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,national_code.ilike.%${q}%,personnel_number.ilike.%${q}%`)
    .limit(20);
  if (!data?.length) { box.innerHTML = '<div class="text-center muted small py-2">یافت نشد</div>'; return; }
  box.innerHTML = data.map(p => {
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
    const meta = [p.national_code, p.personnel_number].filter(Boolean).join(' | ');
    return `
      <button type="button" class="btn btn-light w-100 text-end mb-1 py-2"
        data-pick-patient="${p.id}" data-patient-name="${escapeHtml(name)}" data-patient-meta="${escapeHtml(meta)}"
        style="border:1px solid #e2e8f0;border-radius:10px;">
        <strong>${escapeHtml(name)}</strong>
        ${meta ? `<br><small class="muted" dir="ltr">${escapeHtml(meta)}</small>` : ''}
      </button>`;
  }).join('');
}

function pickPatient(id, name, meta) {
  if (!id) return;
  state.patientId = id; state.patientName = name;
  state.step = 2;
  if (state.step > state.maxStep) state.maxStep = state.step;
  renderWizard();
  setTimeout(() => toast(`بیمار "${name}" انتخاب شد`, 'success'), 100);
  beep();
}

// ═══════════════════════════════════════════════════════
// GCS و BMI
// ═══════════════════════════════════════════════════════
function calcGCS() {
  const e = parseInt($('vGcsE')?.value) || 0;
  const v = parseInt($('vGcsV')?.value) || 0;
  const m = parseInt($('vGcsM')?.value) || 0;
  const t = $('vGcsTotal');
  if (t) t.textContent = (e && v && m) ? faNum(e + v + m) : '---';
}

function calcBMI() {
  const h = parseFloat($('vHeight')?.value) / 100;
  const w = parseFloat($('vWeight')?.value);
  const b = $('vBmi');
  if (b) b.textContent = (h > 0 && w > 0) ? faNum((w / (h * h)).toFixed(1)) : '---';
}

// ⭐ تعیین وضعیت GCS (اصلاح شد: 15 = هوشیار کامل)
function getGCSStatus(total) {
  if (!total || total < 3) return null;
  if (total === 15) return { level: 'alert', label: 'هوشیار کامل', color: 'success', icon: '🟢' };
  if (total >= 13) return { level: 'mild', label: 'خفیف', color: 'success', icon: '🟡' };
  if (total >= 9) return { level: 'moderate', label: 'متوسط', color: 'warning', icon: '🟠' };
  return { level: 'severe', label: 'شدید', color: 'danger', icon: '🔴' };
}

// ═══════════════════════════════════════════════════════
// Quick Drugs + Items
// ═══════════════════════════════════════════════════════
function renderQuickDrugs() {
  const box = $('quickDrugsList');
  if (!box) return;
  let sorted = [...state.quickDrugs];
  if (state.drugPrefs.order?.length) {
    const map = {};
    state.drugPrefs.order.forEach((id, idx) => map[id] = idx);
    sorted.sort((a,b) => (map[a.id] ?? 9999) - (map[b.id] ?? 9999));
  }
  box.innerHTML = sorted.map(d => {
    const hidden = (state.drugPrefs.hidden || []).includes(d.id);
    const cls = state.editDrugMode
      ? `edit-mode ${hidden ? 'hidden-drug' : ''}`
      : (hidden ? 'hidden' : '');
    if (state.editDrugMode) {
      return `<div class="quick-drug-btn ${cls}">
        <span style="margin-left:5px;">${d.icon}</span>${escapeHtml(d.name)}
        <span class="btn-edit-action" data-action="up" data-quick-drug="${d.id}">▲</span>
        <span class="btn-edit-action" data-action="down" data-quick-drug="${d.id}">▼</span>
        <span class="btn-edit-action danger" data-action="toggle" data-quick-drug="${d.id}">${hidden ? '👁' : '❌'}</span>
      </div>`;
    }
    return `<button type="button" class="quick-drug-btn" data-quick-drug="${d.id}" data-quick-name="${escapeHtml(d.name)}">
      <span style="margin-left:6px;">${d.icon}</span>${escapeHtml(d.name)}</button>`;
  }).join('');
}

function handleEditAction(action, drugId) {
  const ids = state.quickDrugs.map(d => d.id);
  ids.forEach(id => { if (!state.drugPrefs.order.includes(id)) state.drugPrefs.order.push(id); });
  if (action === 'up') {
    const i = state.drugPrefs.order.indexOf(drugId);
    if (i > 0) [state.drugPrefs.order[i-1], state.drugPrefs.order[i]] = [state.drugPrefs.order[i], state.drugPrefs.order[i-1]];
  } else if (action === 'down') {
    const i = state.drugPrefs.order.indexOf(drugId);
    if (i >= 0 && i < state.drugPrefs.order.length - 1) [state.drugPrefs.order[i], state.drugPrefs.order[i+1]] = [state.drugPrefs.order[i+1], state.drugPrefs.order[i]];
  } else if (action === 'toggle') {
    const i = state.drugPrefs.hidden.indexOf(drugId);
    if (i >= 0) state.drugPrefs.hidden.splice(i, 1);
    else state.drugPrefs.hidden.push(drugId);
  }
  renderQuickDrugs();
}

function addQuickDrug(id, name) {
  const existing = state.items.find(i => i.drug_id === id);
  if (existing) existing.quantity++;
  else state.items.push({ drug_id: id, drug_name: name, quantity: 1, notes: '' });
  renderItems(); beep();
}

async function openDrugSearchModal() {
  const { openDrugSearch } = await import('../modals.js');
  openDrugSearch('دارو را جستجو کنید', drug => addQuickDrug(drug.id, drug.name));
}

function renderItems() {
  const list = $('vItemsList');
  if (!list) return;
  if (!state.items.length) { list.innerHTML = '<div class="text-center muted small py-3">دارویی اضافه نشده</div>'; return; }
  list.innerHTML = state.items.map((it, i) => `
    <div class="item-card">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <div class="name">${escapeHtml(it.drug_name)}</div>
        <button class="num-btn" style="width:34px;height:34px;" data-action="remove" data-i="${i}">
          <i class="bi bi-trash text-danger"></i></button>
      </div>
      <div class="d-flex align-items-center gap-2 mb-2">
        <label class="muted small">تعداد:</label>
        <button class="num-btn" style="width:34px;height:34px;" data-action="dec" data-i="${i}">−</button>
        <input type="number" class="form-control form-control-sm text-center" style="max-width:80px;"
          value="${it.quantity}" min="1" data-item-qty="${i}">
        <button class="num-btn" style="width:34px;height:34px;" data-action="inc" data-i="${i}">+</button>
      </div>
      <input type="text" class="form-control form-control-sm" placeholder="دستور مصرف..."
        value="${escapeHtml(it.notes)}" data-item-notes="${i}">
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════
// اعتبارسنجی + ذخیره
// ═══════════════════════════════════════════════════════
function validateStep(step) {
  if (step === 1) { if (!state.patientId) { toast('بیمار را انتخاب کنید', 'warning'); return false; } return true; }
  if (step === 2) {
    if (!state.formData.reasonId) { toast('علت مراجعه را انتخاب کنید', 'warning'); return false; }
    if (state.isIncident && state.incidentType === 'none') { toast('نوع حادثه را انتخاب کنید', 'warning'); return false; }
    return true;
  }
  if (step === 3) { if (!state.formData.incidentLocation?.trim()) { toast('محل حادثه را وارد کنید', 'warning'); return false; } return true; }
  if (step === 4) { if (!state.formData.date?.trim()) { toast('تاریخ ویزیت را وارد کنید', 'warning'); return false; } return true; }
  return true;
}

async function saveVisit() {
  saveFormState();
  if (!validateStep(4)) { state.step = 4; renderWizard(); return; }
  if (!state.formData.treatmentId) { toast('نتیجه درمان را انتخاب کنید', 'warning'); state.step = 6; renderWizard(); return; }

  const btn = $('vSave');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ذخیره...'; }

  try {
    const fd = state.formData;
    const parts = fd.date.trim().split(' ');
    const greg = jalaliToGregorian(parts[0]);
    if (!greg) throw new Error('تاریخ نامعتبر');
    const timeOnly = parts[1] || '12:00';
    const [hh, mm] = timeOnly.split(':').map(Number);
    const visitDate = new Date(`${greg}T${String(hh||12).padStart(2,'0')}:${String(mm||0).padStart(2,'0')}:00`);

    let incidentLocId = null;
    if (state.isIncident) {
      const name = fd.incidentLocation.trim();
      const found = state.incidentLocations.find(l => l.name === name);
      if (found) incidentLocId = found.id;
      else {
        const { data } = await sb.from('visits_incidentlocation')
          .insert({ name, is_active: true, usage_count: 1 }).select().single();
        if (data) incidentLocId = data.id;
      }
    }

    let dispatchTime = null;
    if (fd.dispatchTime) {
      const [dh, dm] = fd.dispatchTime.split(':').map(Number);
      const d = new Date();
      d.setHours(dh, dm, 0, 0);
      dispatchTime = d.toISOString();
    }

    const myId = getMyDjangoId();

    const payload = {
      patient_id: state.patientId,
      visit_date: visitDate.toISOString(),
      reason_for_visit_id: state.formData.reasonId,
      treatment_result_id: parseInt(fd.treatmentId),
      is_incident: state.isIncident,
      incident_type: state.isIncident ? state.incidentType : 'none',
      incident_location_id: incidentLocId,
      incident_description: fd.incidentDesc?.trim() || null,
      height_cm: parseFloat(fd.height) || null,
      weight_kg: parseFloat(fd.weight) || null,
      blood_pressure: fd.bp?.trim() || null,
      heart_rate: parseInt(fd.hr) || null,
      temperature: parseFloat(fd.temp) || null,
      blood_sugar: parseFloat(fd.sugar) || null,
      spo2: parseInt(fd.spo2) || null,
      gcs_eye: parseInt(fd.gcsE) || null,
      gcs_verbal: parseInt(fd.gcsV) || null,
      gcs_motor: parseInt(fd.gcsM) || null,
      ecg_interpretation: fd.ecg?.trim() || null,
      dispatch_time: dispatchTime,
      dispatch_destination: fd.dispatchDest?.trim() || null,
      notes: fd.notes?.trim() || null,
      status: 'pending',
      doctor_id: myId,
      assigned_to_id: myId
    };

    const { data: visit, error: e1 } = await sb.from('visits_visit').insert(payload).select().single();
    if (e1) throw e1;

    if (state.items.length) {
      await sb.from('visits_visititem').insert(
        state.items.map(it => ({
          visit_id: visit.id, drug_id: it.drug_id,
          quantity: it.quantity, notes: it.notes || null
        }))
      );
    }

    if (state.selectedInjuries.length) {
      await sb.from('visits_visit_injury_locations').insert(
        state.selectedInjuries.map(i => ({ visit_id: visit.id, injurylocation_id: i.id }))
      );
    }

    toast('✅ ویزیت ثبت شد', 'success');
    beep();
    resetFormData();
    state.view = 'list';
    renderList();

  } catch (e) {
    console.error(e);
    alert('❌ ' + e.message);
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> ثبت نهایی ویزیت'; }
  }
}

// ═══════════════════════════════════════════════════════
// ⭐ صفحه جزئیات + دکمه ارجاع
// ═══════════════════════════════════════════════════════
async function openDetail(visitId) {
  state.view = 'detail';
  const c = $('visitContent');
  c.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

  try {
    const { data: v } = await sb.from('visits_visit').select(`
      *,
      patient:core_patient(first_name, last_name, national_code, personnel_number, phone_number, occupation, company:core_company(name)),
      reason:visits_reasonforvisit(name),
      result:visits_treatmentresult(name),
      incident_location:visits_incidentlocation(name)
    `).eq('id', visitId).single();

    if (!v) throw new Error('یافت نشد');

    // ⭐ چک دسترسی
    const myId = getMyDjangoId();
    const isOwner = v.doctor_id === myId || v.assigned_to_id === myId;
    const superuser = isSuperuser();

    if (!isOwner && !superuser) {
      c.innerHTML = `
        <div class="alert alert-danger text-center">
          <i class="bi bi-shield-x" style="font-size:2rem;"></i>
          <h5 class="mt-2">دسترسی ندارید</h5>
          <p>این ویزیت توسط شما ایجاد نشده و به شما ارجاع داده نشده است.</p>
          <button class="btn btn-outline-secondary mt-2" onclick="window.__backToList && window.__backToList()">
            بازگشت به لیست
          </button>
        </div>`;
      window.__backToList = () => { state.view = 'list'; renderList(); };
      return;
    }

    const [items, injuries] = await Promise.all([
      sb.from('visits_visititem').select('drug_id, quantity, notes, drug:drugs_drug(name)').eq('visit_id', visitId),
      sb.from('visits_visit_injury_locations').select('loc:visits_injurylocation(name)').eq('visit_id', visitId)
    ]);

    let itemsWithStock = items.data || [];
    if (itemsWithStock.length) {
      const drugIds = itemsWithStock.map(i => i.drug_id);
      const { data: stocks } = await sb.from('v_drug_stock')
        .select('drug_id, total_quantity').in('drug_id', drugIds);
      const stockMap = Object.fromEntries((stocks || []).map(s => [s.drug_id, s.total_quantity]));
      itemsWithStock = itemsWithStock.map(it => ({ ...it, available: stockMap[it.drug_id] || 0 }));
    }

    // ⭐ لود اطلاعات کاربران
    const userIds = new Set([v.doctor_id, v.assigned_to_id].filter(Boolean));
    if (userIds.size) {
      const { data: users } = await sb.from('auth_user')
        .select('id, first_name, last_name, username').in('id', Array.from(userIds));
      state.userMap = {};
      (users || []).forEach(u => {
        state.userMap[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
      });
    }

    state.visit = {
      ...v,
      items: itemsWithStock,
      injuries: (injuries.data || []).map(x => x.loc?.name).filter(Boolean)
    };
    renderDetail();
  } catch (e) {
    c.innerHTML = `<div class="alert alert-danger">خطا: ${escapeHtml(e.message)}</div>`;
  }
}

function renderDetail() {
  const v = state.visit;
  const c = $('visitContent');
  const p = v.patient || {};
  const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || '—';
  const jd = gregorianToJalali(v.visit_date);
  const timeStr = getTimeStr(v.visit_date);
  const isInc = v.is_incident && v.incident_type !== 'none';

  const myId = getMyDjangoId();
  const isAssignee = v.assigned_to_id === myId;
  const isDoctor = v.doctor_id === myId;
  const superuser = isSuperuser();
  const canRefer = (isAssignee || isDoctor || superuser) && v.status !== 'completed';
  const canComplete = canRefer;

  const statusBadge = v.status === 'completed'
    ? '<span class="badge-soft success"><i class="bi bi-check-circle"></i> تکمیل شده</span>'
    : v.status === 'referred'
      ? '<span class="badge-soft warning"><i class="bi bi-arrow-left-right"></i> ارجاع شده</span>'
      : '<span class="badge-soft primary"><i class="bi bi-hourglass"></i> در انتظار</span>';

  const doctorName = getUserName(v.doctor_id);
  const assigneeName = getUserName(v.assigned_to_id);

  let hasShortage = false;
  (v.items || []).forEach(it => { if ((it.available ?? 0) < it.quantity) hasShortage = true; });

  let html = `
    <div class="card">
      <div class="card-head ${isInc ? 'danger' : ''}">
        <i class="bi bi-person-badge"></i> ${escapeHtml(name)}
        ${statusBadge}
      </div>
      <div class="card-body">
        <div class="row-item d-flex justify-content-between">
          <span class="muted">تاریخ ویزیت</span>
          <span>${jd} - ${timeStr}</span>
        </div>
        <div class="row-item d-flex justify-content-between">
          <span class="muted">کد ملی</span>
          <span dir="ltr">${escapeHtml(p.national_code || '—')}</span>
        </div>
        ${p.personnel_number ? `<div class="row-item d-flex justify-content-between">
          <span class="muted">کد پرسنلی</span>
          <span dir="ltr">${escapeHtml(String(p.personnel_number))}</span>
        </div>` : ''}
        ${p.company?.name ? `<div class="row-item d-flex justify-content-between">
          <span class="muted">شرکت</span>
          <span>${escapeHtml(p.company.name)}</span>
        </div>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="card-head" style="background:linear-gradient(135deg,#64748b,#475569);">
        <i class="bi bi-people"></i> گردش کار
      </div>
      <div class="card-body">
        <div class="row-item d-flex justify-content-between">
          <span class="muted">ثبت کننده</span>
          <span><i class="bi bi-pencil"></i> <strong>${escapeHtml(doctorName)}</strong></span>
        </div>
        <div class="row-item d-flex justify-content-between">
          <span class="muted">مسئول فعلی</span>
          <span><i class="bi bi-person-check"></i> <strong>${escapeHtml(assigneeName)}</strong></span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><i class="bi bi-file-medical"></i> اطلاعات ویزیت</div>
      <div class="card-body">
        <div class="row-item d-flex justify-content-between">
          <span class="muted">علت مراجعه</span>
          <span>${escapeHtml(v.reason?.name || '—')}</span>
        </div>
        <div class="row-item d-flex justify-content-between">
          <span class="muted">نتیجه درمان</span>
          <span>${escapeHtml(v.result?.name || '—')}</span>
        </div>
      </div>
    </div>
  `;

  if (isInc) {
    html += `
      <div class="card">
        <div class="card-head danger"><i class="bi bi-exclamation-triangle"></i> حادثه</div>
        <div class="card-body">
          <div class="row-item d-flex justify-content-between">
            <span class="muted">نوع</span><span>${getIncLabel(v.incident_type)}</span>
          </div>
          <div class="row-item d-flex justify-content-between">
            <span class="muted">محل حادثه</span>
            <span>${escapeHtml(v.incident_location?.name || '—')}</span>
          </div>
          ${v.incident_description ? `<div class="row-item">
            <div class="muted small mb-1">شرح:</div>
            <div>${escapeHtml(v.incident_description)}</div>
          </div>` : ''}
          ${v.injuries.length ? `<div class="row-item">
            <div class="muted small mb-2">نواحی مصدومیت:</div>
            <div>${v.injuries.map(i => `<span class="badge-soft danger" style="margin:2px;">${escapeHtml(i)}</span>`).join('')}</div>
          </div>` : ''}
        </div>
      </div>`;
  }

  const hasVitals = v.height_cm || v.weight_kg || v.blood_pressure || v.heart_rate || v.temperature || v.blood_sugar || v.spo2;
  if (hasVitals) {
    html += `
      <div class="card">
        <div class="card-head success"><i class="bi bi-heart-pulse"></i> علائم حیاتی</div>
        <div class="card-body">
          <div class="row g-2 text-center">
            ${v.height_cm ? cellBadge('قد', faNum(v.height_cm), 'primary') : ''}
            ${v.weight_kg ? cellBadge('وزن', faNum(v.weight_kg), 'primary') : ''}
            ${v.blood_pressure ? cellBadge('فشار', escapeHtml(v.blood_pressure), 'warning') : ''}
            ${v.heart_rate ? cellBadge('نبض', faNum(v.heart_rate), 'warning') : ''}
            ${v.temperature ? cellBadge('دما', faNum(v.temperature), 'danger') : ''}
            ${v.blood_sugar ? cellBadge('قند', faNum(v.blood_sugar), 'danger') : ''}
            ${v.spo2 ? cellBadge('SpO2', faNum(v.spo2) + '%', 'warning') : ''}
          </div>
        </div>
      </div>`;
  }

  if (v.gcs_eye || v.gcs_verbal || v.gcs_motor) {
    const total = (v.gcs_eye || 0) + (v.gcs_verbal || 0) + (v.gcs_motor || 0);
    const status = getGCSStatus(total);
    html += `
      <div class="card">
        <div class="card-head warning"><i class="bi bi-activity"></i> GCS</div>
        <div class="card-body">
          <div class="row g-2 text-center">
            ${cellBadge('E', faNum(v.gcs_eye || 0), 'primary')}
            ${cellBadge('V', faNum(v.gcs_verbal || 0), 'primary')}
            ${cellBadge('M', faNum(v.gcs_motor || 0), 'primary')}
            ${cellBadge('کل', faNum(total), status?.color || 'primary')}
          </div>
          ${status ? `<div class="text-center mt-2">
            <span class="badge-soft ${status.color}" style="font-size:0.85rem;padding:8px 16px;">
              ${status.icon} ${status.label}
            </span>
          </div>` : ''}
        </div>
      </div>`;
  }

  if (v.ecg_interpretation) {
    html += `<div class="card">
      <div class="card-head danger"><i class="bi bi-activity"></i> تفسیر ECG</div>
      <div class="card-body">${escapeHtml(v.ecg_interpretation)}</div>
    </div>`;
  }

  if (v.dispatch_time || v.dispatch_destination) {
    html += `<div class="card">
      <div class="card-head warning"><i class="bi bi-truck"></i> اعزام</div>
      <div class="card-body">
        ${v.dispatch_time ? `<div class="row-item d-flex justify-content-between">
          <span class="muted">ساعت</span>
          <span>${new Date(v.dispatch_time).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>` : ''}
        ${v.dispatch_destination ? `<div class="row-item d-flex justify-content-between">
          <span class="muted">مقصد</span>
          <span>${escapeHtml(v.dispatch_destination)}</span>
        </div>` : ''}
      </div>
    </div>`;
  }

  if (v.items.length) {
    html += `<div class="card">
      <div class="card-head ${hasShortage ? 'danger' : 'success'}">
        <i class="bi bi-capsule"></i> داروهای تجویزی ${hasShortage ? '⚠️ (کمبود موجودی)' : ''}
      </div>
      <div class="card-body">
        ${v.items.map(it => {
          const avail = it.available ?? 0;
          const short = avail < it.quantity;
          return `<div class="row-item d-flex justify-content-between align-items-center">
            <div class="flex-grow-1">
              <strong>${escapeHtml(it.drug?.name || '—')}</strong>
              ${it.notes ? `<div class="small muted">${escapeHtml(it.notes)}</div>` : ''}
              <div class="small mt-1" style="font-size:0.72rem;">
                موجودی: <strong style="color:${short ? 'var(--danger)' : 'var(--success)'};">${faNum(avail)}</strong>
                ${short ? ` <span class="badge-soft danger" style="font-size:0.6rem;">کمبود ${faNum(it.quantity - avail)}</span>` : ''}
              </div>
            </div>
            <span class="badge-soft ${short ? 'danger' : 'success'}">${faNum(it.quantity)}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  if (v.notes) {
    html += `<div class="card">
      <div class="card-head"><i class="bi bi-journal-text"></i> ملاحظات</div>
      <div class="card-body">${escapeHtml(v.notes)}</div>
    </div>`;
  }

  if (hasShortage && v.status !== 'completed') {
    html += `<div class="alert alert-danger">
      <i class="bi bi-exclamation-triangle"></i>
      <strong>موجودی برخی داروها کافی نیست.</strong>
      تا زمان تأمین موجودی، این ویزیت در وضعیت «در انتظار» می‌ماند.
    </div>`;
  }

  // ⭐ دکمه‌های عملیات
  html += `<div class="d-grid gap-2 mb-5">`;

  if (v.status !== 'completed') {
    // دکمه ارجاع
    if (canRefer) {
      html += `<button class="btn btn-info text-white btn-lg py-3" id="vReferBtn">
        <i class="bi bi-share-fill"></i> ارجاع به کاربر دیگر
      </button>`;
    }

    // دکمه تکمیل
    if (canComplete) {
      html += `<button class="btn ${hasShortage ? 'btn-warning' : 'btn-success'} btn-lg py-3" id="vCompleteBtn">
        <i class="bi bi-check-circle-fill"></i>
        ${hasShortage ? 'تلاش برای تکمیل (نیاز به تأمین موجودی)' : 'تکمیل ویزیت (کسر موجودی)'}
      </button>`;
    }
  } else {
    html += `<div class="alert alert-success text-center">
      <i class="bi bi-check-circle-fill"></i> این ویزیت تکمیل شده است
    </div>`;
  }

  html += `<button class="btn btn-outline-secondary" id="vBackBtn">
    <i class="bi bi-arrow-right"></i> بازگشت
  </button></div>`;

  c.innerHTML = html;

  const referBtn = $('vReferBtn');
  if (referBtn) referBtn.onclick = () => openReferralModal(v);

  const completeBtn = $('vCompleteBtn');
  if (completeBtn) completeBtn.onclick = () => completeVisit(v.id);

  const backBtn = $('vBackBtn');
  if (backBtn) backBtn.onclick = () => { state.view = 'list'; renderList(); };
}

function cellBadge(label, value, color) {
  return `<div class="col-4"><div class="badge-soft ${color} w-100" style="justify-content:center;padding:8px 4px;">${label}<br><strong>${value}</strong></div></div>`;
}

// ═══════════════════════════════════════════════════════
// ⭐ مودال ارجاع
// ═══════════════════════════════════════════════════════
async function openReferralModal(visit) {
  // ساخت مودال داینامیک
  const existing = document.getElementById('referralModal');
  if (existing) existing.remove();

  const myId = getMyDjangoId();

  // لود کاربران فعال
  let users = [];
  try {
    const { data } = await sb.from('auth_user')
      .select('id, first_name, last_name, username')
      .eq('is_active', true)
      .neq('id', myId)
      .order('first_name');
    users = data || [];
  } catch (e) {
    toast('خطا در لود کاربران: ' + e.message, 'danger');
    return;
  }

  const modalHtml = `
    <div class="modal fade" id="referralModal" tabindex="-1" data-bs-backdrop="static">
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-info text-white">
            <h5 class="modal-title"><i class="bi bi-share-fill"></i> ارجاع ویزیت</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label">جستجوی کاربر:</label>
              <input type="text" class="form-control" id="refSearch" placeholder="نام یا یوزرنیم..." autocomplete="off">
            </div>
            <div id="refUsersList" style="max-height:320px;overflow-y:auto;">
              ${users.slice(0, 30).map(u => {
                const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
                return `<button type="button" class="btn btn-light w-100 text-end mb-1 py-2"
                  data-ref-user="${u.id}" data-ref-name="${escapeHtml(name)}"
                  style="border:1px solid #e2e8f0;border-radius:10px;">
                  <i class="bi bi-person"></i> <strong>${escapeHtml(name)}</strong>
                  <small class="muted" style="margin-right:8px;" dir="ltr">@${escapeHtml(u.username)}</small>
                </button>`;
              }).join('')}
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-light" data-bs-dismiss="modal">انصراف</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  const modal = new bootstrap.Modal(document.getElementById('referralModal'));
  modal.show();

  // فیلتر کاربران
  const searchInput = document.getElementById('refSearch');
  const usersList = document.getElementById('refUsersList');
  searchInput.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = users.filter(u => {
      const name = `${u.first_name || ''} ${u.last_name || ''} ${u.username}`.toLowerCase();
      return name.includes(q);
    });
    usersList.innerHTML = filtered.length
      ? filtered.slice(0, 30).map(u => {
          const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
          return `<button type="button" class="btn btn-light w-100 text-end mb-1 py-2"
            data-ref-user="${u.id}" data-ref-name="${escapeHtml(name)}"
            style="border:1px solid #e2e8f0;border-radius:10px;">
            <i class="bi bi-person"></i> <strong>${escapeHtml(name)}</strong>
            <small class="muted" style="margin-right:8px;" dir="ltr">@${escapeHtml(u.username)}</small>
          </button>`;
        }).join('')
      : '<div class="text-center muted small py-3">یافت نشد</div>';
  });

  // کلیک روی کاربر
  document.getElementById('referralModal').addEventListener('click', async e => {
    const btn = e.target.closest('[data-ref-user]');
    if (!btn) return;
    const userId = parseInt(btn.dataset.refUser);
    const userName = btn.dataset.refName;

    if (!confirm(`ویزیت به "${userName}" ارجاع داده شود؟`)) return;

    try {
      const { error } = await sb.from('visits_visit').update({
        assigned_to_id: userId,
        status: 'referred'
      }).eq('id', visit.id);
      if (error) throw error;

      toast(`✅ ویزیت به "${userName}" ارجاع شد`, 'success');
      beep();
      modal.hide();
      setTimeout(() => {
        document.getElementById('referralModal')?.remove();
        openDetail(visit.id);
      }, 300);
    } catch (err) {
      console.error(err);
      alert('❌ خطا: ' + err.message);
    }
  });

  document.getElementById('referralModal').addEventListener('hidden.bs.modal', () => {
    document.getElementById('referralModal')?.remove();
  });
}

// ═══════════════════════════════════════════════════════
// تکمیل ویزیت
// ═══════════════════════════════════════════════════════
async function completeVisit(visitId) {
  if (!confirm('ویزیت تکمیل شود؟ موجودی انبار کسر می‌شود.')) return;
  const btn = $('vCompleteBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> بررسی موجودی...'; }

  try {
    const { data: items, error: e0 } = await sb.from('visits_visititem')
      .select('drug_id, quantity, drug:drugs_drug(name)')
      .eq('visit_id', visitId);
    if (e0) throw e0;

    if (!items?.length) {
      const { error: e2 } = await sb.from('visits_visit').update({
        status: 'completed', completed_at: new Date().toISOString()
      }).eq('id', visitId);
      if (e2) throw e2;
      toast('✅ ویزیت تکمیل شد (بدون دارو)', 'success');
      beep(); openDetail(visitId); return;
    }

    const shortages = [];
    for (const it of items) {
      const { data: stock } = await sb.from('v_drug_stock')
        .select('total_quantity').eq('drug_id', it.drug_id).maybeSingle();
      const available = stock?.total_quantity || 0;
      if (available < it.quantity) {
        shortages.push({
          name: it.drug?.name || `#${it.drug_id}`,
          required: it.quantity, available, missing: it.quantity - available
        });
      }
    }

    if (shortages.length) {
      const lines = shortages.map(s =>
        `• ${s.name}\n  نیاز: ${faNum(s.required)} | موجودی: ${faNum(s.available)} | کمبود: ${faNum(s.missing)}`
      ).join('\n\n');
      alert(`⚠️ ویزیت تکمیل نشد\n\nموجودی داروهای زیر کافی نیست:\n\n${lines}\n\n` +
        `این ویزیت در وضعیت «در حال بررسی» باقی می‌ماند.\n` +
        `لطفاً از منوی «دریافت دارو»، موجودی را تأمین کنید.`);
      toast('⚠️ موجودی کافی نیست', 'warning');
      beep(300); openDetail(visitId); return;
    }

    if (btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> کسر موجودی...';

    const errors = [], succeeded = [];
    for (const it of items) {
      const { error: e } = await sb.rpc('deduct_stock_fifo', {
        p_drug_id: it.drug_id, p_quantity: it.quantity
      });
      if (e) errors.push(`${it.drug?.name || '#' + it.drug_id}: ${e.message}`);
      else succeeded.push(it.drug?.name);
    }

    if (errors.length) {
      alert(`❌ خطا در کسر موجودی:\n\n${errors.join('\n')}`);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> تلاش مجدد'; }
      return;
    }

    const myId = getMyDjangoId();
    const { error: e2 } = await sb.from('visits_visit').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by_id: myId
    }).eq('id', visitId);
    if (e2) throw e2;

    toast(`✅ ویزیت تکمیل شد (${faNum(succeeded.length)} دارو کسر شد)`, 'success');
    beep(); openDetail(visitId);
  } catch (e) {
    console.error(e);
    alert('❌ ' + e.message);
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> تکمیل ویزیت'; }
  }
}
