// js/modules/visit/detail.js
import { sb } from '../../sb.js';
import { $, faNum, escapeHtml, gregorianToJalali } from '../../utils.js';
import { state } from './state.js';
import {
  getMyDjangoId, isSuperuser, isSafetyOrSupervisor,
  canEditClinical, canEditIncident, isIncidentOnlyMode, canEditVisit, canViewVisit,
  getUserName, getTimeStr, getIncLabel, getGCSStatus
} from './helpers.js';
import { loadChangeLog } from './changelog.js';
import { renderList } from './list.js';
import { openForm } from '../../forms/engine.js';
import { loadVisitExtra } from '../../extra-data.js';
import { mountProcessBanner } from '../../process/banner.js';

export async function openDetail(visitId) {
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

    if (!canViewVisit(v)) {
      c.innerHTML = `
        <div class="alert alert-danger text-center">
          <i class="bi bi-shield-x" style="font-size:2rem;"></i>
          <h5 class="mt-2">دسترسی ندارید</h5>
          <p>این ویزیت توسط شما ایجاد نشده و به شما ارجاع داده نشده است.</p>
          <button class="btn btn-outline-secondary mt-2" id="vBackDenied">بازگشت</button>
        </div>`;
      $('vBackDenied').onclick = () => { state.view = 'list'; renderList(); };
      return;
    }

    const [items, injuries, log, extraRes] = await Promise.all([
      sb.from('visits_visititem')
        .select('drug_id, quantity, notes, drug:drugs_drug(id, name)')
        .eq('visit_id', visitId),
      sb.from('visits_visit_injury_locations')
        .select('injurylocation_id, loc:visits_injurylocation(id, name, svg_key)')
        .eq('visit_id', visitId),
      loadChangeLog(visitId),
      loadVisitExtra(visitId).catch(() => ({ data: null }))
    ]);

    let itemsWithStock = items.data || [];
    if (itemsWithStock.length) {
      const drugIds = itemsWithStock.map(i => i.drug_id);
      const { data: stocks } = await sb.from('v_drug_stock')
        .select('drug_id, total_quantity').in('drug_id', drugIds);
      const stockMap = Object.fromEntries((stocks || []).map(s => [s.drug_id, s.total_quantity]));
      itemsWithStock = itemsWithStock.map(it => ({ ...it, available: stockMap[it.drug_id] || 0 }));
    }

    const injuriesFull = (injuries.data || [])
      .filter(x => x.loc)
      .map(x => ({ id: x.loc.id, name: x.loc.name, svg_key: x.loc.svg_key }));

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
      injuries: injuriesFull,
      changeLog: log,
      extra: extraRes?.data || {}
    };
    renderDetail();
  } catch (e) {
    console.error(e);
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
  const extra = v.extra || {};
  const isAdmitted = !!extra.is_admitted;
  const isDispatch = Number(v.treatment_result_id) === 4;
  const isReferral = Number(v.treatment_result_id) === 6;

  const isAssignee = v.assigned_to_id === getMyDjangoId();
  const isDoctor = v.doctor_id === getMyDjangoId();
  const superuser = isSuperuser();
  const safety = isSafetyOrSupervisor();
  const canRefer = (isAssignee || superuser) && v.status !== 'completed';
  const canComplete = (isAssignee || superuser) && v.status !== 'completed';

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
        ${isAdmitted ? `<div class="row-item d-flex justify-content-between">
          <span class="muted">بستری موقت</span>
          <span class="badge-soft warning"><i class="bi bi-hospital"></i> بله</span>
        </div>` : ''}
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
            <div>${v.injuries.map(i => `<span class="badge-soft danger" style="margin:2px;">${escapeHtml(i.name)}</span>`).join('')}</div>
          </div>` : ''}
        </div>
      </div>`;
  }

  const hasVitals = v.height_cm || v.weight_kg || v.blood_pressure || v.heart_rate || v.temperature || v.blood_sugar || v.spo2 || extra.rr;
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
            ${extra.rr ? cellBadge('RR', faNum(extra.rr), 'warning') : ''}
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

  if (v.dispatch_time || v.dispatch_destination || extra.companion_name || extra.transport_type) {
    html += `<div class="card">
      <div class="card-head warning"><i class="bi bi-truck"></i> اعزام / ارجاع</div>
      <div class="card-body">
        ${v.dispatch_time ? `<div class="row-item d-flex justify-content-between">
          <span class="muted">ساعت</span>
          <span>${new Date(v.dispatch_time).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>` : ''}
        ${v.dispatch_destination ? `<div class="row-item d-flex justify-content-between">
          <span class="muted">مقصد</span>
          <span>${escapeHtml(v.dispatch_destination)}</span>
        </div>` : ''}
        ${extra.transport_type ? `<div class="row-item d-flex justify-content-between">
          <span class="muted">نحوه</span>
          <span>${escapeHtml({
            ambulance: 'آمبولانس',
            agency: 'آژانس',
            personal: 'وسیله شخصی',
            transport: 'ترانسپورت',
            other: 'سایر'
          }[extra.transport_type] || extra.transport_type)}</span>
        </div>` : ''}
        ${extra.companion_needed ? `<div class="row-item">
          <div class="muted small mb-1">همراه:</div>
          <div>${escapeHtml(extra.companion_name || '—')} ${extra.companion_phone ? `— <span dir="ltr">${escapeHtml(extra.companion_phone)}</span>` : ''}</div>
        </div>` : ''}
      </div>
    </div>`;
  }

  if (v.items.length) {
    html += `<div class="card">
      <div class="card-head ${hasShortage ? 'danger' : 'success'}">
        <i class="bi bi-capsule"></i> داروهای تجویزی ${hasShortage ? '⚠️ (کمبود)' : ''}
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

  if (v.changeLog && v.changeLog.length) {
    html += `<div class="card">
      <div class="card-head" style="background:linear-gradient(135deg,#7c3aed,#6d28d9);">
        <i class="bi bi-clock-history"></i> تاریخچه تغییرات (${faNum(v.changeLog.length)})
      </div>
      <div class="card-body">`;

    v.changeLog.forEach(log => {
      const dt = new Date(log.created_at);
      const jdt = gregorianToJalali(log.created_at);
      const timeStr2 = String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
      const actionLabel = { create: 'ایجاد', edit: 'ویرایش', refer: 'ارجاع', complete: 'تکمیل' }[log.action] || log.action;
      const actionColor = { create: 'primary', edit: 'warning', refer: 'info', complete: 'success' }[log.action] || 'gray';

      html += `
        <div class="row-item" style="border-right:3px solid var(--${actionColor === 'gray' ? 'muted' : actionColor});padding-right:10px;">
          <div class="d-flex justify-content-between">
            <strong><i class="bi bi-person"></i> ${escapeHtml(log.user_name || 'نامشخص')}</strong>
            <span class="badge-soft ${actionColor}" style="font-size:0.65rem;">${actionLabel}</span>
          </div>
          <div class="small muted">${jdt} - ${timeStr2}</div>`;

      if (log.field_changes && log.field_changes.length) {
        log.field_changes.forEach(fc => {
          html += `<div class="small mt-1" style="font-size:0.75rem;">
            <span class="muted">${escapeHtml(fc.label || fc.field)}:</span>
            <span style="color:#dc3545;">${escapeHtml(String(fc.old ?? '—'))}</span>
            <i class="bi bi-arrow-left" style="margin:0 4px;"></i>
            <span style="color:#198754;">${escapeHtml(String(fc.new ?? '—'))}</span>
          </div>`;
        });
      }
      html += `</div>`;
    });
    html += `</div></div>`;
  }

  if (hasShortage && v.status !== 'completed') {
    html += `<div class="alert alert-danger">
      <i class="bi bi-exclamation-triangle"></i>
      <strong>موجودی برخی داروها کافی نیست.</strong>
      تا زمان تأمین موجودی، این ویزیت در وضعیت «در انتظار» می‌ماند.
    </div>`;
  }

  // ⭐️ کارت فرم‌های مرتبط
  html += `<div class="card" style="border:2px solid #6366f1;">
    <div class="card-head" style="background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;">
      <i class="bi bi-file-earmark-text"></i> فرم‌های مرتبط با این ویزیت
    </div>
    <div class="card-body">
      <div class="d-grid gap-2">
        ${v.status === 'completed' ? `<button type="button" class="btn btn-outline-primary" data-form-open="BR-FR-HS-34-00">
          <i class="bi bi-file-earmark-medical"></i> فرم بستری موقت مراجعه کننده
        </button>` : ''}
        ${isInc ? `<button type="button" class="btn btn-outline-danger" data-form-open="BR-FR-HS-36-00">
          <i class="bi bi-exclamation-triangle"></i> فرم گزارش حوادث ناشی از کار
        </button>` : ''}
        ${(isDispatch || isReferral) ? `<button type="button" class="btn btn-outline-warning" data-form-open="BR-FR-HS-37-00">
          <i class="bi bi-truck"></i> فرم اعزام / ارجاع به مرکز درمانی
        </button>` : ''}
        <button type="button" class="btn btn-outline-secondary" data-form-open="BR-FR-HS-38-00">
          <i class="bi bi-calendar-check"></i> فرم گزارش شیفت بهداری
        </button>
        <button type="button" class="btn btn-outline-secondary" data-form-open="BR-FR-HS-39-00">
          <i class="bi bi-trash3"></i> فرم تحویل Safety box
        </button>
      </div>
    </div>
  </div>`;

  html += `<div class="d-grid gap-2 mb-5">`;

  if (v.status !== 'completed') {
    const incidentOnly = isIncidentOnlyMode(v);
    const canClinicalNow = canEditClinical(v);

    if (canEditVisit(v)) {
      const btnLabel = incidentOnly ? 'ویرایش اطلاعات حادثه' : 'ویرایش ویزیت';
      const btnClass = incidentOnly ? 'btn-danger' : 'btn-warning';
      const btnIcon = incidentOnly ? 'bi-shield-exclamation' : 'bi-pencil-square';
      html += `<button class="btn ${btnClass} btn-lg py-3" id="vEditBtn">
        <i class="bi ${btnIcon}"></i> ${btnLabel}
      </button>`;
    }

    if (canRefer) {
      html += `<button class="btn btn-info text-white btn-lg py-3" id="vReferBtn">
        <i class="bi bi-share-fill"></i> ارجاع به کاربر دیگر
      </button>`;
    }

    if (canComplete) {
      html += `<button class="btn ${hasShortage ? 'btn-warning' : 'btn-success'} btn-lg py-3" id="vCompleteBtn">
        <i class="bi bi-check-circle-fill"></i>
        ${hasShortage ? 'تلاش برای تکمیل (نیاز به تأمین موجودی)' : 'تکمیل ویزیت'}
      </button>`;
    }

    if (incidentOnly) {
      html += `<div class="alert alert-warning small mb-0">
        <i class="bi bi-shield-exclamation"></i>
        شما فقط می‌توانید <strong>اطلاعات حادثه</strong> را ویرایش کنید.
        اطلاعات بالینی توسط مسئول ویزیت (<strong>${escapeHtml(assigneeName)}</strong>) قابل تغییر است.
      </div>`;
    }

    if (!canClinicalNow && isDoctor && !isAssignee && !safety) {
      html += `<div class="alert alert-info small mb-0">
        <i class="bi bi-info-circle"></i>
        این ویزیت به <strong>${escapeHtml(assigneeName)}</strong> ارجاع داده شده است.
      </div>`;
    }
  } else {
    html += `<div class="alert alert-success text-center">
      <i class="bi bi-check-circle-fill"></i> این ویزیت تکمیل شده است
    </div>`;
  }

  html += `<button class="btn btn-outline-secondary" id="vBackBtn">
    <i class="bi bi-arrow-right"></i> بازگشت
  </button></div>`;

  c.innerHTML = `<div id="visitBannerMount"></div>` + html;

  // ⭐️ نوار زمینه
  try {
    mountProcessBanner($('visitBannerMount'), 'visit-detail', {
      isIncident: isInc,
      isAdmitted,
      isDispatch,
      isReferral,
      visitId: v.id,
      patientId: v.patient_id,
      examId: null
    });
  } catch (e) { console.warn('banner failed', e); }

  const editBtn = $('vEditBtn');
  if (editBtn) editBtn.onclick = async () => {
    const { openEditModal } = await import('./edit.js');
    openEditModal(v);
  };

  const referBtn = $('vReferBtn');
  if (referBtn) referBtn.onclick = async () => {
    const { openReferralModal } = await import('./actions.js');
    openReferralModal(v);
  };

  const completeBtn = $('vCompleteBtn');
  if (completeBtn) completeBtn.onclick = async () => {
    const { completeVisit } = await import('./actions.js');
    completeVisit(v.id);
  };

  // ⭐️ بایند فرم‌ها
  document.querySelectorAll('[data-form-open]').forEach(b => {
    b.onclick = () => {
      try {
        const code = b.dataset.formOpen;
        openForm(code, {
          visitId: v.id,
          patientId: v.patient_id
        });
      } catch (err) {
        console.error('openForm failed', err);
      }
    };
  });

  const backBtn = $('vBackBtn');
  if (backBtn) backBtn.onclick = () => { state.view = 'list'; renderList(); };
}

function cellBadge(label, value, color) {
  return `<div class="col-4"><div class="badge-soft ${color} w-100" style="justify-content:center;padding:8px 4px;">${label}<br><strong>${value}</strong></div></div>`;
}
