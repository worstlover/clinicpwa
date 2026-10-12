// js/modules/visit/list.js
import { sb } from '../../sb.js';
import { $, faNum, escapeHtml, gregorianToJalali, toast } from '../../utils.js';
import { state, loadUserMapFromVisits } from './state.js';
import { getMyDjangoId, isSuperuser, isSafetyOrSupervisor, getUserName, getTimeStr, getIncLabel } from './helpers.js';
import { openCreate } from './create.js';

export async function renderList() {
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
    const safety = isSafetyOrSupervisor();

    let q = sb.from('visits_visit').select(`
      id, visit_date, status, is_incident, incident_type,
      blood_pressure, heart_rate, doctor_id, assigned_to_id,
      patient:core_patient(id, first_name, last_name, national_code, personnel_number),
      reason:visits_reasonforvisit(name),
      result:visits_treatmentresult(name)
    `).order('visit_date', { ascending: false }).limit(200);

    if (state.filter === 'completed') {
      q = q.eq('status', 'completed');
    } else if (state.filter === 'referred') {
      q = q.eq('status', 'referred');
      if (!superuser && myId) q = q.or(`doctor_id.eq.${myId},assigned_to_id.eq.${myId}`);
    } else {
      q = q.in('status', ['pending', 'referred']);
      if (!superuser && myId) {
        let orParts = [`doctor_id.eq.${myId}`, `assigned_to_id.eq.${myId}`];
        if (safety) orParts.push('is_incident.eq.true');
        q = q.or(orParts.join(','));
      }
    }

    const { data, error } = await q;
    if (error) throw error;
    state.visits = data || [];

    await loadUserMapFromVisits();

    const list = $('visitList');
    if (!state.visits.length) {
      list.innerHTML = `
        <div class="card text-center py-5 muted">
          <i class="bi bi-inbox" style="font-size:2.5rem;opacity:0.5;"></i>
          <div class="mt-2">ویزیتی یافت نشد</div>
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
      el.onclick = async () => {
        const { openDetail } = await import('./detail.js');
        openDetail(parseInt(el.dataset.visitId));
      };
    });

  } catch (e) {
    console.error(e);
    $('visitList').innerHTML = `<div class="alert alert-danger">خطا: ${escapeHtml(e.message)}</div>`;
  }
}
