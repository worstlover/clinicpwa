// js/modules/occupational.js
import { sb } from '../sb.js';
import { $, faNum, escapeHtml, gregorianToJalali, toast } from '../utils.js';
import { showScreen } from '../ui.js';
import { saveExamExtra, loadExamExtra } from './extra-data.js';
import { mountProcessBanner } from '../process/banner.js';

let state = {
  view: 'list',
  patients: [],
  selectedPatient: null,
  selectedExam: null,
  examExtra: null
};

export function openOccupational() {
  showScreen('Occupational');
  state.view = 'list';
  state.selectedPatient = null;
  state.selectedExam = null;
  renderList();
}

// ═══════════════════════════════════════════════════════
// لیست کارگران
// ═══════════════════════════════════════════════════════
async function renderList(query = '') {
  const c = $('occContent');
  c.innerHTML = `
    <div class="card">
      <div class="card-head" style="background:linear-gradient(135deg,#0ea5e9,#0284c7);">
        <i class="bi bi-clipboard2-pulse"></i> طب کار
      </div>
      <div class="card-body">
        <div class="mb-3">
          <input type="text" id="occSearch" class="form-control"
            placeholder="جستجوی نام، کد ملی، شماره پرسنلی..."
            value="${escapeHtml(query)}">
        </div>
        <div class="text-center">
          <div class="badge-soft primary" style="display:inline-flex;">
            <i class="bi bi-people"></i>&nbsp; کارگرانی با معاینه دوره‌ای
          </div>
        </div>
      </div>
    </div>
    <div id="occPatientList">
      <div class="text-center py-5"><div class="spinner-border text-primary"></div></div>
    </div>
  `;

  const input = $('occSearch');
  let timer = null;
  input.addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => loadPatients(e.target.value.trim()), 400);
  });

  await loadPatients(query);
}

async function loadPatients(query = '') {
  const list = $('occPatientList');
  if (!list) return;
  list.innerHTML = '<div class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

  try {
    const { data, error } = await sb
      .from('lab_results_periodicexamination')
      .select(`
        id, exam_date, exam_type, final_opinion_text,
        patient:core_patient(id, first_name, last_name, national_code, personnel_number)
      `)
      .order('exam_date', { ascending: false });

    if (error) throw error;

    let exams = data || [];
    if (query) {
      const ql = query.toLowerCase();
      exams = exams.filter(e => {
        const p = e.patient || {};
        const name = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
        const nc = String(p.national_code || '').toLowerCase();
        const pn = String(p.personnel_number || '').toLowerCase();
        return name.includes(ql) || nc.includes(ql) || pn.includes(ql);
      });
    }

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
      list.innerHTML = '<div class="card text-center py-5 muted">کارگری یافت نشد</div>';
      return;
    }

    list.innerHTML = state.patients.map(p => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || '—';
      const lastExam = p.exams[0];
      const lastDate = lastExam?.exam_date ? gregorianToJalali(lastExam.exam_date) : '—';
      const opinion = p.last_opinion || '';

      let statusCls = 'gray';
      let statusText = 'بدون نظریه';
      if (opinion.includes('بلامانع')) { statusCls = 'success'; statusText = 'بلامانع'; }
      else if (opinion.includes('مشروط')) { statusCls = 'warning'; statusText = 'مشروط'; }
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
    list.innerHTML = `<div class="alert alert-danger">خطا: ${escapeHtml(e.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════
// لیست معاینات کارگر
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
    <div class="card">
      <div class="card-head" style="background:linear-gradient(135deg,#0ea5e9,#0284c7);">
        <i class="bi bi-person-badge"></i> ${escapeHtml(name)}
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
          <span class="muted">تعداد معاینات</span>
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
        if (opinion.includes('بلامانع')) { statusCls = 'success'; statusText = 'بلامانع'; }
        else if (opinion.includes('مشروط')) { statusCls = 'warning'; statusText = 'مشروط'; }
        else if (opinion.includes('عدم صلاحیت')) { statusCls = 'danger'; statusText = 'عدم صلاحیت'; }

        return `
          <div class="item-card" data-exam-id="${e.id}" style="cursor:pointer;border-right-color:#0ea5e9;">
            <div class="d-flex justify-content-between align-items-center">
              <div class="flex-grow-1">
                <div class="name">
                  ${jd}
                  <span class="badge-soft ${statusCls}" style="font-size:0.65rem;margin-right:6px;">${statusText}</span>
                </div>
                <div class="meta">${e.exam_type === 'pre_employment' ? 'بدو ورود' : 'دوره‌ای'}</div>
              </div>
              <i class="bi bi-chevron-left" style="font-size:1.5rem;color:#94a3b8;"></i>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <div class="d-grid gap-2 mt-3 mb-4">
      <button class="btn btn-outline-secondary" id="occBackToWorkers">
        <i class="bi bi-arrow-right"></i> بازگشت به لیست کارگران
      </button>
    </div>
  `;

  c.querySelectorAll('[data-exam-id]').forEach(el => {
    el.onclick = () => {
      const eid = parseInt(el.dataset.examId);
      const exam = p.exams.find(x => x.id === eid);
      if (exam) openExam(exam);
    };
  });

  const backBtn = $('occBackToWorkers');
  if (backBtn) backBtn.onclick = () => { state.view = 'list'; renderList(); };
}

// ═══════════════════════════════════════════════════════
// جزئیات معاینه
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
    <div class="card" style="border:2px solid #10b981;">
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
    <div class="card">
      <div class="card-head" style="background:linear-gradient(135deg,#0ea5e9,#0284c7);">
        <i class="bi bi-file-medical"></i> معاینه ${jd}
      </div>
      <div class="card-body">
        <div class="row-item d-flex justify-content-between">
          <span class="muted">نوع معاینه</span>
          <span>${e.exam_type === 'pre_employment' ? 'بدو ورود' : 'دوره‌ای'}</span>
        </div>
        ${e.admission_date ? `<div class="row-item d-flex justify-content-between">
          <span class="muted">تاریخ پذیرش</span>
          <span>${gregorianToJalali(e.admission_date)}</span>
        </div>` : ''}
      </div>
    </div>
  `;

  html += `
    <div class="card" style="border:2px solid #0ea5e9;">
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
                      <small class="text-muted">(مقدار ثبت‌شده: ${escapeHtml(String(getLabHint(k)))} )</small>
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

  if (s.clinical) {
    const cm = s.clinical;
    html += `
      <div class="card">
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
      <div class="card">
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
        <div class="card">
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
      <div class="card">
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
          ${a.right_result_other || a.left_result_other ? `
            <div class="row-item">
              <div class="muted small mb-1">توضیحات:</div>
              <div>${escapeHtml(a.right_result_other || '')} ${escapeHtml(a.left_result_other || '')}</div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  if (s.spirometry && (s.spirometry.result || s.spirometry.result_other)) {
    html += `
      <div class="card">
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
      <div class="card">
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
      <div class="card">
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
      <div class="card">
        <div class="card-head" style="background:linear-gradient(135deg,#64748b,#475569);">
          <i class="bi bi-clipboard-check"></i> جزئیات معاینه اعضا
        </div>
        <div class="card-body
