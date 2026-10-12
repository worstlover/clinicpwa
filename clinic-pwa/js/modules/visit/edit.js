// js/modules/visit/edit.js
import { sb } from '../../sb.js';
import { $, escapeHtml, gregorianToJalali, jalaliToGregorian } from '../../utils.js';
import { state, INJURY_MAP, loadRefs } from './state.js';
import { canEditClinical, canEditIncident, isIncidentOnlyMode, getTimeStr, getIncLabel } from './helpers.js';
import { renderEditBodyMap } from './bodymap.js';
import { logChange } from './changelog.js';
import { openDetail } from './detail.js';

export async function openEditModal(visit) {
  const existing = document.getElementById('visitEditModal');
  if (existing) existing.remove();

  await loadRefs();

  const incidentOnly = isIncidentOnlyMode(visit);
  const canClinical = canEditClinical(visit);
  const canIncident = canEditIncident(visit);

  let editInjuries = [...(visit.injuries || [])];
  let editItems = [...(visit.items || [])];
  let editIsIncident = visit.is_incident === true;
  let editIncidentType = visit.incident_type || 'none';

  const disAttr = canClinical ? '' : 'disabled';
  const disClass = canClinical ? '' : 'field-disabled';

  if (!document.getElementById('visitEditStyles')) {
    const style = document.createElement('style');
    style.id = 'visitEditStyles';
    style.textContent = `
      .field-disabled { background-color: #f1f5f9 !important; color: #94a3b8 !important; cursor: not-allowed !important; opacity: 0.7; }
      .section-disabled { position: relative; opacity: 0.6; pointer-events: none; }
      .section-disabled::before { content: '🔒 فقط خواندنی'; position: absolute; top: 8px; left: 12px; font-size: 0.7rem; color: #94a3b8; background: #fff; padding: 2px 8px; border-radius: 8px; z-index: 2; }
    `;
    document.head.appendChild(style);
  }

  const renderEditItems = () => {
    if (!editItems.length) return '<div class="text-center muted small py-3">دارویی ثبت نشده</div>';
    return editItems.map((it, i) => `
      <div class="item-card" style="margin-bottom:6px;">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div class="name">${escapeHtml(it.drug?.name || it.drug_name || '—')}</div>
          ${canClinical ? `<button type="button" class="num-btn" style="width:32px;height:32px;" data-edit-item-remove="${i}">
            <i class="bi bi-trash text-danger"></i></button>` : ''}
        </div>
        <div class="d-flex align-items-center gap-2 mb-2">
          <label class="muted small">تعداد:</label>
          ${canClinical ? `<button type="button" class="num-btn" style="width:30px;height:30px;" data-edit-item-dec="${i}">−</button>` : ''}
          <input type="number" class="form-control form-control-sm text-center ${disClass}" style="max-width:70px;"
            value="${it.quantity}" min="1" data-edit-item-qty="${i}" ${disAttr}>
          ${canClinical ? `<button type="button" class="num-btn" style="width:30px;height:30px;" data-edit-item-inc="${i}">+</button>` : ''}
        </div>
        <input type="text" class="form-control form-control-sm ${disClass}" placeholder="دستور مصرف..."
          value="${escapeHtml(it.notes || '')}" data-edit-item-notes="${i}" ${disAttr}>
      </div>
    `).join('');
  };

  const modalHtml = `
    <div class="modal fade" id="visitEditModal" tabindex="-1" data-bs-backdrop="static">
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
        <div class="modal-content">
          <div class="modal-header ${incidentOnly ? 'bg-danger text-white' : 'bg-warning text-dark'}">
            <h5 class="modal-title">
              <i class="bi ${incidentOnly ? 'bi-shield-exclamation' : 'bi-pencil-square'}"></i>
              ${incidentOnly ? 'ویرایش اطلاعات حادثه' : 'ویرایش کامل ویزیت'}
            </h5>
            <button type="button" class="btn-close ${incidentOnly ? 'btn-close-white' : ''}" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" style="max-height:75vh;overflow-y:auto;">
            ${incidentOnly ? `
              <div class="alert alert-warning small mb-3">
                <i class="bi bi-info-circle"></i>
                <strong>حالت محدود:</strong> شما فقط می‌توانید اطلاعات حادثه را ویرایش کنید.
              </div>
            ` : ''}

            <div class="mb-3 p-3" style="background:#f8fafc;border-radius:12px;">
              <label class="form-label fw-bold mb-2">نوع مراجعه</label>
              <div class="row g-2">
                <div class="col-6">
                  <button type="button" class="btn w-100 ${!editIsIncident ? 'btn-success' : 'btn-outline-success'}"
                    data-edit-incident="no" ${canIncident ? '' : 'disabled'}>✅ مراجعه عادی</button>
                </div>
                <div class="col-6">
                  <button type="button" class="btn w-100 ${editIsIncident ? 'btn-warning' : 'btn-outline-warning'}"
                    data-edit-incident="yes" ${canIncident ? '' : 'disabled'}>⚠️ حادثه</button>
                </div>
              </div>
            </div>

            <div id="editIncidentSection" class="${editIsIncident ? '' : 'hidden'}" style="background:#fff7ed;border:2px solid #fed7aa;border-radius:12px;padding:16px;margin-bottom:16px;">
              <h6 style="color:#92400e;font-weight:700;margin-bottom:14px;">
                <i class="bi bi-exclamation-triangle"></i> اطلاعات حادثه
              </h6>
              <div class="mb-3">
                <label class="form-label small">نوع حادثه</label>
                <select class="form-select ${disClass}" id="editIncType" ${disAttr}>
                  <option value="near_miss" ${editIncidentType === 'near_miss' ? 'selected' : ''}>🔵 شبه حادثه</option>
                  <option value="minor" ${editIncidentType === 'minor' ? 'selected' : ''}>🟡 حادثه جزئی</option>
                  <option value="major" ${editIncidentType === 'major' ? 'selected' : ''}>🔴 حادثه ماژور</option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label small">محل حادثه</label>
                <input type="text" class="form-control ${disClass}" id="editIncLoc"
                  value="${escapeHtml(visit.incident_location?.name || '')}"
                  list="editIncLocList" ${disAttr}>
                <datalist id="editIncLocList">
                  ${state.incidentLocations.map(l => `<option value="${escapeHtml(l.name)}">`).join('')}
                </datalist>
              </div>
              <div class="mb-3">
                <label class="form-label small">شرح حادثه / گزارش</label>
                <textarea class="form-control ${disClass}" id="editIncDesc" rows="3" ${disAttr}>${escapeHtml(visit.incident_description || '')}</textarea>
              </div>
              <div class="mb-2">
                <label class="form-label small">نواحی مصدومیت</label>
                <div id="editBodyMapContainer">${renderEditBodyMap(editInjuries, canIncident)}</div>
              </div>
            </div>

            <div class="mb-3 ${canClinical ? '' : 'section-disabled'}" style="background:#f8fafc;border-radius:12px;padding:16px;">
              <h6 class="mb-3" style="font-weight:700;"><i class="bi bi-file-medical"></i> اطلاعات ویزیت</h6>
              <div class="mb-3">
                <label class="form-label small">تاریخ ویزیت (شمسی)</label>
                <input type="text" class="form-control ${disClass}" id="editDate"
                  value="${escapeHtml(gregorianToJalali(visit.visit_date) + ' ' + (getTimeStr(visit.visit_date) || '12:00'))}"
                  dir="ltr" ${disAttr}>
              </div>
              <div class="mb-3">
                <label class="form-label small">علت مراجعه</label>
                <select class="form-select ${disClass}" id="editReason" ${disAttr}>
                  <option value="">انتخاب کنید...</option>
                  ${state.reasons.map(r => `<option value="${r.id}" ${visit.reason_for_visit_id == r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                </select>
              </div>
              <div class="mb-0">
                <label class="form-label small">نتیجه درمان</label>
                <select class="form-select ${disClass}" id="editTreatment" ${disAttr}>
                  <option value="">انتخاب کنید...</option>
                  ${state.treatments.map(t => `<option value="${t.id}" ${visit.treatment_result_id == t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="mb-3 ${canClinical ? '' : 'section-disabled'}" style="background:#f8fafc;border-radius:12px;padding:16px;">
              <h6 class="mb-3" style="font-weight:700;"><i class="bi bi-heart-pulse"></i> علائم حیاتی</h6>
              <div class="row g-2">
                <div class="col-6 col-md-4"><label class="form-label small">فشار خون</label>
                  <input type="text" class="form-control ${disClass}" id="editBP" value="${escapeHtml(visit.blood_pressure || '')}" dir="ltr" ${disAttr}></div>
                <div class="col-6 col-md-4"><label class="form-label small">ضربان قلب</label>
                  <input type="number" class="form-control ${disClass}" id="editHR" value="${visit.heart_rate || ''}" ${disAttr}></div>
                <div class="col-6 col-md-4"><label class="form-label small">SpO2 %</label>
                  <input type="number" class="form-control ${disClass}" id="editSpo2" value="${visit.spo2 || ''}" ${disAttr}></div>
                <div class="col-6 col-md-4"><label class="form-label small">دما °C</label>
                  <input type="number" step="0.1" class="form-control ${disClass}" id="editTemp" value="${visit.temperature || ''}" ${disAttr}></div>
                <div class="col-6 col-md-4"><label class="form-label small">قند خون</label>
                  <input type="number" step="0.1" class="form-control ${disClass}" id="editSugar" value="${visit.blood_sugar || ''}" ${disAttr}></div>
                <div class="col-6 col-md-4"><label class="form-label small">قد (cm)</label>
                  <input type="number" step="0.1" class="form-control ${disClass}" id="editHeight" value="${visit.height_cm || ''}" ${disAttr}></div>
                <div class="col-6 col-md-4"><label class="form-label small">وزن (kg)</label>
                  <input type="number" step="0.1" class="form-control ${disClass}" id="editWeight" value="${visit.weight_kg || ''}" ${disAttr}></div>
              </div>
              <h6 class="mt-3 mb-2" style="font-weight:700;">🧠 GCS</h6>
              <div class="row g-2">
                <div class="col-4"><label class="form-label small">E</label>
                  <select class="form-select ${disClass}" id="editGcsE" ${disAttr}><option value="">-</option>
                    ${[1,2,3,4].map(n=>`<option value="${n}" ${visit.gcs_eye == n ? 'selected' : ''}>${n}</option>`).join('')}
                  </select></div>
                <div class="col-4"><label class="form-label small">V</label>
                  <select class="form-select ${disClass}" id="editGcsV" ${disAttr}><option value="">-</option>
                    ${[1,2,3,4,5].map(n=>`<option value="${n}" ${visit.gcs_verbal == n ? 'selected' : ''}>${n}</option>`).join('')}
                  </select></div>
                <div class="col-4"><label class="form-label small">M</label>
                  <select class="form-select ${disClass}" id="editGcsM" ${disAttr}><option value="">-</option>
                    ${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${visit.gcs_motor == n ? 'selected' : ''}>${n}</option>`).join('')}
                  </select></div>
              </div>
            </div>

            <div class="mb-3 ${canClinical ? '' : 'section-disabled'}" style="background:#f8fafc;border-radius:12px;padding:16px;">
              <h6 class="mb-3" style="font-weight:700;"><i class="bi bi-truck"></i> اعزام</h6>
              <div class="row g-2">
                <div class="col-6"><label class="form-label small">ساعت اعزام</label>
                  <input type="time" class="form-control ${disClass}" id="editDispatchTime"
                    value="${visit.dispatch_time ? new Date(visit.dispatch_time).toTimeString().slice(0,5) : ''}" ${disAttr}></div>
                <div class="col-6"><label class="form-label small">مقصد اعزام</label>
                  <input type="text" class="form-control ${disClass}" id="editDispatchDest"
                    value="${escapeHtml(visit.dispatch_destination || '')}" ${disAttr}></div>
              </div>
            </div>

            <div class="mb-3 ${canClinical ? '' : 'section-disabled'}" style="background:#f8fafc;border-radius:12px;padding:16px;">
              <h6 class="mb-3" style="font-weight:700;"><i class="bi bi-journal-medical"></i> تشخیص و ملاحظات</h6>
              <div class="mb-3"><label class="form-label small">تفسیر ECG</label>
                <textarea class="form-control ${disClass}" id="editECG" rows="2" ${disAttr}>${escapeHtml(visit.ecg_interpretation || '')}</textarea></div>
              <div class="mb-0"><label class="form-label small">شرح حال و ملاحظات</label>
                <textarea class="form-control ${disClass}" id="editNotes" rows="3" ${disAttr}>${escapeHtml(visit.notes || '')}</textarea></div>
            </div>

            <div class="mb-3 ${canClinical ? '' : 'section-disabled'}" style="background:#f8fafc;border-radius:12px;padding:16px;">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <h6 class="mb-0" style="font-weight:700;"><i class="bi bi-capsule"></i> داروهای تجویزی</h6>
                ${canClinical ? `<button type="button" class="btn btn-sm btn-outline-success" id="editAddDrugBtn">
                  <i class="bi bi-plus-circle"></i> افزودن</button>` : ''}
              </div>
              <div id="editItemsList">${renderEditItems()}</div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-light" data-bs-dismiss="modal">انصراف</button>
            <button class="btn ${incidentOnly ? 'btn-danger' : 'btn-warning'}" id="editSaveBtn">
              <i class="bi bi-check-circle"></i> ذخیره تغییرات
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  const modalEl = document.getElementById('visitEditModal');
  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  // تغییر نوع مراجعه
  modalEl.querySelectorAll('[data-edit-incident]').forEach(btn => {
    btn.onclick = () => {
      if (!canIncident) return;
      editIsIncident = btn.dataset.editIncident === 'yes';
      const section = document.getElementById('editIncidentSection');
      if (editIsIncident) section.classList.remove('hidden');
      else section.classList.add('hidden');
      modalEl.querySelectorAll('[data-edit-incident]').forEach(b => {
        const isYes = b.dataset.editIncident === 'yes';
        if (isYes) b.className = `btn w-100 ${editIsIncident ? 'btn-warning' : 'btn-outline-warning'}`;
        else b.className = `btn w-100 ${!editIsIncident ? 'btn-success' : 'btn-outline-success'}`;
      });
    };
  });

  // Body map
  const rebindEditBodyMap = () => {
    if (!canIncident) return;
    modalEl.querySelectorAll('[data-edit-part]').forEach(p => {
      p.onclick = () => {
        const key = p.dataset.editPart;
        const loc = INJURY_MAP[key];
        if (!loc) return;
        const idx = editInjuries.findIndex(x => x.id === loc.id);
        if (idx >= 0) editInjuries.splice(idx, 1);
        else editInjuries.push({ id: loc.id, name: loc.name, svg_key: key });
        document.getElementById('editBodyMapContainer').innerHTML = renderEditBodyMap(editInjuries, canIncident);
        rebindEditBodyMap();
      };
    });
    modalEl.querySelectorAll('.remove-part-edit').forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        const id = parseInt(b.dataset.id);
        editInjuries = editInjuries.filter(x => x.id !== id);
        document.getElementById('editBodyMapContainer').innerHTML = renderEditBodyMap(editInjuries, canIncident);
        rebindEditBodyMap();
      };
    });
  };
  rebindEditBodyMap();

  // Items
  const rebindEditItems = () => {
    document.getElementById('editItemsList').innerHTML = renderEditItems();
    if (!canClinical) return;
    modalEl.querySelectorAll('[data-edit-item-remove]').forEach(b => {
      b.onclick = () => { editItems.splice(parseInt(b.dataset.editItemRemove), 1); rebindEditItems(); };
    });
    modalEl.querySelectorAll('[data-edit-item-inc]').forEach(b => {
      b.onclick = () => { editItems[parseInt(b.dataset.editItemInc)].quantity++; rebindEditItems(); };
    });
    modalEl.querySelectorAll('[data-edit-item-dec]').forEach(b => {
      b.onclick = () => {
        const i = parseInt(b.dataset.editItemDec);
        if (editItems[i].quantity > 1) editItems[i].quantity--;
        rebindEditItems();
      };
    });
    modalEl.querySelectorAll('[data-edit-item-qty]').forEach(inp => {
      inp.oninput = () => {
        const i = parseInt(inp.dataset.editItemQty);
        editItems[i].quantity = Math.max(1, parseInt(inp.value) || 1);
      };
    });
    modalEl.querySelectorAll('[data-edit-item-notes]').forEach(inp => {
      inp.oninput = () => {
        const i = parseInt(inp.dataset.editItemNotes);
        editItems[i].notes = inp.value;
      };
    });
  };
  rebindEditItems();

  if (canClinical) {
    document.getElementById('editAddDrugBtn').onclick = async () => {
      const { openDrugSearch } = await import('../../modals.js');
      openDrugSearch('دارو را جستجو کنید', (drug) => {
        const ex = editItems.find(x => x.drug_id === drug.id);
        if (ex) ex.quantity++;
        else editItems.push({ drug_id: drug.id, drug_name: drug.name, quantity: 1, notes: '' });
        rebindEditItems();
      });
    };
  }

  document.getElementById('editSaveBtn').onclick = async () => {
    await saveEdit(visit, modal, {
      incidentOnly, canClinical, canIncident,
      editInjuries, editItems, editIsIncident, editIncidentType
    });
  };

  modalEl.addEventListener('hidden.bs.modal', () => {
    document.getElementById('visitEditModal')?.remove();
  });
}

