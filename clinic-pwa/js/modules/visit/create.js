// js/modules/visit/create.js
import { sb } from '../../sb.js';
import { $, faNum, faToEn, escapeHtml, jalaliToGregorian, gregorianToJalali, todayJalali, toast, beep } from '../../utils.js';
import { state, saveFormState, resetFormData, loadRefs, calcGCS, calcBMI, INJURY_MAP } from './state.js';
import { getMyDjangoId, getIncLabel } from './helpers.js';
import { renderBodyMap } from './bodymap.js';
import { logChange } from './changelog.js';
import { renderList } from './list.js';
import { broadcastIncidentAlert } from '../../incident-alert.js';
import { saveVisitExtra, loadPatientExtra, savePatientExtra, timeToIso } from '../extra-data.js';
import { mountProcessBanner } from '../../process/banner.js';

// ═══════════════════════════════════════════════════════
// توابع کمکی (روز هفته و تشخیص دارو)
// ═══════════════════════════════════════════════════════
const isConsumableDrug = (drug) => {
  const f = (drug?.form || '').toString().toLowerCase();
  return f === 'other' || f.includes('سایر');
};

function getDayOfWeek(gregorianDate) {
  if (!gregorianDate) return '';
  const d = new Date(gregorianDate);
  if (isNaN(d)) return '';
  const days = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  return days[d.getDay()];
}

// ═══════════════════════════════════════════════════════
// بارگذاری سوابق بیمار
// ═══════════════════════════════════════════════════════
async function loadPatientHistory(patientId) {
  try {
    // ۱. اطلاعات پایه بیمار (حساسیت و سابقه بیماری)
    const { data: pInfo } = await sb.from('core_patient')
      .select('allergies, medical_history')
      .eq('id', patientId).maybeSingle();

    // ۲. سوابق ویزیت
    const { data: visits } = await sb.from('visits_visit')
      .select('visit_date, reason:visits_reasonforvisit(name)')
      .eq('patient_id', patientId)
      .order('visit_date', { ascending: false });

    const visitCount = visits?.length || 0;
    const lastReason = visits && visits.length > 0 ? (visits[0].reason?.name || 'نامشخص') : 'ندارد';
    
    // ۳. محاسبه تاریخ آخرین مراجعه با روز هفته
    let lastVisitStr = 'ندارد';
    if (visits && visits.length > 0) {
      const lastDate = visits[0].visit_date;
      const jDate = gregorianToJalali(lastDate);
      const dayName = getDayOfWeek(lastDate);
      lastVisitStr = `${dayName} ${jDate}`;
    }

    // ۴. وضعیت طب کار (از جدول lab_results_periodicexamination)
    let occStatus = 'ثبت نشده';
    try {
      const { data: occ } = await sb.from('lab_results_periodicexamination')
        .select('final_opinion_text, final_opinion_conditions, exam_date')
        .eq('patient_id', patientId)
        .order('exam_date', { ascending: false })
        .limit(1);
      
      if (occ && occ.length > 0) {
        let statusText = occ[0].final_opinion_text || 'تایید شده';
        if (occ[0].final_opinion_conditions && occ[0].final_opinion_conditions.trim()) {
          statusText += ` (${occ[0].final_opinion_conditions.trim()})`;
        }
        occStatus = statusText;
      }
    } catch(e) {
      console.log('خطا در دریافت اطلاعات طب کار:', e);
    }

    state.patientHistory = {
      allergies: pInfo?.allergies || '',
      medicalHistory: pInfo?.medical_history || '',
      visitCount,
      lastReason,
      lastVisitStr,
      occStatus
    };

  } catch (err) {
    console.error('خطا در دریافت سوابق بیمار:', err);
    state.patientHistory = null;
  }
}

