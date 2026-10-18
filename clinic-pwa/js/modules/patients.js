// js/modules/patients.js
import { sb } from '../sb.js';
import { $, faNum, faToEn, escapeHtml, gregorianToJalali, jalaliToGregorian, toast } from '../utils.js';
import { showScreen } from '../ui.js';

const state = {
  page: 1,
  query: '',
  rows: [],
  total: 0,
  loading: false,
  PAGE_SIZE: 20,
  companies: []
};

export function openPatients() {
  showScreen('Patients');
  state.page = 1;
  state.query = '';
  renderView();
}

async function renderView() {
  const c = $('patientContent');
  if (!c) return;
  
  c.innerHTML = `
    <div class="card mb-3 shadow-sm border-0">
      <div class="card-body py-3">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div>
            <div class="fw-bold fs-5"><i class="bi bi-people-fill text-primary"></i> پرونده بیماران</div>
            <div class="muted small">مدیریت، ویرایش و چاپ سوابق</div>
          </div>
        </div>
        <div class="input-group mt-3">
          <span class="input-group-text bg-white border-end-0"><i class="bi bi-search text-muted"></i></span>
          <input type="text" class="form-control border-start-0 ps-0" id="patSearch" placeholder="جستجو بر اساس نام، کد ملی یا پرسنلی...">
        </div>
      </div>
    </div>

    <div id="patListBox"></div>

    <div class="d-flex justify-content-between align-items-center mt-3" id="patPagerWrap">
      <button class="btn btn-sm btn-outline-primary" id="patPrev"><i class="bi bi-chevron-right"></i> قبلی</button>
      <span class="small text-muted" id="patPager">—</span>
      <button class="btn btn-sm btn-outline-primary" id="patNext">بعدی <i class="bi bi-chevron-left"></i></button>
    </div>
  `;

  $('patSearch').onkeydown = (e) => {
    if (e.key === 'Enter') {
      state.query = e.target.value.trim();
      state.page = 1;
      loadPatients();
    }
  };
  
  $('patPrev').onclick = () => {
    if (state.page > 1) { state.page--; loadPatients(); }
  };
  $('patNext').onclick = () => {
    const maxPage = Math.max(1, Math.ceil(state.total / state.PAGE_SIZE));
    if (state.page < maxPage) { state.page++; loadPatients(); }
  };

  // بارگذاری لیست شرکت‌ها برای ویرایش
  const { data: comps } = await sb.from('core_company').select('id, name').order('name');
  state.companies = comps || [];

  loadPatients();
}

async function loadPatients() {
  const box = $('patListBox');
  box.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

  try {
    let q = sb.from('core_patient')
      .select('*, company:core_company(name)', { count: 'exact' })
      .order('id', { ascending: false });

    if (state.query) {
      const qEn = faToEn(state.query);
      q = q.or(`first_name.ilike.%${qEn}%,last_name.ilike.%${qEn}%,national_code.ilike.%${qEn}%,personnel_number.ilike.%${qEn}%`);
    }

    const from = (state.page - 1) * state.PAGE_SIZE;
    const to = from + state.PAGE_SIZE - 1;
    const { data, error, count } = await q.range(from, to);
    if (error) throw error;

    state.rows = data || [];
    state.total = count || 0;
    renderPatientList();
  } catch (e) {
    console.error('[PATIENTS] load error:', e);
    box.innerHTML = `<div class="alert alert-danger m-2">خطا در بارگذاری: ${escapeHtml(e.message)}</div>`;
  }
}

