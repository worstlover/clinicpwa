// js/modules/occupational.js
import { sb } from '../sb.js';
import { $, faNum, escapeHtml, gregorianToJalali, toast } from '../utils.js';
import { showScreen } from '../ui.js';
import { saveExamExtra, loadExamExtra } from './extra-data.js';
import { mountProcessBanner } from '../process/banner.js';

let state = {
  view: 'list', // 'list' | 'patient' | 'exam'
  patients: [],
  selectedPatient: null,
  selectedExam: null,
  examExtra: null,
  
  // فیلترها (از فایل قدیمی)
  query: '',
  filterKind: 'all',
  filterStatus: 'all'
};

// ═══════════════════════════════════════════════════════
// ورودی اصلی
// ═══════════════════════════════════════════════════════
export function openOccupational() {
  showScreen('Occupational');
  state.view = 'list';
  state.selectedPatient = null;
  state.selectedExam = null;
  renderList();
}

// ═══════════════════════════════════════════════════════
// نمای لیست کارگران (همراه با فیلترها)
// ═══════════════════════════════════════════════════════
async function renderList() {
  const c = $('occContent');
  if (!c) return;

  c.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="mb-0"><i class="bi bi-clipboard2-pulse text-primary"></i> مدیریت معاینات طب کار</h4>
    </div>

    <!-- 🌟 نوار فیلتر و جستجو (بازگردانده شده از فایل اول) -->
    <div class="card mb-3 border-0 shadow-sm">
      <div class="card-body p-3">
        <div class="row g-2">
          <div class="col-12 col-md-4">
            <div class="input-group">
              <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
              <input type="text" class="form-control" id="occSearch" placeholder="جستجوی نام یا کد ملی..." value="${escapeHtml(state.query)}">
            </div>
          </div>
          <div class="col-6 col-md-3">
            <select class="form-select" id="occFilterKind">
              <option value="all">همه انواع معاینه</option>
              <option value="pre_employment" ${state.filterKind === 'pre_employment' ? 'selected' : ''}>بدو استخدام</option>
              <option value="periodic" ${state.filterKind === 'periodic' ? 'selected' : ''}>دوره‌ای</option>
              <option value="return_to_work" ${state.filterKind === 'return_to_work' ? 'selected' : ''}>بازگشت به کار</option>
              <option value="job_change" ${state.filterKind === 'job_change' ? 'selected' : ''}>جابجایی شغلی</option>
            </select>
          </div>
          <div class="col-6 col-md-3">
            <select class="form-select" id="occFilterStatus">
              <option value="all">همه نتایج</option>
              <option value="full" ${state.filterStatus === 'full' ? 'selected' : ''}>صحت و سلامت کامل</option>
              <option value="relative" ${state.filterStatus === 'relative' ? 'selected' : ''}>سلامت نسبی</option>
              <option value="conditional" ${state.filterStatus === 'conditional' ? 'selected' : ''}>مشروط</option>
            </select>
          </div>
          <div class="col-12 col-md-2">
            <button class="btn btn-primary w-100" id="occApplyFilter"><i class="bi bi-funnel"></i> فیلتر</button>
          </div>
        </div>
      </div>
    </div>

    <div id="occPatientList">
      <div class="text-center py-5"><div class="spinner-border text-primary"></div></div>
    </div>
  `;

  $('occApplyFilter').onclick = () => {
    state.query = $('occSearch').value.trim();
    state.filterKind = $('occFilterKind').value;
    state.filterStatus = $('occFilterStatus').value;
    loadPatients();
  };
  
  $('occSearch').onkeydown = (e) => { 
    if (e.key === 'Enter') $('occApplyFilter').click(); 
  };

  await loadPatients();
}

// ═══════════════════════════════════════════════════════
// بارگذاری دیتا با اعمال فیلترها
// ═══════════════════════════════════════════════════════
async function loadPatients() {
  const list = $('occPatientList');
  if (!list) return;
  list.innerHTML = '<div class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

  try {
    // گرفتن تمام معاینات
    const { data, error } = await sb
      .from('lab_results_periodicexamination')
      .select(`
        id, exam_date, exam_type, final_opinion_text,
        patient:core_patient(id, first_name, last_name, national_code, personnel_number)
      `)
      .order('exam_date', { ascending: false });

    if (error) throw error;

    let exams = data || [];

    // ۱. اعمال فیلتر متنی (جستجو)
    if (state.query) {
      const ql = state.query.toLowerCase();
      exams = exams.filter(e => {
        const p = e.patient || {};
        const name = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
        const nc = String(p.national_code || '').toLowerCase();
        const pn = String(p.personnel_number || '').toLowerCase();
        return name.includes(ql) || nc.includes(ql) || pn.includes(ql);
      });
    }

    // ۲. اعمال فیلتر نوع معاینه
    if (state.filterKind !== 'all') {
      exams = exams.filter(e => e.exam_type === state.filterKind);
    }

    // ۳. اعمال فیلتر وضعیت (نتیجه)
    if (state.filterStatus !== 'all') {
      exams = exams.filter(e => {
        const op = e.final_opinion_text || '';
        if (state.filterStatus === 'full' && op.includes('کامل')) return true;
        if (state.filterStatus === 'relative' && op.includes('نسبی')) return true;
        if (state.filterStatus === 'conditional' && (op.includes('مشروط') || op.includes('شرط'))) return true;
        return false;
      });
    }

    // گروه‌بندی بر اساس بیمار
    const patientMap = new Map();
    exams.forEach(e => {
      if (!e.patient) return;
      const pid = e.patient.id;
      if (!patientMap.has(pid)) {
        patientMap.set(pid, { ...e.patient, exams: [], last_opinion: null });
      }
      const p = patientMap.get(pid);
      p.exams.push({
        id: e.id,
        exam_date: e.exam_date,
        exam_type: e.exam_type,
        final_opinion_text: e.final_opinion_text
      });
      if (!p.last_opinion && e.final_opinion_text) p.last_opinion = e.final_opinion_text;
    });

    state.patients = Array.from(patientMap.values());

    if (state.patients.length === 0) {
      list.innerHTML = '<div class="card text-center py-5 muted">موردی با این فیلترها یافت نشد.</div>';
      return;
    }

    // رندر لیست بیماران
    list.innerHTML = state.patients.map(p => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || '—';
      const lastExam = p.exams[0];
      const lastDate = lastExam?.exam_date ? gregorianToJalali(lastExam.exam_date) : '—';
      const opinion = p.last_opinion || '';

      let statusCls = 'gray';
      let statusText = 'بدون نظریه';
      if (opinion.includes('بلامانع') || opinion.includes('کامل')) { statusCls = 'success'; statusText = 'بلامانع'; }
      else if (opinion.includes('مشروط') || opinion.includes('شرط')) { statusCls = 'warning'; statusText = 'مشروط'; }
      else if (opinion.includes('عدم صلاحیت')) { statusCls = 'danger'; statusText = 'عدم صلاحیت'; }

      return `
        <div class="item-card" data-patient-id="${p.id}" style="cursor:pointer;border-right-color:#0ea5e9;">
          <div class="d-flex justify-content-between align-items-center">
            <div class="flex-grow-1">
              <div class="name">
                ${escapeHtml(name)}
                <span class="badge-soft ${statusCls}" style="font-size:0.65rem;margin-right:6px;">${statusText}</span>
              </div>
              <div class="meta">
                ${p.national_code ? `<i class="bi bi-person-vcard"></i> <span dir="ltr">${escapeHtml(p.national_code)}</span> ` : ''}
                ${p.personnel_number ? `| <i class="bi bi-hash"></i> <span dir="ltr">${escapeHtml(String(p.personnel_number))}</span>` : ''}
              </div>
              <div class="meta">
                <i class="bi bi-calendar3"></i> آخرین معاینه: ${lastDate}
                | <i class="bi bi-file-medical"></i> ${faNum(p.exams.length)} معاینه
              </div>
            </div>
            <i class="bi bi-chevron-left" style="font-size:1.5rem;color:#94a3b8;"></i>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-patient-id]').forEach(el => {
      el.onclick = () => {
        const pid = parseInt(el.dataset.patientId);
        const patient = state.patients.find(x => x.id === pid);
        if (patient) openPatient(patient);
      };
    });

  } catch (e) {
    console.error(e);
    list.innerHTML = `<div class="alert alert-danger">خطا در بارگذاری: ${escapeHtml(e.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════
// نمای لیست معاینات یک بیمار
// ═══════════════════════════════════════════════════════
function openPatient(patient) {
  state.selectedPatient = patient;
  state.view = 'patient';
  renderPatient();
}

function renderPatient() {
  const p = state.selectedPatient;
  const c = $('occContent');
  const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();

  c.innerHTML = `
    <div class="card mb-3 border-0 shadow-sm">
      <div class="card-head" style="background:linear-gradient(135deg,#0ea5e9,#0284c7);">
        <i class="bi bi-person-badge"></i> پرونده طب کار: ${escapeHtml(name)}
      </div>
      <div class="card-body">
        <div class="row-item d-flex justify-content-between">
          <span class="muted">کد ملی</span>
          <span dir="ltr">${escapeHtml(p.national_code || '—')}</span>
        </div>
        <div class="row-item d-flex justify-content-between">
          <span class="muted">شماره پرسنلی</span>
          <span dir="ltr">${escapeHtml(String(p.personnel_number || '—'))}</span>
        </div>
        <div class="row-item d-flex justify-content-between">
          <span class="muted">تعداد کل معاینات</span>
          <span>${faNum(p.exams.length)}</span>
        </div>
      </div>
    </div>

    <div class="section-title"><span>تاریخچه معاینات</span></div>
    <div id="occExamList">
      ${p.exams.map(e => {
        const jd = gregorianToJalali(e.exam_date);
        const opinion = e.final_opinion_text || '';
        let statusCls = 'gray';
        let statusText = 'بدون نظریه';
        if (opinion.includes('بلامانع') || opinion.includes('کامل')) { statusCls = 'success'; statusText = 'بلامانع'; }
        else if (opinion.includes('مشروط') || opinion.includes('شرط')) { statusCls = 'warning'; statusText = 'مشروط'; }
        else if (opinion.includes('عدم صلاحیت')) { statusCls = 'danger'; statusText = 'عدم صلاحیت'; }

        return `
          <div class="card mb-2 border-0 shadow-sm">
            <div class="card-body p-3">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div class="fw-bold">
                  ${jd}
                  <span class="badge-soft ${statusCls}" style="font-size:0.65rem;margin-right:6px;">${statusText}</span>
                </div>
                <div class="small text-muted">${e.exam_type === 'pre_employment' ? 'بدو ورود' : e.exam_type === 'periodic' ? 'دوره‌ای' : e.exam_type || 'نامشخص'}</div>
              </div>
              
              <!-- 🌟 دکمه‌های عملیات (جدید + قدیمی) -->
              <div class="d-flex gap-2 mt-3">
                <button class="btn btn-sm btn-primary flex-grow-1" onclick="window._openExam(${e.id})">
                  <i class="bi bi-eye"></i> مشاهده جزئیات
                </button>
                <button class="btn btn-sm btn-outline-warning flex-grow-1" onclick="window._openCorrectiveAction(${e.id}, ${p.id})">
                  <i class="bi bi-tools"></i> اقدام اصلاحی
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <div class="d-grid gap-2 mt-4 mb-4">
      <button class="btn btn-outline-secondary" id="occBackToWorkers">
        <i class="bi bi-arrow-right"></i> بازگشت به لیست کارگران
      </button>
    </div>
  `;

  window._openExam = (eid) => {
    const exam = p.exams.find(x => x.id === eid);
    if (exam) openExam(exam);
  };

  window._openCorrectiveAction = (examId, patientId) => {
    openCorrectiveActionModal(examId, patientId);
  };

  const backBtn = $('occBackToWorkers');
  if (backBtn) backBtn.onclick = () => { state.view = 'list'; renderList(); };
}

// ═══════════════════════════════════════════════════════
// جزئیات کامل معاینه (از فایل دوم)
// ═══════════════════════════════════════════════════════
async function openExam(examSummary) {
  state.view = 'exam';
  const c = $('occContent');
  c.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

  try {
    const examId = examSummary.id;

    const { data: exam } = await sb.from('lab_results_periodicexamination')
      .select('*').eq('id', examId).single();

    const [
      { data: clinical },
      { data: labs },
      { data: details },
      { data: optometry },
      { data: audiometry },
      { data: spirometry },
      { data: ecg },
      { data: sonography }
    ] = await Promise.all([
      sb.from('lab_results_clinicalmeasurement').select('*').eq('periodic_exam_id', examId).maybeSingle(),
      sb.from('lab_results_labparameterresult').select('result_value, test_type:lab_results_testtype(name)').eq('periodic_exam_id', examId),
      sb.from('lab_results_examinationdetail').select('*').eq('periodic_exam_id', examId),
      sb.from('lab_results_optometryresult').select('*').eq('periodic_exam_id', examId).maybeSingle(),
      sb.from('lab_results_audiometryresult').select('*').eq('periodic_exam_id', examId).maybeSingle(),
      sb.from('lab_results_spirometryresult').select('*').eq('periodic_exam_id', examId).maybeSingle(),
      sb.from('lab_results_ecgresult').select('*').eq('periodic_exam_id', examId).maybeSingle(),
      sb.from('lab_results_sonographyresult').select('*').eq('periodic_exam_id', examId).maybeSingle()
    ]);

    let examExtra = null;
    try {
      const { data } = await loadExamExtra(examId);
      examExtra = data || {};
    } catch (e) {
      console.warn('loadExamExtra failed', e);
      examExtra = {};
    }

    state.selectedExam = { exam, clinical, labs, details, optometry, audiometry, spirometry, ecg, sonography };
    state.examExtra = examExtra;
    renderExam();
  } catch (e) {
    console.error(e);
    c.innerHTML = `<div class="alert alert-danger">خطا: ${escapeHtml(e.message)}</div>`;
  }
}

function renderExam() {
  const s = state.selectedExam;
  const e = s.exam;
  const exExtra = state.examExtra || {};
  const c = $('occContent');
  const jd = e.exam_date ? gregorianToJalali(e.exam_date) : '—';
  const patient = state.selectedPatient;

  const LAB_HINT_MAP = {
    CHO: { id: 1, name: 'Cholesterol' },
    TG:  { id: 2, name: 'Triglycerides' },
    SGOT:{ id: 8, name: 'AST' },
    SGPT:{ id: 9, name: 'ALT' },
    FBS: { id: 6, name: 'FBS' },
    ALK: null
  };

  const labValueByName = {};
  (s.labs || []).forEach(l => {
    const n = (l.test_type?.name || '').trim();
    if (n) labValueByName[n] = l.result_value;
  });

  const getLabHint = (key) => {
    const meta = LAB_HINT_MAP[key];
    if (!meta) return '—';
    const found = Object.keys(labValueByName).find(n =>
      n.toLowerCase().includes(meta.name.toLowerCase())
    );
    return found ? labValueByName[found] : '—';
  };

  const flaggedArr = Array.isArray(exExtra.flagged_tests) ? exExtra.flagged_tests : [];
  const recsArr = Array.isArray(exExtra.recommendations) ? exExtra.recommendations : [];

  const _formButtonsHtml = `
    <div class="card mb-3" style="border:2px solid #10b981;">
      <div class="card-head" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;">
        <i class="bi bi-file-earmark-plus"></i> فرم‌های مرتبط
      </div>
      <div class="card-body">
        <div class="d-grid gap-2">
          <button type="button" class="btn btn-outline-primary" data-form-open="BR-FR-HS-48-00">
            <i class="bi bi-send"></i> فرم ارجاع به متخصص
          </button>
          <button type="button" class="btn btn-outline-success" data-form-open="BR-FR-HS-49-00">
            <i class="bi bi-clipboard2-check"></i> فرم اعلام نتایج معاینات طب کار
          </button>
          <button type="button" class="btn btn-outline-warning" data-form-open="BR-FR-HS-50-00">
            <i class="bi bi-file-earmark-text"></i> فرم تعهدنامه شروع به کار
          </button>
        </div>
      </div>
    </div>
  `;

  let html = `<div id="occBannerMount"></div>` + _formButtonsHtml;

  html += `
    <div class="card mb-3 border-0 shadow-sm">
      <div class="card-head" style="background:linear-gradient(135deg,#0ea5e9,#0284c7);">
        <i class="bi bi-file-medical"></i> معاینه ${jd}
      </div>
      <div class="card-body">
        <div class="row-item d-flex justify-content-between">
          <span class="muted">نوع معاینه</span>
          <span>${e.exam_type === 'pre_employment' ? 'بدو ورود' : e.exam_type === 'periodic' ? 'دوره‌ای' : e.exam_type || 'نامشخص'}</span>
        </div>
        ${e.admission_date ? `<div class="row-item d-flex justify-content-between">
          <span class="muted">تاریخ پذیرش</span>
          <span>${gregorianToJalali(e.admission_date)}</span>
        </div>` : ''}
      </div>
    </div>
  `;

  // 🌟 دکمه اقدام اصلاحی در بالای صفحه جزئیات هم قرار داده شد
  html += `
    <div class="card mb-3" style="border:2px solid #f59e0b;">
      <div class="card-head" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;">
        <i class="bi bi-tools"></i> اقدامات اصلاحی
      </div>
      <div class="card-body text-center">
        <p class="small text-muted mb-2">مدیریت اقدامات اصلاحی و مشاهده تاریخچه تغییرات این معاینه</p>
        <button class="btn btn-warning w-100" onclick="window._openCorrectiveAction(${e.id}, ${patient?.id || 'null'})">
          <i class="bi bi-gear"></i> ثبت / مشاهده اقدام اصلاحی
        </button>
      </div>
    </div>
  `;

  html += `
    <div class="card mb-3" style="border:2px solid #0ea5e9;">
      <div class="card-head" style="background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff;">
        <i class="bi bi-clipboard2-plus"></i> اطلاعات تکمیلی برای فرم‌ها
      </div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-12 col-md-6">
            <label class="form-label small">نوع معاینه</label>
            <select class="form-select" id="examKind">
              <option value="">—</option>
              <option value="pre_employment" ${exExtra.exam_kind === 'pre_employment' ? 'selected' : ''}>بدو استخدام</option>
              <option value="periodic" ${exExtra.exam_kind === 'periodic' ? 'selected' : ''}>دوره‌ای</option>
              <option value="return_to_work" ${exExtra.exam_kind === 'return_to_work' ? 'selected' : ''}>بازگشت به کار</option>
              <option value="job_change" ${exExtra.exam_kind === 'job_change' ? 'selected' : ''}>جابجایی شغلی</option>
            </select>
          </div>
          <div class="col-12 col-md-6">
            <label class="form-label small">نتیجه معاینه</label>
            <select class="form-select" id="healthStatus">
              <option value="">—</option>
              <option value="full" ${exExtra.health_status === 'full' ? 'selected' : ''}>صحت و سلامت کامل</option>
              <option value="relative" ${exExtra.health_status === 'relative' ? 'selected' : ''}>سلامت نسبی</option>
              <option value="conditional" ${exExtra.health_status === 'conditional' ? 'selected' : ''}>مشروط</option>
            </select>
          </div>

          <div class="col-12">
            <label class="form-label small mb-2">شرح معاینات (چک‌باکس)</label>
            <div class="row g-2">
              ${['CHO','TG','SGOT','SGPT','ALK','FBS'].map(k => `
                <div class="col-6 col-md-4">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" value="${k}" id="ft_${k}" ${flaggedArr.includes(k) ? 'checked' : ''}>
                    <label class="form-check-label small" for="ft_${k}">
                      ${k}
                      <small class="text-muted">(مقدار: ${escapeHtml(String(getLabHint(k)))} )</small>
                    </label>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="col-12">
            <label class="form-label small">سایر موارد</label>
            <input type="text" class="form-control" id="otherFindings" value="${escapeHtml(exExtra.other_findings || '')}">
          </div>

          <div class="col-12">
            <label class="form-label small mb-2">توصیه پزشک (چک‌باکس)</label>
            <div class="row g-2">
              <div class="col-6 col-md-4">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" value="low_fat" id="rec_low_fat" ${recsArr.includes('low_fat') ? 'checked' : ''}>
                  <label class="form-check-label small" for="rec_low_fat">کاهش مصرف غذاهای چرب</label>
                </div>
              </div>
              <div class="col-6 col-md-4">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" value="daily_exercise" id="rec_daily_exercise" ${recsArr.includes('daily_exercise') ? 'checked' : ''}>
                  <label class="form-check-label small" for="rec_daily_exercise">انجام ورزش روزانه</label>
                </div>
              </div>
              <div class="col-6 col-md-4">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" value="weight_loss" id="rec_weight_loss" ${recsArr.includes('weight_loss') ? 'checked' : ''}>
                  <label class="form-check-label small" for="rec_weight_loss">کاهش وزن</label>
                </div>
              </div>
              <div class="col-6 col-md-4">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" value="healthy_diet" id="rec_healthy_diet" ${recsArr.includes('healthy_diet') ? 'checked' : ''}>
                  <label class="form-check-label small" for="rec_healthy_diet">استفاده از تغذیه سالم</label>
                </div>
              </div>
            </div>
          </div>

          <div class="col-12">
            <label class="form-label small">سایر توصیه‌ها</label>
            <input type="text" class="form-control" id="otherRecommendation" value="${escapeHtml(exExtra.other_recommendation || '')}">
          </div>

          <div class="col-12">
            <div class="alert alert-light small mb-2" style="border:1px dashed #cbd5e1;">
              <strong>نظریه ثبت‌شده در معاینه:</strong>
              ${escapeHtml(e.final_opinion_text || '—')}
            </div>
            <button class="btn btn-primary w-100" id="saveExamExtraBtn">
              <i class="bi bi-save"></i> ذخیره اطلاعات تکمیلی
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // ... (ادامه کدهای نمایش آزمایش‌ها، بینایی‌سنجی، شنوایی‌سنجی و ... دقیقاً مثل فایل دوم شما)
  // من برای کوتاه شدن کد، آن بخش‌ها را اینجا مینویسم، شما کپی کنید.
  
  if (s.clinical) {
    const cm = s.clinical;
    html += `
      <div class="card mb-3">
        <div class="card-head" style="background:linear-gradient(135deg,#10b981,#059669);">
          <i class="bi bi-heart-pulse"></i> اندازه‌گیری‌های بالینی
        </div>
        <div class="card-body">
          <div class="row g-2 text-center">
            ${cm.weight != null ? `<div class="col-4"><div class="badge-soft primary w-100" style="justify-content:center;padding:8px;">وزن<br><strong>${faNum(cm.weight)}</strong></div></div>` : ''}
            ${cm.height != null ? `<div class="col-4"><div class="badge-soft primary w-100" style="justify-content:center;padding:8px;">قد<br><strong>${faNum(cm.height)}</strong></div></div>` : ''}
            ${cm.bmi != null ? `<div class="col-4"><div class="badge-soft primary w-100" style="justify-content:center;padding:8px;">BMI<br><strong>${faNum(cm.bmi)}</strong></div></div>` : ''}
            ${cm.systolic_bp != null ? `<div class="col-6"><div class="badge-soft warning w-100" style="justify-content:center;padding:8px;">فشار خون<br><strong>${faNum(cm.systolic_bp)}/${faNum(cm.diastolic_bp || 0)}</strong></div></div>` : ''}
            ${cm.pulse != null ? `<div class="col-6"><div class="badge-soft warning w-100" style="justify-content:center;padding:8px;">نبض<br><strong>${faNum(cm.pulse)}</strong></div></div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  if (s.labs && s.labs.length) {
    html += `
      <div class="card mb-3">
        <div class="card-head" style="background:linear-gradient(135deg,#8b5cf6,#7c3aed);">
          <i class="bi bi-droplet"></i> نتایج آزمایشگاه
        </div>
        <div class="card-body">
          ${s.labs.map(l => `
            <div class="row-item d-flex justify-content-between">
              <span>${escapeHtml(l.test_type?.name || '—')}</span>
              <span dir="ltr" style="font-weight:700;">${escapeHtml(l.result_value || '—')}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (s.optometry) {
    const o = s.optometry;
    const lines = [];
    if (o.va_distant_r_uncorrected || o.va_distant_l_uncorrected) {
      lines.push(`بدون عینک: راست ${o.va_distant_r_uncorrected || '—'} / چپ ${o.va_distant_l_uncorrected || '—'}`);
    }
    if (o.va_distant_r_corrected || o.va_distant_l_corrected) {
      lines.push(`با عینک: راست ${o.va_distant_r_corrected || '—'} / چپ ${o.va_distant_l_corrected || '—'}`);
    }
    if (o.color_vision_r || o.color_vision_l) {
      lines.push(`دید رنگ: راست ${o.color_vision_r || '—'} / چپ ${o.color_vision_l || '—'}`);
    }
    if (o.uses_glasses) lines.push('از عینک استفاده می‌کند');
    if (o.uses_contact_lens) lines.push('از لنز استفاده می‌کند');
    if (o.notes) lines.push(`توضیحات: ${o.notes}`);

    if (lines.length) {
      html += `
        <div class="card mb-3">
          <div class="card-head" style="background:linear-gradient(135deg,#f59e0b,#d97706);">
            <i class="bi bi-eye"></i> بینایی‌سنجی
          </div>
          <div class="card-body">
            ${lines.map(l => `<div class="row-item">${escapeHtml(l)}</div>`).join('')}
          </div>
        </div>
      `;
    }
  }

  if (s.audiometry) {
    const a = s.audiometry;
    html += `
      <div class="card mb-3">
        <div class="card-head" style="background:linear-gradient(135deg,#ec4899,#db2777);">
          <i class="bi bi-ear"></i> شنوایی‌سنجی
        </div>
        <div class="card-body">
          <div class="row-item d-flex justify-content-between">
            <span>گوش راست</span>
            <strong>${escapeHtml(a.right_result || '—')}</strong>
          </div>
          <div class="row-item d-flex justify-content-between">
            <span>گوش چپ</span>
            <strong>${escapeHtml(a.left_result || '—')}</strong>
          </div>
        </div>
      </div>
    `;
  }

  if (s.spirometry && (s.spirometry.result || s.spirometry.result_other)) {
    html += `
      <div class="card mb-3">
        <div class="card-head" style="background:linear-gradient(135deg,#06b6d4,#0891b2);">
          <i class="bi bi-lungs"></i> اسپیرومتری
        </div>
        <div class="card-body">
          <div>${escapeHtml(s.spirometry.result || s.spirometry.result_other || '—')}</div>
        </div>
      </div>
    `;
  }

  if (s.ecg && s.ecg.diagnoses) {
    html += `
      <div class="card mb-3">
        <div class="card-head" style="background:linear-gradient(135deg,#dc2626,#b91c1c);">
          <i class="bi bi-activity"></i> نوار قلب (ECG)
        </div>
        <div class="card-body">
          <div>${escapeHtml(s.ecg.diagnoses)}</div>
        </div>
      </div>
    `;
  }

  if (s.sonography && s.sonography.result) {
    html += `
      <div class="card mb-3">
        <div class="card-head" style="background:linear-gradient(135deg,#6366f1,#4f46e5);">
          <i class="bi bi-radioactive"></i> سونوگرافی
        </div>
        <div class="card-body">
          <div>${escapeHtml(s.sonography.result)}</div>
        </div>
      </div>
    `;
  }

  if (s.details && s.details.length) {
    html += `
      <div class="card mb-3">
        <div class="card-head" style="background:linear-gradient(135deg,#64748b,#475569);">
          <i class="bi bi-clipboard-check"></i> جزئیات معاینه اعضا
        </div>
        <div class="card-body">
          ${s.details.map(d => `
            <div class="row-item">
              <div style="font-weight:700;color:#0d6efd;font-size:0.9rem;">${escapeHtml(d.section || '')}</div>
              ${d.sign ? `<div class="small">علامت: ${escapeHtml(d.sign)}</div>` : ''}
              ${d.symptom ? `<div class="small">شکایت: ${escapeHtml(d.symptom)}</div>` : ''}
              ${d.notes ? `<div class="small muted">${escapeHtml(d.notes)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (e.final_opinion_text || e.final_opinion_conditions) {
    const opinion = e.final_opinion_text || '';
    let statusCls = 'gray';
    if (opinion.includes('بلامانع') || opinion.includes('کامل')) statusCls = 'success';
    else if (opinion.includes('مشروط') || opinion.includes('شرط')) statusCls = 'warning';
    else if (opinion.includes('عدم صلاحیت')) statusCls = 'danger';

    html += `
      <div class="card mb-3">
        <div class="card-head" style="background:linear-gradient(135deg,#0ea5e9,#0284c7);">
          <i class="bi bi-file-earmark-medical"></i> نظریه نهایی
        </div>
        <div class="card-body">
          <div class="badge-soft ${statusCls}" style="display:inline-flex;padding:8px 14px;font-size:0.85rem;">
            ${escapeHtml(opinion || '—')}
          </div>
          ${e.final_opinion_conditions ? `
            <div class="mt-3">
              <div class="muted small mb-1">شروط:</div>
              <div>${escapeHtml(e.final_opinion_conditions)}</div>
            </div>
          ` : ''}
          ${e.final_opinion_date ? `
            <div class="mt-2 muted small"><i class="bi bi-calendar"></i> ${gregorianToJalali(e.final_opinion_date)}</div>
          ` : ''}
        </div>
      </div>
    `;
  }

  html += `
    <div class="d-grid gap-2 mt-3 mb-5">
      <button class="btn btn-outline-secondary" id="occBackToExams">
        <i class="bi bi-arrow-right"></i> بازگشت به معاینات بیمار
      </button>
    </div>
  `;

  c.innerHTML = html;

  window._openCorrectiveAction = (examId, patientId) => {
    openCorrectiveActionModal(examId, patientId);
  };

  try {
    mountProcessBanner($('occBannerMount'), 'occupational', {
      examKind: exExtra?.exam_kind || 'periodic'
    });
  } catch (err) { console.warn('banner failed', err); }

  c.querySelectorAll('[data-form-open]').forEach(b => {
    b.onclick = async () => {
      try {
        const { openForm } = await import('../forms/engine.js');
        openForm(b.dataset.formOpen, { examId: e.id, patientId: e.patient_id });
      } catch (err) {
        console.error('openForm failed', err);
        toast('خطا در باز کردن فرم', 'danger');
      }
    };
  });

  $('occBackToExams').onclick = () => {
    state.view = 'patient';
    renderPatient();
  };

  const saveBtn = $('saveExamExtraBtn');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const flagged = [];
      if ($('ft_CHO')?.checked) flagged.push('CHO');
      if ($('ft_TG')?.checked) flagged.push('TG');
      if ($('ft_SGOT')?.checked) flagged.push('SGOT');
      if ($('ft_SGPT')?.checked) flagged.push('SGPT');
      if ($('ft_ALK')?.checked) flagged.push('ALK');
      if ($('ft_FBS')?.checked) flagged.push('FBS');

      const recs = [];
      if ($('rec_low_fat')?.checked) recs.push('low_fat');
      if ($('rec_daily_exercise')?.checked) recs.push('daily_exercise');
      if ($('rec_weight_loss')?.checked) recs.push('weight_loss');
      if ($('rec_healthy_diet')?.checked) recs.push('healthy_diet');

      const payload = {
        exam_kind: $('examKind')?.value || undefined,
        health_status: $('healthStatus')?.value || undefined,
        flagged_tests: flagged,
        recommendations: recs,
        other_findings: $('otherFindings')?.value?.trim() || undefined,
        other_recommendation: $('otherRecommendation')?.value?.trim() || undefined
      };

      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> ذخیره...';

      try {
        const { error } = await saveExamExtra(s.id, payload);
        if (error) throw error;
        toast('✅ اطلاعات تکمیلی ذخیره شد', 'success');
        state.examExtra = { ...state.examExtra, ...payload };
      } catch (err) {
        console.error('saveExamExtra failed', err);
        toast('ذخیره ناموفق بود', 'danger');
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-save"></i> ذخیره اطلاعات تکمیلی';
      }
    };
  }
}

// ═══════════════════════════════════════════════════════
// مودال اقدام اصلاحی و تاریخچه (از فایل اول)
// ═══════════════════════════════════════════════════════
async function openCorrectiveActionModal(examId, patientId) {
  const modalId = 'correctiveActionModal';
  document.getElementById(modalId)?.remove();

  const modalHtml = `
    <div class="modal fade" id="${modalId}" tabindex="-1" data-bs-backdrop="static">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title"><i class="bi bi-tools"></i> اقدام اصلاحی و تاریخچه</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-4">
              <label class="form-label fw-bold">متن اقدام اصلاحی:</label>
              <textarea class="form-control" id="caText" rows="3" placeholder="اقدامات اصلاحی مورد نیاز برای این پرسنل..."></textarea>
              <div class="d-flex gap-2 mt-2">
                <button class="btn btn-success flex-grow-1" id="caSaveBtn"><i class="bi bi-check2"></i> ذخیره اقدام</button>
                <button class="btn btn-warning" id="caCompleteBtn" style="display:none;"><i class="bi bi-check-circle"></i> علامت‌گذاری به عنوان انجام شده</button>
              </div>
            </div>

            <h6 class="fw-bold border-bottom pb-2 mb-3">تاریخچه تغییرات</h6>
            <div id="caHistoryContainer" style="max-height: 300px; overflow-y: auto;">
              <div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modal = new bootstrap.Modal(document.getElementById(modalId));
  modal.show();

  const textarea = $('caText');
  const saveBtn = $('caSaveBtn');
  const completeBtn = $('caCompleteBtn');
  const historyContainer = $('caHistoryContainer');

  let currentAction = null;

  try {
    const { data: actions, error: e1 } = await sb.from('occupational_corrective_actions')
      .select('*').eq('exam_id', examId).order('created_at', { ascending: false }).limit(1);
    
    if (e1) {
       console.warn('[CA] خطا در خواندن اقدامات:', e1);
    } else if (actions && actions.length > 0) {
      currentAction = actions[0];
      textarea.value = currentAction.action_text || '';
      if (currentAction.status === 'pending') {
        completeBtn.style.display = 'inline-block';
      }
    }

    const { data: history, error: e2 } = await sb.from('occupational_corrective_actions_history')
      .select('*').eq('exam_id', examId).order('changed_at', { ascending: false });

    if (e2) {
       console.warn('[CA] خطا در خواندن تاریخچه:', e2);
       historyContainer.innerHTML = `<div class="alert alert-warning small">جدول تاریخچه یافت نشد یا دسترسی ندارد.</div>`;
    } else {
       renderHistory(history || []);
    }

  } catch (e) {
    console.error('[CA] load error:', e);
    historyContainer.innerHTML = `<div class="alert alert-danger small">خطا: ${escapeHtml(e.message)}</div>`;
  }

  saveBtn.onclick = async () => {
    const text = textarea.value.trim();
    if (!text) { toast('متن اقدام را وارد کنید', 'warning'); return; }

    saveBtn.disabled = true; saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> ذخیره...';

    try {
      const { data: { user } } = await sb.auth.getUser();
      const userEmail = user?.email || 'نامشخص';

      if (currentAction) {
        if (currentAction.action_text === text) { toast('تغییری اعمال نشد', 'info'); return; }
        
        const oldData = { action_text: currentAction.action_text, status: currentAction.status };
        const newData = { action_text: text, status: currentAction.status };

        const { error: eUpd } = await sb.from('occupational_corrective_actions')
          .update({ action_text: text, updated_at: new Date().toISOString() })
          .eq('id', currentAction.id);
        if (eUpd) throw eUpd;

        await sb.from('occupational_corrective_actions_history').insert({
          action_id: currentAction.id,
          exam_id: examId,
          change_type: 'update',
          old_data: oldData,
          new_data: newData,
          changed_by: userEmail
        });
        toast('✅ اقدام اصلاحی ویرایش شد', 'success');
        currentAction.action_text = text;
      } else {
        const { data: newAction, error: eIns } = await sb.from('occupational_corrective_actions').insert({
          exam_id: examId,
          patient_id: patientId,
          action_text: text,
          status: 'pending',
          created_by: userEmail
        }).select().single();
        if (eIns) throw eIns;

        await sb.from('occupational_corrective_actions_history').insert({
          action_id: newAction.id,
          exam_id: examId,
          change_type: 'create',
          old_data: null,
          new_data: { action_text: text, status: 'pending' },
          changed_by: userEmail
        });
        toast('✅ اقدام اصلاحی ثبت شد', 'success');
        currentAction = newAction;
        completeBtn.style.display = 'inline-block';
      }

      const { data: history } = await sb.from('occupational_corrective_actions_history')
        .select('*').eq('exam_id', examId).order('changed_at', { ascending: false });
      renderHistory(history || []);

    } catch (e) {
      console.error(e);
      toast('خطا در ذخیره: ' + e.message, 'danger');
    } finally {
      saveBtn.disabled = false; saveBtn.innerHTML = '<i class="bi bi-check2"></i> ذخیره اقدام';
    }
  };

  completeBtn.onclick = async () => {
    if (!currentAction) return;
    if (!confirm('آیا این اقدام اصلاحی انجام شده است؟')) return;

    completeBtn.disabled = true;
    try {
      const { data: { user } } = await sb.auth.getUser();
      const userEmail = user?.email || 'نامشخص';

      const oldData = { action_text: currentAction.action_text, status: currentAction.status };
      const newData = { action_text: currentAction.action_text, status: 'completed' };

      const { error: eUpd } = await sb.from('occupational_corrective_actions')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', currentAction.id);
      if (eUpd) throw eUpd;

      await sb.from('occupational_corrective_actions_history').insert({
        action_id: currentAction.id,
        exam_id: examId,
        change_type: 'status_change',
        old_data: oldData,
        new_data: newData,
        changed_by: userEmail
      });

      toast('✅ وضعیت به انجام شده تغییر یافت', 'success');
      currentAction.status = 'completed';
      completeBtn.style.display = 'none';
      
      const { data: history } = await sb.from('occupational_corrective_actions_history')
        .select('*').eq('exam_id', examId).order('changed_at', { ascending: false });
      renderHistory(history || []);

    } catch (e) {
      toast('خطا: ' + e.message, 'danger');
    } finally {
      completeBtn.disabled = false;
    }
  };
}

function renderHistory(history) {
  const container = $('caHistoryContainer');
  if (!container) return;

  if (!history.length) {
    container.innerHTML = '<div class="text-center text-muted small py-3">تاریخچه‌ای ثبت نشده است.</div>';
    return;
  }

  container.innerHTML = `<div class="list-group list-group-flush">` + history.map(h => {
    const date = new Date(h.changed_at).toLocaleString('fa-IR');
    let title = '';
    let desc = '';

    if (h.change_type === 'create') {
      title = 'ثبت اولیه';
      desc = `متن: ${escapeHtml(h.new_data?.action_text || '')}`;
    } else if (h.change_type === 'update') {
      title = 'ویرایش متن';
      desc = `از: ${escapeHtml(h.old_data?.action_text || '')} <br> به: ${escapeHtml(h.new_data?.action_text || '')}`;
    } else if (h.change_type === 'status_change') {
      title = 'تغییر وضعیت';
      desc = `از ${h.old_data?.status === 'pending' ? 'در انتظار' : 'انجام شده'} به ${h.new_data?.status === 'completed' ? 'انجام شده' : 'در انتظار'}`;
    }

    return `
      <div class="list-group-item px-0 py-2">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="fw-bold small text-primary">${title}</span>
          <span class="small text-muted">${date}</span>
        </div>
        <div class="small text-dark mb-1">${desc}</div>
        <div class="small text-muted"><i class="bi bi-person"></i> ${escapeHtml(h.changed_by || 'نامشخص')}</div>
      </div>
    `;
  }).join('') + `</div>`;
}