export async function openCreate() {
  state.view = 'create';
  state.step = 1; state.maxStep = 1;
  state.patientId = null; state.patientName = '';
  state.patientHistory = null;
  state.isIncident = false; state.incidentType = 'none';
  state.selectedInjuries = []; state.items = [];
  state.alertBroadcasted = false;
  resetFormData();

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  state.formData.date = `${todayJalali()} ${hh}:${mm}`;

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
    { n: 1, label: 'بیمار' },
    { n: 2, label: 'علت و حادثه' },
    { n: 3, label: 'مصدومیت' },
    { n: 4, label: 'علائم حیاتی' },
    { n: 5, label: 'داروها' },
    { n: 6, label: 'لوازم مصرفی' },
    { n: 7, label: 'تشخیص' }
  ];

  // ساخت بنر سوابق بیمار با تاریخ و روز هفته
  let historyBanner = '';
  if (state.patientId && state.patientHistory) {
    const h = state.patientHistory;
    const allergyBadge = h.allergies ? `<span class="badge bg-danger ms-1" title="حساسیت"><i class="bi bi-exclamation-triangle"></i> ${escapeHtml(h.allergies)}</span>` : '';
    const historyBadge = h.medicalHistory ? `<span class="badge bg-secondary ms-1" title="سابقه بیماری"><i class="bi bi-journal-medical"></i> ${escapeHtml(h.medicalHistory)}</span>` : '';
    
    historyBanner = `
      <div class="alert alert-info shadow-sm mb-3 border-info" style="border-right: 5px solid #0dcaf0;">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h6 class="fw-bold mb-0 text-dark"><i class="bi bi-person-badge"></i> پرونده: ${escapeHtml(state.patientName)}</h6>
          <span class="badge bg-primary">تعداد ویزیت: ${faNum(h.visitCount)}</span>
        </div>
        <div class="small text-dark mb-2">
          <strong>علت آخرین ویزیت:</strong> ${escapeHtml(h.lastReason)} <br>
          <strong>آخرین مراجعه:</strong> ${escapeHtml(h.lastVisitStr)} <br>
          <strong>طب کار:</strong> ${escapeHtml(h.occStatus)}
        </div>
        <div class="d-flex flex-wrap gap-1">
          ${allergyBadge}
          ${historyBadge}
        </div>
      </div>
    `;
  }

  c.innerHTML = `
    <div id="visitBannerMount"></div>
    ${historyBanner}

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
            <button type="button" class="btn btn-outline-primary w-100 mb-3" id="vQuickAddPatient">
              <i class="bi bi-person-plus-fill"></i> ثبت بیمار جدید
            </button>
            <div id="vPatientResults" style="max-height:400px;overflow-y:auto;"></div>
          </div>
          <div id="vPatientSelected" class="${state.patientId ? '' : 'hidden'}">
            <div class="badge-soft success" style="display:flex;align-items:center;gap:10px;padding:12px;">
              <i class="bi bi-person-check-fill" style="font-size:1.3rem;"></i>
              <div style="flex:1;"><div style="font-weight:700;">${escapeHtml(state.patientName || '—')}</div></div>
              <button style="background:none;border:none;color:#dc3545;font-size:1.2rem;font-weight:700;" id="vPatientClear">✕</button>
            </div>
            <div id="vPatientWorkUnitWrap" class="mt-3 hidden">
              <label class="form-label small">واحد کاری (اختیاری)</label>
              <input type="text" class="form-control" id="vPatientWorkUnit" placeholder="مثال: خط تولید ۲" list="workUnitList">
              <datalist id="workUnitList"></datalist>
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

          <div class="mb-3">
            <label class="form-label small">ساعت شروع علائم (اختیاری)</label>
            <input type="time" class="form-control" id="vSymptomTime" value="${fd.symptomTime || ''}">
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
          <div class="mb-3">
            <label class="form-label small">ساعت وقوع حادثه (اختیاری)</label>
            <input type="time" class="form-control" id="vIncidentTime" value="${fd.incidentTime || ''}">
          </div>
          <label class="form-label d-block mb-2">محل‌های مصدومیت:</label>
          ${renderBodyMap(state.selectedInjuries)}
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
            <input type="text" class="form-control" id="vDate" value="${escapeHtml(fd.date || '')}" dir="ltr">
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
              <div class="form-control text-center fw-bold" id="vGcsTotal" style="background:#f0f8ff;color:var(--primary);">---</div></div>
          </div>
          <div class="toggle-box" id="vitalsToggle">
            <input type="checkbox" class="big-checkbox" id="vitalsCheck">
            <label for="vitalsCheck">همه علائم حیاتی نرمال است</label>
          </div>
          <div class="row g-2">
            <div class="col-6 col-md-3"><label class="form-label small">ضربان قلب</label>
              <input type="number" class="form-control text-center" id="vHR" value="${escapeHtml(fd.hr)}" inputmode="numeric"></div>
            <div class="col-6 col-md-3"><label class="form-label small">SpO2 %</label>
              <input type="number" class="form-control text-center" id="vSpo2" value="${escapeHtml(fd.spo2)}" inputmode="numeric"></div>
            <div class="col-6 col-md-3"><label class="form-label small">تنفس (RR) (اختیاری)</label>
              <input type="text" inputmode="numeric" class="form-control text-center" id="vRR" value="${escapeHtml(fd.rr || '')}"></div>
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
            <i class="bi bi-plus-circle"></i> افزودن دارو</button>
          <div id="vItemsList"></div>
        </div>
      </div>
    </div>

    <div class="wizard-panel ${state.step === 6 ? 'active' : ''}">
      <div class="card">
        <div class="card-head" style="background: linear-gradient(135deg, #0891b2, #06b6d4);">
          <i class="bi bi-bandaid"></i> مرحله ۶: لوازم مصرفی
        </div>
        <div class="card-body">
          <div class="quick-drug-wrapper" style="background:#ecfeff;border-color:#67e8f9;">
            <div class="drug-edit-toolbar">
              <label style="color:#0891b2;">⚡ لوازم پرمصرف</label>
            </div>
            <div class="d-flex flex-wrap" id="quickConsumablesList"></div>
          </div>
          <button class="btn w-100 mb-3" id="vAddConsumable" style="background:#0891b2;color:#fff;border:none;">
            <i class="bi bi-plus-circle"></i> افزودن لوازم مصرفی
          </button>
          <div id="vConsumablesList"></div>
        </div>
      </div>
    </div>

    <div class="wizard-panel ${state.step === 7 ? 'active' : ''}">
      <div class="card">
        <div class="card-head"><i class="bi bi-journal-medical"></i> مرحله ۷: تشخیص و نتیجه</div>
        <div class="card-body">
          <div class="mb-3">
            <label class="form-label">نتیجه درمان *</label>
            <select class="form-select" id="vTreatment">
              <option value="">انتخاب کنید...</option>
              ${state.treatments.map(t => `<option value="${t.id}" ${fd.treatmentId == t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
            </select>
          </div>

          <div class="mb-3">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="vAdmitted" ${fd.vAdmitted ? 'checked' : ''}>
              <label class="form-check-label small" for="vAdmitted">بستری موقت</label>
            </div>
          </div>

          <div id="vDispatchSection" class="${fd.treatmentId && (isDispatch(fd.treatmentId) || isReferral(fd.treatmentId)) ? '' : 'hidden'}">
            <div class="card" style="background:#fff7ed;border:2px solid #fed7aa;">
              <div class="card-body">
                <h6 style="color:#92400e;font-weight:700;margin-bottom:12px;">
                  <i class="bi bi-truck"></i> اطلاعات اعزام / ارجاع
                </h6>
                <div class="row g-2">
                  <div class="col-6"><label class="form-label small">ساعت اعزام/ارجاع</label>
                    <input type="time" class="form-control" id="vDispatchTime" value="${escapeHtml(fd.dispatchTime || '')}"></div>
                  <div class="col-6"><label class="form-label small">مقصد</label>
                    <input type="text" class="form-control" id="vDispatchDest" value="${escapeHtml(fd.dispatchDest || '')}" placeholder="نام بیمارستان"></div>
                </div>

                <div id="vTransportTypeWrap" class="mt-3 ${fd.treatmentId && isReferral(fd.treatmentId) ? '' : 'hidden'}">
                  <label class="form-label small">نحوه ارجاع (اختیاری)</label>
                  <select class="form-select" id="vTransportType">
                    <option value="">— انتخاب —</option>
                    <option value="agency" ${fd.vTransportType === 'agency' ? 'selected' : ''}>آژانس</option>
                    <option value="personal" ${fd.vTransportType === 'personal' ? 'selected' : ''}>وسیله شخصی</option>
                    <option value="transport" ${fd.vTransportType === 'transport' ? 'selected' : ''}>ترانسپورت</option>
                    <option value="other" ${fd.vTransportType === 'other' ? 'selected' : ''}>سایر</option>
                  </select>
                </div>

                <div id="vCompanionWrap" class="mt-3">
                  <div class="form-check mb-2">
                    <input class="form-check-input" type="checkbox" id="vCompanionNeeded" ${fd.vCompanionNeeded ? 'checked' : ''}>
                    <label class="form-check-label small" for="vCompanionNeeded">نیاز به همراه</label>
                  </div>
                  <div class="row g-2">
                    <div class="col-6"><label class="form-label small">نام همراه (اختیاری)</label>
                      <input type="text" class="form-control" id="vCompanionName" value="${escapeHtml(fd.vCompanionName || '')}"></div>
                    <div class="col-6"><label class="form-label small">تلفن همراه (اختیاری)</label>
                      <input type="text" class="form-control" id="vCompanionPhone" value="${escapeHtml(fd.vCompanionPhone || '')}"></div>
                  </div>
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
        <span class="step-indicator">مرحله ${faNum(state.step)} از ${faNum(7)}</span>
        <button class="btn btn-primary" id="btnNext" ${state.step === 7 ? 'style="display:none;"' : ''}>
          بعد <i class="bi bi-arrow-left"></i></button>
      </div>
      ${state.step === 7 ? `
        <button class="btn btn-success w-100 py-3 mt-3" id="vSave">
          <i class="bi bi-check-circle-fill"></i> ثبت نهایی ویزیت
        </button>
      ` : ''}
    </div></div>

    <div class="d-grid gap-2 mt-2 mb-5">
      <button class="btn btn-outline-secondary" id="btnCancelWizard">
        <i class="bi bi-x-circle"></i> انصراف</button>
    </div>

    <div class="fab-container ${(state.step === 5 || state.step === 6) ? 'show' : ''}" id="vFab">
      <div class="fab-hint">${state.step === 6 ? 'افزودن لوازم' : 'افزودن دارو'}</div>
      <button class="fab-add-drug" id="vFabAdd">+</button>
    </div>
  `;

  bindWizard();
  mountBannerInWizard();
}

function mountBannerInWizard() {
  try {
    const mount = $('visitBannerMount');
    if (!mount) return;
    mountProcessBanner(mount, 'visit-create', {
      isIncident: state.isIncident,
      isAdmitted: !!(state.formData?.vAdmitted),
      isDispatch: isDispatch(state.formData?.treatmentId),
      isReferral: isReferral(state.formData?.treatmentId),
      onStep: state.step
    });
  } catch (e) { console.warn('banner failed', e); }
}

function isDispatch(treatmentId) {
  if (!treatmentId) return false;
  const t = state.treatments.find(x => String(x.id) === String(treatmentId));
  return t?.name?.includes('اعزام');
}

function isReferral(treatmentId) {
  if (!treatmentId) return false;
  const t = state.treatments.find(x => String(x.id) === String(treatmentId));
  return t?.name?.includes('ارجاع به بیمارستان');
}

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

  const quickAddBtn = $('vQuickAddPatient');
  if (quickAddBtn) quickAddBtn.onclick = openQuickPatientModal;

  const resultsBox = $('vPatientResults');
  if (resultsBox && !resultsBox.dataset.bound) {
    resultsBox.dataset.bound = '1';
    resultsBox.addEventListener('click', e => {
      const btn = e.target.closest('[data-pick-patient]');
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();
      pickPatient(
        parseInt(btn.dataset.pickPatient),
        btn.dataset.patientName || '',
        btn.dataset.patientNational || '',
        btn.dataset.patientPassport || ''
      );
    });
  }

  const pClear = $('vPatientClear');
  if (pClear) pClear.onclick = () => { state.patientId = null; state.patientName = ''; state.patientHistory = null; renderWizard(); };

  const pWorkUnit = $('vPatientWorkUnit');
  if (pWorkUnit) {
    pWorkUnit.addEventListener('blur', async () => {
      const val = pWorkUnit.value.trim();
      if (!val || !state.patientId) return;
      try {
        await savePatientExtra(state.patientId, { work_unit: val });
        toast('واحد کاری ذخیره شد', 'success');
      } catch (e) {
        console.warn('savePatientExtra failed', e);
        toast('ذخیره واحد کاری ناموفق بود', 'warning');
      }
    });
  }

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
    state.formData.reasonId = null; state.formData.reasonText = '';
    renderWizard();
  };

  document.querySelectorAll('.incident-card').forEach(card => {
    card.onclick = async () => {
      saveFormState();
      const yes = card.dataset.incident === 'yes';
      const wasIncident = state.isIncident;
      state.isIncident = yes;

      if (!yes) {
        state.incidentType = 'none';
        state.alertBroadcasted = false;
      } else if (!wasIncident && !state.alertBroadcasted) {
        state.alertBroadcasted = true;
        try {
          await broadcastIncidentAlert({
            patientName: state.patientName || '',
            patientId: state.patientId || null,
            visitId: null,
          });
        } catch (e) {
          console.error('[Alert] Broadcast failed:', e);
        }
      }

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
      if (!key) return;
      const loc = INJURY_MAP[key];
      if (!loc) {
        toast(`ناحیه "${key}" در دیتابیس تعریف نشده`, 'warning');
        return;
      }
      saveFormState();
      const idx = state.selectedInjuries.findIndex(x => x.id === loc.id);
      if (idx >= 0) state.selectedInjuries.splice(idx, 1);
      else state.selectedInjuries.push(loc);
      beep();
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
    const el = $(id); if (el) el.onchange = () => { calcGCS(); saveFormState(); };
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
    const el = $(id); if (el) el.oninput = () => { calcBMI(); saveFormState(); };
  });
  ['vHR','vSpo2','vBP','vTemp','vSugar','vRR'].forEach(id => {
    const el = $(id); if (el) el.addEventListener('input', saveFormState);
  });
  ['vSymptomTime','vIncidentTime','vCompanionName','vCompanionPhone'].forEach(id => {
    const el = $(id); if (el) el.addEventListener('input', saveFormState);
  });
  ['vAdmitted','vCompanionNeeded'].forEach(id => {
    const el = $(id); if (el) el.addEventListener('change', () => { saveFormState(); mountBannerInWizard(); });
  });

  const dateEl = $('vDate'); if (dateEl) dateEl.addEventListener('input', saveFormState);
  const incLocEl = $('vIncidentLocation'); if (incLocEl) incLocEl.addEventListener('input', saveFormState);
  const incDescEl = $('vIncidentDesc'); if (incDescEl) incDescEl.addEventListener('input', saveFormState);

  renderQuickList('quickDrugsList', d => !isConsumableDrug(d), 'drug');
  renderQuickList('quickConsumablesList', d => isConsumableDrug(d), 'consumable');
  renderItems();
  renderConsumables();

  const toggleEdit = $('toggleEditDrugs');
  if (toggleEdit) toggleEdit.onclick = () => {
    state.editDrugMode = !state.editDrugMode;
    toggleEdit.classList.toggle('active', state.editDrugMode);
    toggleEdit.textContent = state.editDrugMode ? '✖ انصراف' : '✏️ ویرایش';
    $('saveEditDrugs').style.display = state.editDrugMode ? 'inline-block' : 'none';
    renderQuickList('quickDrugsList', d => !isConsumableDrug(d), 'drug');
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
      renderQuickList('quickDrugsList', d => !isConsumableDrug(d), 'drug');
    } catch (e) { toast('خطا: ' + e.message, 'danger'); }
  };

  ['quickDrugsList', 'quickConsumablesList'].forEach(boxId => {
    const qdList = $(boxId);
    if (qdList && !qdList.dataset.bound) {
      qdList.dataset.bound = '1';
      qdList.addEventListener('click', e => {
        const btn = e.target.closest('[data-quick-drug]');
        if (!btn) return;
        e.preventDefault();
        const drugId = parseInt(btn.dataset.quickDrug);
        const action = btn.dataset.action;
        const type = btn.dataset.quickType || 'drug';
        if (state.editDrugMode && action) handleEditAction(action, drugId);
        else if (!state.editDrugMode) {
          const name = btn.dataset.quickName;
          if (name) addQuickItem(drugId, name, type);
        }
      });
    }
  });

  const addBtn = $('vAddDrug');
  if (addBtn) addBtn.onclick = () => openItemSearchModal(false);
  const addConsBtn = $('vAddConsumable');
  if (addConsBtn) addConsBtn.onclick = () => openItemSearchModal(true);
  const fabAdd = $('vFabAdd');
  if (fabAdd) fabAdd.onclick = () => openItemSearchModal(state.step === 6);

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

  const consList = $('vConsumablesList');
  if (consList && !consList.dataset.bound) {
    consList.dataset.bound = '1';
    consList.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      const i = parseInt(btn.dataset.i);
      if (btn.dataset.action === 'remove') { state.items.splice(i, 1); renderConsumables(); }
      else if (btn.dataset.action === 'inc') { state.items[i].quantity++; renderConsumables(); }
      else if (btn.dataset.action === 'dec') { if (state.items[i].quantity > 1) state.items[i].quantity--; renderConsumables(); }
    });
    consList.addEventListener('input', e => {
      const qty = e.target.closest('[data-item-qty]');
      const notes = e.target.closest('[data-item-notes]');
      if (qty) { const i = +qty.dataset.itemQty; state.items[i].quantity = Math.max(1, parseInt(qty.value) || 1); }
      if (notes) { const i = +notes.dataset.itemNotes; state.items[i].notes = notes.value; }
    });
  }

  const treatmentSel = $('vTreatment');
  if (treatmentSel) treatmentSel.onchange = e => {
    state.formData.treatmentId = e.target.value;
    const dispatch = isDispatch(e.target.value);
    const referral = isReferral(e.target.value);
    const dispatchSection = $('vDispatchSection');
    const transportWrap = $('vTransportTypeWrap');
    const companionWrap = $('vCompanionWrap');

    if (dispatch || referral) {
      dispatchSection?.classList.remove('hidden');
      const dt = $('vDispatchTime');
      if (dt && !dt.value) {
        const now = new Date();
        dt.value = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
        state.formData.dispatchTime = dt.value;
      }
    } else {
      dispatchSection?.classList.add('hidden');
    }

    if (transportWrap) transportWrap.classList.toggle('hidden', !referral);
    if (companionWrap) companionWrap.classList.toggle('hidden', !(dispatch || referral));

    if (dispatch) {
      state.formData.vTransportType = 'ambulance';
    } else if (!referral) {
      state.formData.vTransportType = '';
    }

    saveFormState();
    mountBannerInWizard();
  };

  const dtEl = $('vDispatchTime'); if (dtEl) dtEl.addEventListener('input', saveFormState);
  const ddEl = $('vDispatchDest'); if (ddEl) ddEl.addEventListener('input', saveFormState);
  const ttEl = $('vTransportType'); if (ttEl) ttEl.addEventListener('change', saveFormState);
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
    if (state.step < 7) {
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
// مودال ثبت سریع بیمار
// ═══════════════════════════════════════════════════════
function openQuickPatientModal() {
  const existing = $('quickPatientModal');
  if (existing) existing.remove();

  const modalHtml = `
    <div class="modal fade" id="quickPatientModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">ثبت سریع بیمار جدید</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-2"><input type="text" id="qpFirstName" class="form-control" placeholder="نام *"></div>
            <div class="mb-2"><input type="text" id="qpLastName" class="form-control" placeholder="نام خانوادگی *"></div>

            <div class="mb-3">
              <label class="form-label small">جنسیت *</label>
              <div class="row g-2">
                <div class="col-6">
                  <div class="gender-card" id="qpGenderMale" data-gender="male">
                    <div style="font-size:1.6rem;">👨</div>
                    <div style="font-weight:700;">مرد</div>
                  </div>
                </div>
                <div class="col-6">
                  <div class="gender-card" id="qpGenderFemale" data-gender="female">
                    <div style="font-size:1.6rem;">👩</div>
                    <div style="font-weight:700;">زن</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="mb-2"><input type="text" id="qpNationalCode" class="form-control" placeholder="کد ملی (۱۰ رقم)" inputmode="numeric" dir="ltr"></div>
            <div class="mb-2"><input type="text" id="qpPassportNumber" class="form-control" placeholder="شماره پاسپورت" dir="ltr"></div>
            <div class="mb-2"><input type="text" id="qpPersonnelCode" class="form-control" placeholder="کد پرسنلی" dir="ltr"></div>
            <div class="mb-2"><input type="text" id="qpCompanyName" class="form-control" placeholder="نام شرکت"></div>
            <div class="mb-2"><input type="text" id="qpDateOfBirth" class="form-control" placeholder="تاریخ تولد (مثال: 1370/01/15)" dir="ltr"></div>
            <div class="mb-2"><input type="text" id="qpWorkUnit" class="form-control" placeholder="واحد کاری (اختیاری)" list="workUnitListModal"></div>
            <div class="mb-2"><input type="text" id="qpBirthPlace" class="form-control" placeholder="محل تولد (اختیاری)"></div>
            <datalist id="workUnitListModal"></datalist>
            <div id="qpError" class="text-danger small mt-2" style="min-height:18px;"></div>
            <div class="alert alert-info small mt-2 mb-0">
              ℹ️ فیلدهای ستاره‌دار الزامی هستند.
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">انصراف</button>
            <button type="button" class="btn btn-primary" id="btnSaveQuickPatient">ثبت بیمار</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  if (!document.getElementById('genderCardStyle')) {
    const style = document.createElement('style');
    style.id = 'genderCardStyle';
    style.textContent = `
      .gender-card {
        padding: 12px 8px; text-align: center;
        border: 2px solid #e2e8f0; border-radius: 12px;
        background: #fff; cursor: pointer; transition: all 0.15s;
      }
      .gender-card:active { transform: scale(0.97); }
      .gender-card.selected {
        border-color: #0d6efd; background: #e0eaff;
        box-shadow: 0 4px 12px rgba(13,110,253,0.2);
      }
    `;
    document.head.appendChild(style);
  }

  const modalEl = $('quickPatientModal');
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());

  let selectedGender = null;
  const maleCard = $('qpGenderMale');
  const femaleCard = $('qpGenderFemale');
  const errEl = $('qpError');

  maleCard.onclick = () => {
    selectedGender = 'male';
    maleCard.classList.add('selected');
    femaleCard.classList.remove('selected');
    errEl.textContent = '';
  };
  femaleCard.onclick = () => {
    selectedGender = 'female';
    femaleCard.classList.add('selected');
    maleCard.classList.remove('selected');
    errEl.textContent = '';
  };

  $('btnSaveQuickPatient').onclick = async () => {
    const firstName    = $('qpFirstName').value.trim();
    const lastName     = $('qpLastName').value.trim();
    const nationalCode = faToEn($('qpNationalCode').value.trim());
    const passportNo   = $('qpPassportNumber').value.trim();
    const personnelNo  = $('qpPersonnelCode').value.trim();
    const companyName  = $('qpCompanyName').value.trim();
    const dobInput     = faToEn($('qpDateOfBirth').value.trim());
    const workUnit     = $('qpWorkUnit').value.trim();
    const birthPlace   = $('qpBirthPlace').value.trim();
    errEl.textContent  = '';

    if (!firstName || !lastName) { errEl.textContent = '❌ نام و نام خانوادگی الزامی است.'; return; }
    if (!selectedGender) { errEl.textContent = '❌ جنسیت را انتخاب کنید.'; return; }
    if (!nationalCode && !passportNo) { errEl.textContent = '❌ کد ملی یا شماره پاسپورت الزامی است.'; return; }
    if (nationalCode) {
      if (nationalCode.length !== 10 || !/^\d+$/.test(nationalCode)) {
        errEl.textContent = '❌ کد ملی باید ۱۰ رقم عددی باشد.'; return;
      }
      const { data: dup } = await sb.from('core_patient').select('id').eq('national_code', nationalCode).limit(1);
      if (dup?.length) { errEl.textContent = '❌ این کد ملی قبلاً ثبت شده است.'; return; }
    }
    if (personnelNo) {
      const { data: dupP } = await sb.from('core_patient').select('id').eq('personnel_number', personnelNo).limit(1);
      if (dupP?.length) { errEl.textContent = '❌ این کد پرسنلی قبلاً ثبت شده است.'; return; }
    }

    const btn = $('btnSaveQuickPatient');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ذخیره...';

    try {
      let companyId = null;
      if (companyName) {
        const { data: existC } = await sb.from('core_company').select('id').eq('name', companyName).limit(1);
        if (existC?.length) companyId = existC[0].id;
        else {
          const { data: newC } = await sb.from('core_company').insert({ name: companyName }).select().single();
          companyId = newC?.id;
        }
      }

      const payload = {
        first_name: firstName,
        last_name: lastName,
        gender: selectedGender === 'male' ? 'm' : 'f', 
        is_foreign_national: !!passportNo && !nationalCode,
        national_code: nationalCode || null,
        personnel_number: personnelNo || null,
        company_id: companyId,
        registered_at: new Date().toISOString(),
        allergies: '',
        medical_history: '',
        is_approved: false,
        is_monitored: false
      };

      if (passportNo) payload.passport_number = passportNo;
      if (dobInput) {
        const g = jalaliToGregorian(dobInput);
        if (g) payload.date_of_birth = g;
      }

      const { data: newPatient, error } = await sb.from('core_patient').insert(payload).select().single();
      if (error) throw error;

      if (workUnit || birthPlace) {
        try {
          await savePatientExtra(newPatient.id, {
            work_unit: workUnit || undefined,
            birth_place: birthPlace || undefined
          });
        } catch (e) {
          console.warn('savePatientExtra failed', e);
          toast('اطلاعات تکمیلی بیمار ذخیره نشد', 'warning');
        }
      }

      const fullName = `${firstName} ${lastName}`;
      toast(`✅ بیمار "${fullName}" ثبت شد`, 'success');
      beep();
      modal.hide();
      
      state.patientId = newPatient.id;
      state.patientName = fullName;
      
      await loadPatientHistory(newPatient.id);
      
      state.step = 2;
      if (state.step > state.maxStep) state.maxStep = state.step;
      renderWizard();
    } catch (e) {
      console.error(e);
      errEl.textContent = '❌ ' + (e.message || 'خطا در ذخیره بیمار');
      btn.disabled = false;
      btn.innerHTML = 'ثبت بیمار';
    }
  };
}

