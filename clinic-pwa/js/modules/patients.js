// js/modules/patients.js
import { sb } from '../sb.js';
import { $, faNum, faToEn, escapeHtml, gregorianToJalali, toast } from '../utils.js';
import { showScreen } from '../ui.js';
import { printA4 } from './list-print.js';

const state = {
  page: 1,
  query: '',
  rows: [],
  total: 0,
  loading: false,
  PAGE_SIZE: 20
};

export function openPatients() {
  showScreen('Patients');
  state.page = 1;
  state.query = '';
  renderView();
}

function renderView() {
  const c = $('patientContent');
  if (!c) return;
  
  c.innerHTML = `
    <div class="card mb-3">
      <div class="card-body py-3">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div>
            <div class="fw-bold"><i class="bi bi-people text-primary"></i> مدیریت بیماران</div>
            <div class="muted small">لیست و سوابق بیماران</div>
          </div>
        </div>
        <div class="input-group mt-2">
          <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
          <input type="text" class="form-control" id="patSearch" placeholder="نام، کد ملی، کد پرسنلی...">
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

  loadPatients();
}

async function loadPatients() {
  const box = $('patListBox');
  box.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

  try {
    let q = sb.from('core_patient')
      .select('id, first_name, last_name, national_code, personnel_number, phone_number, gender, date_of_birth', { count: 'exact' })
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
    box.innerHTML = '<div class="card text-center py-5 muted"><i class="bi bi-person-x" style="font-size:2rem;opacity:0.5;"></i><div class="mt-2">بیماری یافت نشد</div></div>';
    updatePager();
    return;
  }

  box.innerHTML = state.rows.map(p => {
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
    const meta = [];
    if (p.national_code) meta.push(`کد ملی: ${p.national_code}`);
    if (p.personnel_number) meta.push(`پرسنلی: ${p.personnel_number}`);
    
    return `
      <div class="item-card" data-id="${p.id}" style="cursor:pointer;">
        <div class="d-flex justify-content-between align-items-center">
          <div class="flex-grow-1">
            <div class="name fw-bold text-primary">${escapeHtml(name)}</div>
            <div class="meta text-muted">
              <i class="bi bi-person-vcard"></i> ${meta.join(' | ') || 'بدون شناسه'}
            </div>
            ${p.phone_number ? `<div class="meta text-muted"><i class="bi bi-phone"></i> ${escapeHtml(p.phone_number)}</div>` : ''}
          </div>
          <i class="bi bi-chevron-left text-muted"></i>
        </div>
      </div>
    `;
  }).join('');

  box.querySelectorAll('.item-card').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.id;
      const row = state.rows.find(x => String(x.id) === id);
      if (row) openPatientDetail(row);
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
// پروفایل بیمار (Modals)
// ═══════════════════════════════════════════════════════════
async function openPatientDetail(patient) {
  const modalId = 'patientDetailModal';
  document.getElementById(modalId)?.remove();

  const html = `
    <div class="modal fade" id="${modalId}" tabindex="-1" data-bs-backdrop="static">
      <div class="modal-dialog modal-dialog-scrollable modal-lg">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title"><i class="bi bi-person-badge"></i> پرونده بیمار</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="patDetailBody">
            <div class="text-center py-5"><div class="spinner-border text-primary"></div></div>
          </div>
          <div class="modal-footer d-flex justify-content-between">
            <button class="btn btn-secondary" data-bs-dismiss="modal">بستن</button>
            <div>
              <button class="btn btn-outline-primary" id="btnEditPatient"><i class="bi bi-pencil"></i> ویرایش بیمار</button>
              <button class="btn btn-success" id="btnPrintPatient"><i class="bi bi-printer"></i> چاپ پرونده</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  const modalEl = document.getElementById(modalId);
  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  const body = modalEl.querySelector('#patDetailBody');

  try {
    // گرفتن ویزیت‌ها و سوابق
    const { data: visits } = await sb.from('visits_visit')
      .select('id, visit_date, status, reason:visits_reasonforvisit(name), result:visits_treatmentresult(name)')
      .eq('patient_id', patient.id)
      .order('visit_date', { ascending: false });

    const name = `${patient.first_name || ''} ${patient.last_name || ''}`.trim();
    
    body.innerHTML = `
      <div class="card mb-3 border-primary">
        <div class="card-body">
          <h5 class="fw-bold mb-3">${escapeHtml(name)}</h5>
          <div class="row g-2 text-sm">
            <div class="col-6"><strong>کد ملی:</strong> ${escapeHtml(patient.national_code || '-')}</div>
            <div class="col-6"><strong>کد پرسنلی:</strong> ${escapeHtml(patient.personnel_number || '-')}</div>
            <div class="col-6"><strong>تلفن:</strong> ${escapeHtml(patient.phone_number || '-')}</div>
            <div class="col-6"><strong>جنسیت:</strong> ${patient.gender === 'm' || patient.gender === 'male' ? 'مرد' : 'زن'}</div>
            <div class="col-6"><strong>تاریخ تولد:</strong> ${patient.date_of_birth ? gregorianToJalali(patient.date_of_birth) : '-'}</div>
          </div>
        </div>
      </div>

      <h6 class="fw-bold mt-4 mb-2"><i class="bi bi-clock-history text-primary"></i> سوابق ویزیت (${faNum(visits?.length || 0)})</h6>
      ${visits?.length ? `
        <div class="list-group">
          ${visits.map(v => `
            <div class="list-group-item d-flex justify-content-between align-items-center">
              <div>
                <div class="fw-bold">${escapeHtml(v.reason?.name || 'ویزیت')}</div>
                <div class="small text-muted">${gregorianToJalali(v.visit_date)} - ${escapeHtml(v.result?.name || '')}</div>
              </div>
              <span class="badge ${v.status === 'completed' ? 'bg-success' : 'bg-warning text-dark'}">
                ${v.status === 'completed' ? 'تکمیل شده' : 'در انتظار'}
              </span>
            </div>
          `).join('')}
        </div>
      ` : '<div class="text-muted small">ویزیتی ثبت نشده است.</div>'}

      <h6 class="fw-bold mt-4 mb-2"><i class="bi bi-shield-check text-info"></i> سوابق طب کار</h6>
      <div class="text-muted small" id="occList">در حال بررسی...</div>
    `;

    // بررسی طب کار (اگر جدول دارید)
    const { data: occ } = await sb.from('occupational_exams').select('*').eq('patient_id', patient.id);
    if (occ?.length) {
      document.getElementById('occList').innerHTML = occ.map(o => `
        <div class="list-group-item small">
          <div>تاریخ: ${gregorianToJalali(o.created_at)}</div>
        </div>
      `).join('');
    } else {
      document.getElementById('occList').innerHTML = '<div class="text-muted small">سابقه طب کار ثبت نشده است.</div>';
    }

    // دکمه‌ها
    modalEl.querySelector('#btnEditPatient').onclick = () => openEditPatientModal(patient, modal);
    
    modalEl.querySelector('#btnPrintPatient').onclick = () => {
      printA4({
        title: 'پرونده بیمار',
        subtitle: name,
        primaryColor: '#0d6efd',
        headerMeta: { date: gregorianToJalali(new Date().toISOString().slice(0,10)) },
        columns: [
          { label: '#', formatter: (r, i) => faNum(i + 1) },
          { label: 'علت مراجعه', formatter: r => r.reason?.name || '-' },
          { label: 'تاریخ', formatter: r => gregorianToJalali(r.visit_date) },
          { label: 'نتیجه', formatter: r => r.result?.name || '-' },
          { label: 'وضعیت', formatter: r => r.status === 'completed' ? 'تکمیل' : 'در انتظار' }
        ],
        rows: visits || [],
        signatures: ['پزشک', 'تأییدکننده']
      });
    };

  } catch (e) {
    body.innerHTML = `<div class="alert alert-danger">خطا در دریافت اطلاعات: ${escapeHtml(e.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════
// ویرایش بیمار
// ═══════════════════════════════════════════════════════════
function openEditPatientModal(patient, parentModal) {
  const editModalId = 'editPatientModal';
  document.getElementById(editModalId)?.remove();

  const html = `
    <div class="modal fade" id="${editModalId}" tabindex="-1" style="z-index: 1060;">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">ویرایش اطلاعات بیمار</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row g-2">
              <div class="col-6"><label class="form-label small">نام</label><input type="text" id="epFirstName" class="form-control" value="${escapeHtml(patient.first_name || '')}"></div>
              <div class="col-6"><label class="form-label small">نام خانوادگی</label><input type="text" id="epLastName" class="form-control" value="${escapeHtml(patient.last_name || '')}"></div>
              <div class="col-6"><label class="form-label small">کد ملی</label><input type="text" id="epNational" class="form-control" dir="ltr" value="${escapeHtml(patient.national_code || '')}"></div>
              <div class="col-6"><label class="form-label small">کد پرسنلی</label><input type="text" id="epPersonnel" class="form-control" dir="ltr" value="${escapeHtml(patient.personnel_number || '')}"></div>
              <div class="col-6"><label class="form-label small">تلفن</label><input type="text" id="epPhone" class="form-control" dir="ltr" value="${escapeHtml(patient.phone_number || '')}"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">انصراف</button>
            <button class="btn btn-primary" id="btnSaveEditPatient">ذخیره تغییرات</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  const editEl = document.getElementById(editModalId);
  const editModal = new bootstrap.Modal(editEl);
  editModal.show();

  document.getElementById('btnSaveEditPatient').onclick = async () => {
    const payload = {
      first_name: document.getElementById('epFirstName').value.trim(),
      last_name: document.getElementById('epLastName').value.trim(),
      national_code: document.getElementById('epNational').value.trim() || null,
      personnel_number: document.getElementById('epPersonnel').value.trim() || null,
      phone_number: document.getElementById('epPhone').value.trim() || null,
    };

    const btn = document.getElementById('btnSaveEditPatient');
    btn.disabled = true;
    btn.innerHTML = 'در حال ذخیره...';

    const { error } = await sb.from('core_patient').update(payload).eq('id', patient.id);
    
    if (error) {
      toast('خطا در ذخیره: ' + error.message, 'danger');
      btn.disabled = false;
      btn.innerHTML = 'ذخیره تغییرات';
    } else {
      toast('اطلاعات بیمار با موفقیت ویرایش شد', 'success');
      editModal.hide();
      parentModal.hide();
      loadPatients();
    }
  };
}