// ═══════════════════════════════════════════════════════
// ذخیره
// ═══════════════════════════════════════════════════════
async function saveEdit(visit, modal, ctx) {
  const { incidentOnly, canClinical, canIncident, editInjuries, editItems, editIsIncident, editIncidentType } = ctx;

  const getVal = id => document.getElementById(id)?.value?.trim() || null;
  const getNum = id => {
    const v = document.getElementById(id)?.value?.trim();
    return v ? parseFloat(v) : null;
  };
  const getInt = id => {
    const v = document.getElementById(id)?.value?.trim();
    return v ? parseInt(v) : null;
  };

  const newData = {};
  const changes = [];

  const labelMap = {
    is_incident: 'نوع مراجعه', incident_type: 'نوع حادثه',
    incident_location_id: 'محل حادثه', incident_description: 'شرح حادثه',
    reason_for_visit_id: 'علت مراجعه', treatment_result_id: 'نتیجه درمان',
    visit_date: 'تاریخ ویزیت', blood_pressure: 'فشار خون',
    heart_rate: 'ضربان قلب', spo2: 'SpO2', temperature: 'دما',
    blood_sugar: 'قند خون', height_cm: 'قد', weight_kg: 'وزن',
    gcs_eye: 'GCS-E', gcs_verbal: 'GCS-V', gcs_motor: 'GCS-M',
    ecg_interpretation: 'تفسیر ECG', notes: 'ملاحظات',
    dispatch_time: 'ساعت اعزام', dispatch_destination: 'مقصد اعزام'
  };

  // حادثه
  if (canIncident) {
    if (editIsIncident !== visit.is_incident) {
      newData.is_incident = editIsIncident;
      changes.push({
        field: 'is_incident', label: 'نوع مراجعه',
        old: visit.is_incident ? 'حادثه' : 'مراجعه عادی',
        new: editIsIncident ? 'حادثه' : 'مراجعه عادی'
      });
    }

    if (editIsIncident) {
      const newIncType = getVal('editIncType') || 'near_miss';
      if (newIncType !== visit.incident_type) {
        newData.incident_type = newIncType;
        changes.push({
          field: 'incident_type', label: 'نوع حادثه',
          old: getIncLabel(visit.incident_type), new: getIncLabel(newIncType)
        });
      }

      const newIncLocName = getVal('editIncLoc');
      const oldIncLocName = visit.incident_location?.name || '';
      if (newIncLocName && newIncLocName !== oldIncLocName) {
        const found = state.incidentLocations.find(l => l.name === newIncLocName);
        let locId;
        if (found) locId = found.id;
        else {
          const { data } = await sb.from('visits_incidentlocation')
            .insert({ name: newIncLocName, is_active: true, usage_count: 1 }).select().single();
          if (data) locId = data.id;
        }
        if (locId) {
          newData.incident_location_id = locId;
          changes.push({ field: 'incident_location_id', label: 'محل حادثه', old: oldIncLocName || '—', new: newIncLocName });
        }
      } else if (!newIncLocName && visit.incident_location_id) {
        newData.incident_location_id = null;
        changes.push({ field: 'incident_location_id', label: 'محل حادثه', old: oldIncLocName,
