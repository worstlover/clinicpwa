// js/modules/occupational.js
import { sb } from '../sb.js';
import { $, faNum, escapeHtml, gregorianToJalali } from '../utils.js';
import { showScreen } from '../ui.js';

let state = {
  view: 'list',
  patients: [],
  selectedPatient: null,
  selectedExam: null
};

export function openOccupational() {
  showScreen('Occupational');
  state.view = 'list';
  state.selectedPatient = null;
  state.selectedExam = null;
  renderList();
}

// ═══════════════════════════════════════════════════════
// صفحه لیست کارگران
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
    // گرفتن همه معاینات + بیمار مرتبط
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

    // گروه‌بندی به تفکیک بیمار
    const patientMap = new Map();
    exams.forEach(e => {
      if (!e.patient) return;
      const pid = e.patient.id;
      if (!patientMap.has(pid)) {
        patientMap.set(pid, {
          ...e.patient,
          exams: [],
          last_opinion: null
        });
      }
      const p = patientMap.get(pid);
      p.exams.push({
        id: e.id,
        exam_date: e.exam_date,
        exam_type: e.exam_type,
        final_opinion_text: e.final_opinion_text
      });
      if (!p.last_opinion && e.final_opinion_text) {
        p.last_opinion = e.final_opinion_text;
      }
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
// صفحه لیست معاینات کارگر
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
// صفحه جزئیات یک معاینه
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

    state.selectedExam = { exam, clinical, labs, details, optometry, audiometry, spirometry, ecg, sonography };
    renderExam();
  } catch (e) {
    console.error(e);
    c.innerHTML = `<div class="alert alert-danger">خطا: ${escapeHtml(e.message)}</div>`;
  }
}

function renderExam() {
  const s = state.selectedExam;
  const e = s.exam;
  const c = $('occContent');
  const jd = e.exam_date ? gregorianToJalali(e.exam_date) : '—';

  let html = `
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

  // ۱. اندازه‌گیری‌های بالینی
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

  // ۲. نتایج آزمایشگاه
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

  // ۳. بینایی‌سنجی
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

  // ۴. شنوایی‌سنجی
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

  // ۵. اسپیرومتری
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

  // ۶. نوار قلب
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

  // ۷. سونوگرافی
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

  // ۸. جزئیات معاینه اعضا
  if (s.details && s.details.length) {
    html += `
      <div class="card">
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

  // ۹. نظریه نهایی
  if (e.final_opinion_text || e.final_opinion_conditions) {
    const opinion = e.final_opinion_text || '';
    let statusCls = 'gray';
    if (opinion.includes('بلامانع')) statusCls = 'success';
    else if (opinion.includes('مشروط')) statusCls = 'warning';
    else if (opinion.includes('عدم صلاحیت')) statusCls = 'danger';

    html += `
      <div class="card">
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
    <div class="d-grid gap-2 mt-3 mb-4">
      <button class="btn btn-outline-secondary" id="occBack">
        <i class="bi bi-arrow-right"></i> بازگشت به معاینات
      </button>
    </div>
  `;

  c.innerHTML = html;

  $('occBack').onclick = () => {
    state.view = 'patient';
    renderPatient();
  };
}