// ═══════════════════════════════════════════════════════
// مودال تکمیل کد ملی (اصلاح شده با اعتبارسنجی دقیق)
// ═══════════════════════════════════════════════════════
function openNationalCodeFixModal(patient) {
  const existing = $('fixNationalCodeModal');
  if (existing) existing.remove();

  const fullName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim();
  
  // استفاده از data-bs-backdrop="static" برای جلوگیری از بسته شدن با کلیک بیرون
  const modalHtml = `
    <div class="modal fade" id="fixNationalCodeModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header" style="background:#fef3c7;">
            <h5 class="modal-title" style="color:#92400e;">⚠️ تکمیل اطلاعات هویتی الزامی</h5>
          </div>
          <div class="modal-body">
            <p class="text-muted small mb-3">
              برای ثبت ویزیت، ابتدا باید کد ملی (۱۰ رقم) یا شماره پاسپورت بیمار را ثبت کنید.
            </p>
            <div class="mb-2">
              <label class="form-label small">نام بیمار</label>
              <input type="text" class="form-control" value="${escapeHtml(fullName)}" disabled>
            </div>
            <div class="mb-2">
              <label class="form-label small">کد ملی (۱۰ رقم) *</label>
              <input type="text" id="fixNationalCode" class="form-control" inputmode="numeric" dir="ltr" placeholder="مثال: 1234567890" maxlength="10">
            </div>
            <div class="mb-2 text-center text-muted small">— یا —</div>
            <div class="mb-2">
              <label class="form-label small">شماره پاسپورت (برای اتباع خارجی)</label>
              <input type="text" id="fixPassportNumber" class="form-control" dir="ltr" placeholder="مثال: X1234567">
            </div>
            <div id="fixError" class="text-danger small mt-2" style="min-height:18px;"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="btnCancelFix">انصراف</button>
            <button type="button" class="btn btn-primary" id="btnSaveFix">ذخیره و ادامه</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modalEl = $('fixNationalCodeModal');
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  
  modalEl.addEventListener('hidden.bs.modal', () => {
    modalEl.remove();
    // اگر کاربر انصراف داد و بیمار انتخاب نشده، صفحه را رفرش کن تا در مرحله ۱ بماند
    if (!state.patientId) {
      renderWizard();
    }
  });

  $('btnSaveFix').onclick = async () => {
    const nc = faToEn($('fixNationalCode').value.trim());
    const pp = $('fixPassportNumber').value.trim();
    const errEl = $('fixError');
    errEl.textContent = '';

    if (!nc && !pp) { errEl.textContent = '❌ وارد کردن کد ملی یا شماره پاسپورت الزامی است.'; return; }
    
    if (nc) {
      // اعتبارسنجی ۱۰ رقم برای کد ملی ایران
      if (nc.length !== 10 || !/^\d+$/.test(nc)) { 
        errEl.textContent = '❌ کد ملی باید دقیقاً ۱۰ رقم عددی باشد.'; 
        return; 
      }
      
      // چک تکراری نبودن کد ملی
      const { data: dup } = await sb.from('core_patient').select('id').eq('national_code', nc).neq('id', patient.id).limit(1);
      if (dup?.length) { errEl.textContent = '❌ این کد ملی قبلاً برای بیمار دیگری ثبت شده است.'; return; }
    }

    if (pp && pp.length < 5) {
      errEl.textContent = '❌ شماره پاسپورت معتبر نیست (حداقل ۵ کاراکتر).'; 
      return;
    }

    const btn = $('btnSaveFix');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ذخیره...';

    try {
      const update = {};
      if (nc) update.national_code = nc;
      if (pp) update.passport_number = pp;
      update.is_foreign_national = !!pp && !nc;

      const { error } = await sb.from('core_patient').update(update).eq('id', patient.id);
      if (error) throw error;

      toast('✅ اطلاعات هویتی با موفقیت ذخیره شد', 'success');
      beep();
      modal.hide();

      // هدایت به مرحله ۲
      state.patientId = patient.id;
      state.patientName = fullName;
      
      await loadPatientHistory(patient.id);
      
      state.step = 2;
      if (state.step > state.maxStep) state.maxStep = state.step;
      renderWizard();
      
    } catch (e) {
      console.error(e);
      errEl.textContent = '❌ ' + (e.message || 'خطا در ذخیره');
      btn.disabled = false;
      btn.innerHTML = 'ذخیره و ادامه';
    }
  };
}

// ═══════════════════════════════════════════════════════
// جستجوها
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

  q = faToEn(q);
  if (!q || q.length < 2) { box.innerHTML = '<div class="text-center muted small py-2">حداقل ۲ حرف</div>'; return; }
  box.innerHTML = '<div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div></div>';

  const { data } = await sb.from('core_patient')
    .select('id, first_name, last_name, national_code, passport_number, personnel_number')
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,national_code.ilike.%${q}%,personnel_number.ilike.%${q}%`)
    .limit(20);
  if (!data?.length) { box.innerHTML = '<div class="text-center muted small py-2">یافت نشد</div>'; return; }

  box.innerHTML = data.map(p => {
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
    const meta = [p.national_code, p.personnel_number].filter(Boolean).join(' | ');
    return `
      <button type="button" class="btn btn-light w-100 text-end mb-1 py-2"
        data-pick-patient="${p.id}"
        data-patient-name="${escapeHtml(name)}"
        data-patient-meta="${escapeHtml(meta)}"
        data-patient-national="${escapeHtml(p.national_code || '')}"
        data-patient-passport="${escapeHtml(p.passport_number || '')}"
        style="border:1px solid #e2e8f0;border-radius:10px;">
        <strong>${escapeHtml(name)}</strong>
        ${meta ? `<br><small class="muted" dir="ltr">${escapeHtml(meta)}</small>` : ''}
      </button>`;
  }).join('');
}