function renderPatientList() {
  const box = $('patListBox');
  if (!state.rows.length) {
    box.innerHTML = '<div class="card text-center py-5 muted border-0"><i class="bi bi-person-x" style="font-size:3rem;opacity:0.3;"></i><div class="mt-2 fs-6">بیماری یافت نشد</div></div>';
    updatePager();
    return;
  }

  box.innerHTML = state.rows.map(p => {
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
    const meta = [];
    if (p.national_code) meta.push(`کد ملی: ${p.national_code}`);
    if (p.personnel_number) meta.push(`پرسنلی: ${p.personnel_number}`);
    
    return `
      <div class="card mb-2 shadow-sm border-0 item-card">
        <div class="card-body p-3">
          <div class="d-flex justify-content-between align-items-center">
            <div class="flex-grow-1">
              <div class="fw-bold text-primary fs-6 mb-1">${escapeHtml(name)}</div>
              <div class="text-muted small">
                <i class="bi bi-person-vcard"></i> ${meta.join(' | ') || 'بدون شناسه'}
              </div>
              ${p.company?.name ? `<div class="text-muted small"><i class="bi bi-building"></i> ${escapeHtml(p.company.name)}</div>` : ''}
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-outline-primary rounded-circle" data-edit="${p.id}" title="ویرایش بیمار" style="width:36px;height:36px;padding:0;">
                <i class="bi bi-pencil-square"></i>
              </button>
              <button class="btn btn-sm btn-outline-success rounded-circle" data-print="${p.id}" title="چاپ پرونده" style="width:36px;height:36px;padding:0;">
                <i class="bi bi-printer"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // رویداد دکمه‌ها
  box.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.edit;
      const row = state.rows.find(x => String(x.id) === id);
      if (row) openEditPatientModal(row);
    };
  });

  box.querySelectorAll('[data-print]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.print;
      printPatientProfile(id);
    };
  });

  updatePager();
}

function updatePager() {
  const maxPage = Math.max(1, Math.ceil(state.total / state.PAGE_SIZE));
  const pager = $('patPager');
  if (pager) pager.textContent = `صفحه ${faNum(state.page)} از ${faNum(maxPage)} • ${faNum(state.total)} بیمار`;
}

// ═══════════════════════════════════════════════════════════
// ویرایش کامل بیمار
// ═══════════════════════════════════════════════════════════
function openEditPatientModal(patient) {
  const modalId = 'editPatientModal';
  document.getElementById(modalId)?.remove();

  const dobJalali = patient.date_of_birth ? gregorianToJalali(patient.date_of_birth) : '';

  const html = `
    <div class="modal fade" id="${modalId}" tabindex="-1" data-bs-backdrop="static">
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
        <div class="modal-content border-0 shadow-lg">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title"><i class="bi bi-person-lines-fill"></i> ویرایش پرونده بیمار</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body bg-light">
            
            <div class="card mb-3 border-0 shadow-sm">
              <div class="card-header bg-white fw-bold text-primary border-0 pt-3"><i class="bi bi-person-badge"></i> مشخصات هویتی</div>
              <div class="card-body">
                <div class="row g-3">
                  <div class="col-6"><label class="form-label small text-muted">نام *</label><input type="text" id="epFirstName" class="form-control" value="${escapeHtml(patient.first_name || '')}"></div>
                  <div class="col-6"><label class="form-label small text-muted">نام خانوادگی *</label><input type="text" id="epLastName" class="form-control" value="${escapeHtml(patient.last_name || '')}"></div>
                  
                  <div class="col-6"><label class="form-label small text-muted">کد ملی</label><input type="text" id="epNational" class="form-control" dir="ltr" value="${escapeHtml(patient.national_code || '')}"></div>
                  <div class="col-6"><label class="form-label small text-muted">کد پرسنلی</label><input type="text" id="epPersonnel" class="form-control" dir="ltr" value="${escapeHtml(patient.personnel_number || '')}"></div>
                  
                  <div class="col-6">
                    <label class="form-label small text-muted">جنسیت</label>
                    <select id="epGender" class="form-select">
                      <option value="m" ${patient.gender === 'm' || patient.gender === 'male' ? 'selected' : ''}>مرد</option>
                      <option value="f" ${patient.gender === 'f' || patient.gender === 'female' ? 'selected' : ''}>زن</option>
                    </select>
                  </div>
                  <div class="col-6"><label class="form-label small text-muted">تاریخ تولد (شمسی)</label><input type="text" id="epDob" class="form-control" dir="ltr" value="${dobJalali}" placeholder="1370/01/01"></div>
                  
                  <div class="col-6"><label class="form-label small text-muted">تلفن همراه</label><input type="text" id="epPhone" class="form-control" dir="ltr" value="${escapeHtml(patient.phone_number || '')}"></div>
                  <div class="col-6">
                    <label class="form-label small text-muted">شرکت / پیمانکار</label>
                    <select id="epCompany" class="form-select">
                      <option value="">بدون شرکت</option>
                      ${state.companies.map(c => `<option value="${c.id}" ${patient.company_id === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div class="card mb-3 border-0 shadow-sm">
              <div class="card-header bg-white fw-bold text-danger border-0 pt-3"><i class="bi bi-heart-pulse"></i> سوابق پزشکی</div>
              <div class="card-body">
                <div class="row g-3">
                  <div class="col-12">
                    <label class="form-label small text-danger fw-bold">حساسیت‌ها (دارو، غذا، ...)</label>
                    <input type="text" id="epAllergies" class="form-control border-danger" value="${escapeHtml(patient.allergies || '')}" placeholder="مثال: پنی سیلین، گرده گل">
                  </div>
                  <div class="col-12">
                    <label class="form-label small text-muted">سابقه بیماری‌های زمینه‌ای</label>
                    <textarea id="epMedicalHistory" class="form-control" rows="3" placeholder="مثال: دیابت نوع 2، فشار خون بالا...">${escapeHtml(patient.medical_history || '')}</textarea>
                  </div>
                </div>
              </div>
            </div>

          </div>
          <div class="modal-footer bg-white border-0">
            <button class="btn btn-light" data-bs-dismiss="modal">انصراف</button>
            <button class="btn btn-primary px-4" id="btnSaveEditPatient"><i class="bi bi-check2-circle"></i> ذخیره تغییرات</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  const modalEl = document.getElementById(modalId);
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());

  document.getElementById('btnSaveEditPatient').onclick = async () => {
    const firstName = document.getElementById('epFirstName').value.trim();
    const lastName = document.getElementById('epLastName').value.trim();
    const dobInput = document.getElementById('epDob').value.trim();
    
    if (!firstName || !lastName) {
      toast('نام و نام خانوادگی الزامی است', 'warning');
      return;
    }

    let dobGreg = null;
    if (dobInput) {
      dobGreg = jalaliToGregorian(dobInput);
    }

    const payload = {
      first_name: firstName,
      last_name: lastName,
      national_code: document.getElementById('epNational').value.trim() || null,
      personnel_number: document.getElementById('epPersonnel').value.trim() || null,
      gender: document.getElementById('epGender').value,
      date_of_birth: dobGreg,
      phone_number: document.getElementById('epPhone').value.trim() || null,
      company_id: document.getElementById('epCompany').value ? parseInt(document.getElementById('epCompany').value) : null,
      allergies: document.getElementById('epAllergies').value.trim(),
      medical_history: document.getElementById('epMedicalHistory').value.trim(),
    };

    const btn = document.getElementById('btnSaveEditPatient');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ذخیره...';

    const { error } = await sb.from('core_patient').update(payload).eq('id', patient.id);
    
    if (error) {
      toast('خطا در ذخیره: ' + error.message, 'danger');
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-check2-circle"></i> ذخیره تغییرات';
    } else {
      toast('✅ اطلاعات بیمار با موفقیت به‌روزرسانی شد', 'success');
      modal.hide();
      loadPatients();
    }
  };
}

// ═══════════════════════════════════════════════════════════
// چاپ پرونده گرافیکی (A4)
// ═══════════════════════════════════════════════════════════
async function printPatientProfile(patientId) {
  toast('در حال آماده‌سازی پرونده...', 'info');
  
  try {
    const patient = state.rows.find(p => String(p.id) === String(patientId));
    if (!patient) return;

    // 1. Fetch Visits
    const { data: visits } = await sb.from('visits_visit')
      .select('visit_date, status, reason:visits_reasonforvisit(name), result:visits_treatmentresult(name)')
      .eq('patient_id', patientId)
      .order('visit_date', { ascending: false });

    // 2. Fetch Occupational Exams
    const { data: occ } = await sb.from('lab_results_periodicexamination')
      .select('exam_date, exam_type, final_opinion_text, final_opinion_conditions')
      .eq('patient_id', patientId)
      .order('exam_date', { ascending: false });

    // 3. Build HTML
    const name = `${patient.first_name || ''} ${patient.last_name || ''}`.trim();
    const genderStr = (patient.gender === 'm' || patient.gender === 'male') ? 'مرد' : 'زن';
    const dobStr = patient.date_of_birth ? gregorianToJalali(patient.date_of_birth) : '-';
    const companyStr = patient.company?.name || 'بدون شرکت';
    const today = gregorianToJalali(new Date().toISOString().slice(0, 10));

    const allergyHtml = patient.allergies 
      ? `<div class="alert-box danger">
           <div class="alert-title">⚠️ هشدار حساسیت</div>
           <div class="alert-text">${escapeHtml(patient.allergies)}</div>
         </div>` 
      : '';

    const historyHtml = patient.medical_history
      ? `<div class="alert-box warning">
           <div class="alert-title">📋 سابقه بیماری</div>
           <div class="alert-text">${escapeHtml(patient.medical_history)}</div>
         </div>`
      : '';

    const occRows = (occ || []).map(o => `
      <tr>
        <td dir="ltr">${gregorianToJalali(o.exam_date)}</td>
        <td>${escapeHtml(o.exam_type || 'دوره‌ای')}</td>
        <td>${escapeHtml(o.final_opinion_text || 'تایید')}</td>
        <td class="text-muted small">${escapeHtml(o.final_opinion_conditions || '-')}</td>
      </tr>
    `).join('');

    const visitRows = (visits || []).map(v => `
      <tr>
        <td dir="ltr">${gregorianToJalali(v.visit_date)}</td>
        <td>${escapeHtml(v.reason?.name || 'ویزیت')}</td>
        <td>${escapeHtml(v.result?.name || '-')}</td>
        <td>
          <span class="badge ${v.status === 'completed' ? 'bg-success' : 'bg-warning text-dark'}">
            ${v.status === 'completed' ? 'تکمیل' : 'در انتظار'}
          </span>
        </td>
      </tr>
    `).join('');

    const printHtml = `
      <!DOCTYPE html>
      <html dir="rtl" lang="fa">
      <head>
        <meta charset="UTF-8">
        <title>پرونده پزشکی - ${name}</title>
        <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet">
        <style>
          * { box-sizing: border-box; font-family: 'Vazirmatn', sans-serif; }
          body { margin: 0; padding: 20px; background: #f8fafc; color: #1e293b; font-size: 13px; }
          .page { background: #fff; max-width: 800px; margin: 0 auto; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
          
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0d6efd; padding-bottom: 20px; margin-bottom: 30px; }
          .header-logo { display: flex; align-items: center; gap: 12px; }
          .logo-icon { width: 50px; height: 50px; background: #0d6efd; color: #fff; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; }
          .header-title h1 { margin: 0; font-size: 18px; color: #0d6efd; }
          .header-title p { margin: 4px 0 0; font-size: 12px; color: #64748b; }
          .header-date { text-align: left; font-size: 12px; color: #64748b; }

          .section-title { font-size: 14px; font-weight: bold; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin: 25px 0 15px; color: #334155; display: flex; align-items: center; gap: 8px; }
          
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
          .info-box { background: #f1f5f9; padding: 10px 14px; border-radius: 8px; }
          .info-label { font-size: 11px; color: #64748b; margin-bottom: 4px; }
          .info-value { font-weight: bold; font-size: 13px; color: #0f172a; }

          .alert-box { padding: 12px 16px; border-radius: 8px; margin-bottom: 10px; border-right: 4px solid; }
          .alert-box.danger { background: #fef2f2; border-color: #ef4444; color: #991b1b; }
          .alert-box.warning { background: #fffbeb; border-color: #f59e0b; color: #92400e; }
          .alert-title { font-weight: bold; font-size: 12px; margin-bottom: 4px; }
          .alert-text { font-size: 13px; }

          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #f8fafc; color: #475569; font-size: 12px; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; text-align: right; }
          td { padding: 10px; border: 1px solid #cbd5e1; font-size: 12px; color: #1e293b; }
          tr:nth-child(even) { background: #fcfcfc; }
          
          .footer { margin-top: 50px; display: flex; justify-content: space-between; padding-top: 20px; border-top: 1px dashed #cbd5e1; }
          .signature { text-align: center; width: 200px; }
          .sig-line { border-bottom: 1px dashed #94a3b8; height: 40px; margin-bottom: 8px; }
          .sig-text { font-size: 12px; color: #64748b; }

          @media print {
            body { background: #fff; padding: 0; }
            .page { box-shadow: none; padding: 0; max-width: 100%; }
            @page { size: A4; margin: 15mm; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="header-logo">
              <div class="logo-icon">+</div>
              <div class="header-title">
                <h1>کلینیک صنعتی گندله سازی بهاباد</h1>
                <p>سامانه جامع مدیریت پرونده پزشکی</p>
              </div>
            </div>
            <div class="header-date">
              <div>تاریخ چاپ: <strong>${today}</strong></div>
              <div>شماره پرونده: <strong>${patient.id}</strong></div>
            </div>
          </div>

          <div class="section-title">👤 مشخصات بیمار</div>
          <div class="grid-2 mb-4">
            <div class="info-box"><div class="info-label">نام و نام خانوادگی</div><div class="info-value">${escapeHtml(name)}</div></div>
            <div class="info-box"><div class="info-label">کد ملی</div><div class="info-value" dir="ltr">${escapeHtml(patient.national_code || '-')}</div></div>
            <div class="info-box"><div class="info-label">کد پرسنلی</div><div class="info-value" dir="ltr">${escapeHtml(patient.personnel_number || '-')}</div></div>
            <div class="info-box"><div class="info-label">جنسیت</div><div class="info-value">${genderStr}</div></div>
            <div class="info-box"><div class="info-label">تاریخ تولد</div><div class="info-value">${dobStr}</div></div>
            <div class="info-box"><div class="info-label">شرکت / پیمانکار</div><div class="info-value">${escapeHtml(companyStr)}</div></div>
            <div class="info-box"><div class="info-label">تلفن همراه</div><div class="info-value" dir="ltr">${escapeHtml(patient.phone_number || '-')}</div></div>
          </div>

          ${allergyHtml}
          ${historyHtml}

          <div class="section-title">🩺 سوابق طب کار</div>
          ${occRows ? `
            <table>
              <thead><tr><th>تاریخ معاینه</th><th>نوع معاینه</th><th>نظر نهایی</th><th>شروط / توضیحات</th></tr></thead>
              <tbody>${occRows}</tbody>
            </table>
          ` : '<p class="text-muted small">سابقه‌ای در سیستم ثبت نشده است.</p>'}

          <div class="section-title">📋 سوابق ویزیت‌ها</div>
          ${visitRows ? `
            <table>
              <thead><tr><th>تاریخ ویزیت</th><th>علت مراجعه</th><th>نتیجه درمان</th><th>وضعیت</th></tr></thead>
              <tbody>${visitRows}</tbody>
            </table>
          ` : '<p class="text-muted small">سابقه‌ای در سیستم ثبت نشده است.</p>'}

          <div class="footer">
            <div class="signature"><div class="sig-line"></div><div class="sig-text">مهر و امضای پزشک</div></div>
            <div class="signature"><div class="sig-line"></div><div class="sig-text">امضای بیمار / کارفرما</div></div>
          </div>
        </div>
        
        <script>
          window.onload = function() { setTimeout(function() { window.print(); }, 800); };
        <\/script>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(printHtml);
      printWindow.document.close();
    } else {
      alert('لطفا پاپ‌آپ مرورگر را برای چاپ فعال کنید.');
    }

  } catch (err) {
    console.error('Print error:', err);
    toast('خطا در چاپ پرونده: ' + err.message, 'danger');
  }
}