async function pickPatient(id, name, nationalCode, passportNumber) {
  if (!id) return;
  
  const hasNational = (nationalCode || '').trim();
  const hasPassport = (passportNumber || '').trim();

  // ⛔ اگر بیمار کد ملی و پاسپورت ندارد، متوقف شو و مودال را باز کن
  if (!hasNational && !hasPassport) {
    sb.from('core_patient').select('*').eq('id', id).single().then(({ data }) => {
      if (data) openNationalCodeFixModal(data);
      else toast('بیمار یافت نشد', 'danger');
    });
    return; 
  }

  state.patientId = id;
  state.patientName = name;
  
  await loadPatientHistory(id);
  
  state.step = 2;
  if (state.step > state.maxStep) state.maxStep = state.step;
  renderWizard();
  setTimeout(() => toast(`بیمار "${name}" انتخاب شد`, 'success'), 100);
  beep();

  loadPatientExtra(id).then(({ data: pe }) => {
    const wrap = $('vPatientWorkUnitWrap');
    const input = $('vPatientWorkUnit');
    if (!wrap || !input) return;
    if (!pe?.work_unit) {
      wrap.classList.remove('hidden');
      sb.from('patient_extra').select('work_unit').not('work_unit', 'is', null).limit(200).then(({ data }) => {
        const dl = $('workUnitList');
        if (!dl || !data) return;
        const unique = [...new Set(data.map(r => r.work_unit).filter(Boolean))];
        dl.innerHTML = unique.map(u => `<option value="${escapeHtml(u)}">`).join('');
      });
    } else {
      input.value = pe.work_unit;
      wrap.classList.remove('hidden');
    }
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════
// Quick Lists
// ═══════════════════════════════════════════════════════
function renderQuickList(boxId, filterFn, type) {
  const box = $(boxId);
  if (!box) return;
  let sorted = [...state.quickDrugs].filter(filterFn);
  if (state.drugPrefs.order?.length) {
    const map = {};
    state.drugPrefs.order.forEach((id, idx) => map[id] = idx);
    sorted.sort((a,b) => (map[a.id] ?? 9999) - (map[b.id] ?? 9999));
  }
  if (!sorted.length) {
    box.innerHTML = '<span class="muted small">موردی موجود نیست</span>';
    return;
  }
  box.innerHTML = sorted.map(d => {
    const hidden = (state.drugPrefs.hidden || []).includes(d.id);
    const cls = state.editDrugMode ? `edit-mode ${hidden ? 'hidden-drug' : ''}` : (hidden ? 'hidden' : '');
    if (state.editDrugMode && type === 'drug') {
      return `<div class="quick-drug-btn ${cls}">
        <span style="margin-left:5px;">${d.icon || '💊'}</span>${escapeHtml(d.name)}
        <span class="btn-edit-action" data-action="up" data-quick-drug="${d.id}">▲</span>
        <span class="btn-edit-action" data-action="down" data-quick-drug="${d.id}">▼</span>
        <span class="btn-edit-action danger" data-action="toggle" data-quick-drug="${d.id}">${hidden ? '👁' : '❌'}</span>
      </div>`;
    }
    return `<button type="button" class="quick-drug-btn"
      data-quick-drug="${d.id}"
      data-quick-name="${escapeHtml(d.name)}"
      data-quick-type="${type}">
      <span style="margin-left:6px;">${d.icon || (type === 'consumable' ? '🩹' : '💊')}</span>${escapeHtml(d.name)}</button>`;
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
  renderQuickList('quickDrugsList', d => !isConsumableDrug(d), 'drug');
}

function addQuickItem(id, name, type = 'drug') {
  const existing = state.items.find(i => i.drug_id === id && (i.type || 'drug') === type);
  if (existing) existing.quantity++;
  else state.items.push({ drug_id: id, drug_name: name, quantity: 1, notes: '', type });
  if (type === 'consumable') renderConsumables();
  else renderItems();
  beep();
}

async function openItemSearchModal(isConsumable) {
  const modalId = 'itemSearchModal';
  const existing = $(modalId);
  if (existing) existing.remove();

  const title = isConsumable ? 'جستجوی لوازم مصرفی' : 'جستجوی دارو';
  const color = isConsumable ? '#0891b2' : '#198754';

  const modalHtml = `
    <div class="modal fade" id="${modalId}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header" style="background:${color};color:#fff;">
            <h5 class="modal-title">${title}</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="text" id="itemSearchInput" class="form-control mb-3"
              placeholder="تایپ کنید..." autocomplete="off" dir="auto">
            <div id="itemSearchResults" style="max-height:50vh;overflow-y:auto;"></div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modalEl = $(modalId);
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());

  const input = $('itemSearchInput');
  const results = $('itemSearchResults');

  const doSearch = async (term) => {
    term = faToEn(term || '').trim();
    results.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></div>';
    try {
      let q = sb.from('drugs_drug').select('id, name, form, generic_name');
      if (isConsumable) q = q.eq('form', 'other');
      else q = q.neq('form', 'other');
      if (term.length >= 1) q = q.ilike('name', `%${term}%`);
      q = q.order('name').limit(30);
      const { data, error } = await q;
      if (error) throw error;
      if (!data?.length) {
        results.innerHTML = '<div class="text-center muted small py-3">یافت نشد</div>';
        return;
      }
      results.innerHTML = data.map(d => `
        <button type="button" class="btn btn-light w-100 text-end mb-1 py-2"
          data-pick-item="${d.id}" data-pick-name="${escapeHtml(d.name)}"
          style="border:1px solid #e2e8f0;border-radius:10px;">
          <strong>${escapeHtml(d.name)}</strong>
          ${d.generic_name ? `<br><small class="muted">${escapeHtml(d.generic_name)}</small>` : ''}
        </button>
      `).join('');
    } catch (e) {
      console.error(e);
      results.innerHTML = '<div class="text-center text-danger small py-3">خطا در جستجو</div>';
    }
  };

  let timer;
  input.addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => doSearch(e.target.value), 300);
  });

  results.addEventListener('click', e => {
    const btn = e.target.closest('[data-pick-item]');
    if (!btn) return;
    const id = parseInt(btn.dataset.pickItem);
    const name = btn.dataset.pickName;
    addQuickItem(id, name, isConsumable ? 'consumable' : 'drug');
    toast(`"${name}" اضافه شد`, 'success');
    modal.hide();
  });

  doSearch('');
  setTimeout(() => input.focus(), 300);
}

// ═══════════════════════════════════════════════════════
// Render Items
// ═══════════════════════════════════════════════════════
function renderItems() {
  const list = $('vItemsList');
  if (!list) return;
  const entries = state.items.map((it, idx) => ({ it, idx })).filter(x => (x.it.type || 'drug') === 'drug');
  if (!entries.length) {
    list.innerHTML = '<div class="text-center muted small py-3">دارویی اضافه نشده</div>';
    return;
  }
  list.innerHTML = entries.map(({ it, idx }) => `
    <div class="item-card">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <div class="name">${escapeHtml(it.drug_name)}</div>
        <button class="num-btn" style="width:34px;height:34px;" data-action="remove" data-i="${idx}">
          <i class="bi bi-trash text-danger"></i></button>
      </div>
      <div class="d-flex align-items-center gap-2 mb-2">
        <label class="muted small">تعداد:</label>
        <button class="num-btn" style="width:34px;height:34px;" data-action="dec" data-i="${idx}">−</button>
        <input type="number" class="form-control form-control-sm text-center" style="max-width:80px;"
          value="${it.quantity}" min="1" data-item-qty="${idx}">
        <button class="num-btn" style="width:34px;height:34px;" data-action="inc" data-i="${idx}">+</button>
      </div>
      <input type="text" class="form-control form-control-sm" placeholder="دستور مصرف..."
        value="${escapeHtml(it.notes)}" data-item-notes="${idx}">
    </div>
  `).join('');
}

function renderConsumables() {
  const list = $('vConsumablesList');
  if (!list) return;
  const entries = state.items.map((it, idx) => ({ it, idx })).filter(x => x.it.type === 'consumable');
  if (!entries.length) {
    list.innerHTML = '<div class="text-center muted small py-3">لوزام مصرفی اضافه نشده</div>';
    return;
  }
  list.innerHTML = entries.map(({ it, idx }) => `
    <div class="item-card" style="border-right-color:#0891b2;">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <div class="name">${escapeHtml(it.drug_name)}</div>
        <button class="num-btn" style="width:34px;height:34px;" data-action="remove" data-i="${idx}">
          <i class="bi bi-trash text-danger"></i></button>
      </div>
      <div class="d-flex align-items-center gap-2 mb-2">
        <label class="muted small">تعداد:</label>
        <button class="num-btn" style="width:34px;height:34px;" data-action="dec" data-i="${idx}">−</button>
        <input type="number" class="form-control form-control-sm text-center" style="max-width:80px;"
          value="${it.quantity}" min="1" data-item-qty="${idx}">
        <button class="num-btn" style="width:34px;height:34px;" data-action="inc" data-i="${idx}">+</button>
      </div>
      <input type="text" class="form-control form-control-sm" placeholder="توضیحات..."
        value="${escapeHtml(it.notes)}" data-item-notes="${idx}">
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
  if (!state.formData.treatmentId) { toast('نتیجه درمان را انتخاب کنید', 'warning'); state.step = 7; renderWizard(); return; }

  const btn = $('vSave');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ذخیره...'; }

  try {
    const fd = state.formData;
    const parts = fd.date.trim().split(' ');
    const greg = jalaliToGregorian(parts[0]);
    if (!greg) throw new Error('تاریخ نامعتبر');

    const now = new Date();
    const defaultTime = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    const timeOnly = parts[1] || defaultTime;
    const [rawH, rawM] = timeOnly.split(':').map(Number);
    const hh = Number.isFinite(rawH) ? rawH : now.getHours();
    const mm = Number.isFinite(rawM) ? rawM : now.getMinutes();
    const visitDate = new Date(`${greg}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`);

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
      d.setHours(dh || 0, dm || 0, 0, 0);
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
      assigned_to_id: myId,
      is_read: false,
    };

    const { data: visit, error: e1 } = await sb.from('visits_visit').insert(payload).select().single();
    if (e1) throw e1;

    if (state.items.length) {
      await sb.from('visits_visititem').insert(
        state.items.map(it => ({
          visit_id: visit.id,
          drug_id: it.drug_id,
          quantity: it.quantity,
          notes: it.notes || null
        }))
      );
    }

    if (state.selectedInjuries.length) {
      await sb.from('visits_visit_injury_locations').insert(
        state.selectedInjuries.map(i => ({ visit_id: visit.id, injurylocation_id: i.id }))
      );
    }

    await logChange(visit.id, 'create', [], 'ایجاد ویزیت');

    try {
      const vRR = $('vRR')?.value?.trim();
      const vSymptomTime = $('vSymptomTime')?.value;
      const vIncidentTime = $('vIncidentTime')?.value;
      const vAdmitted = $('vAdmitted')?.checked || false;
      const vTransportTypeEl = $('vTransportType');
      const vTransportType = vTransportTypeEl?.value || '';
      const vCompanionNeeded = $('vCompanionNeeded')?.checked || false;
      const vCompanionName = $('vCompanionName')?.value?.trim();
      const vCompanionPhone = $('vCompanionPhone')?.value?.trim();

      const treatmentId = fd.treatmentId;
      const dispatch = isDispatch(treatmentId);
      const referral = isReferral(treatmentId);

      const extra = {
        rr: vRR ? Number(vRR) : undefined,
        symptom_onset_at: vSymptomTime ? timeToIso(vSymptomTime, visitDate) : undefined,
        incident_at: vIncidentTime ? timeToIso(vIncidentTime, visitDate) : undefined,
        is_admitted: vAdmitted || undefined,
        transport_type: dispatch ? 'ambulance' : (referral ? vTransportType : undefined),
        companion_needed: vCompanionNeeded || undefined,
        companion_name: vCompanionName || undefined,
        companion_phone: vCompanionPhone || undefined
      };

      const hasExtra = Object.values(extra).some(v => v !== undefined && v !== false && v !== '');
      if (hasExtra) {
        try {
          await saveVisitExtra(visit.id, extra);
        } catch (e) {
          console.warn('visit_extra save failed', e);
          toast('اطلاعات تکمیلی ذخیره نشد', 'warning');
        }
      }
    } catch (extraErr) {
      console.warn('extra error', extraErr);
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
