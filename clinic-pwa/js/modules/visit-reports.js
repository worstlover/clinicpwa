// js/modules/visit-reports.js
import { sb } from '../sb.js';
import { $, escapeHtml, gregorianToJalali, jalaliToGregorian, todayJalali } from '../utils.js';

function showScreenDirect(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen' + name);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
}

let state = {
  visits: [],
  patients: {},
  reasons: {},
  results: {},
  companies: {},
};

export function openVisitReports() {
  showScreenDirect('VisitReports');
  const wrap = $('visitReportsContent');
  if (!wrap) return;

  const today = todayJalali();
  const year = today.split('/')[0];

  wrap.innerHTML = `
    <div class="vr-page">
      <div class="vr-header">
        <div class="vr-title">گزارش ویزیت‌ها</div>
        <div class="vr-sub">گزارش جامع مراجعات با جستجو و جزئیات</div>
      </div>

      <div class="vr-filters">
        <div class="vr-filter-field">
          <label>از تاریخ</label>
          <input type="text" id="vrDateFrom" value="${year}/01/01" dir="ltr" placeholder="1404/01/01">
        </div>
        <div class="vr-filter-field">
          <label>تا تاریخ</label>
          <input type="text" id="vrDateTo" value="${today}" dir="ltr" placeholder="1404/12/29">
        </div>
        <button class="btn btn-primary vr-run-btn" id="vrRun">
          <i class="bi bi-search"></i> تهیه گزارش
        </button>
      </div>

      <div id="vrResult"></div>
    </div>
  `;

  $('vrRun').onclick = runReport;
  $('vrDateFrom').addEventListener('keydown', e => { if (e.key === 'Enter') runReport(); });
  $('vrDateTo').addEventListener('keydown', e => { if (e.key === 'Enter') runReport(); });
}

async function runReport() {
  const dateFrom = $('vrDateFrom').value.trim();
  const dateTo = $('vrDateTo').value.trim();
  if (!dateFrom || !dateTo) { toast('تاریخ‌ها را وارد کنید', 'warning'); return; }

  const gregFrom = jalaliToGregorian(dateFrom);
  const gregTo = jalaliToGregorian(dateTo);
  if (!gregFrom || !gregTo) { toast('تاریخ نامعتبر', 'danger'); return; }

  const resultEl = $('vrResult');
  resultEl.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

  try {
    // واکشی ویزیت‌ها
    const { data: visits, error } = await sb.from('visits_visit')
      .select('*')
      .gte('visit_date', gregFrom + 'T00:00:00')
      .lte('visit_date', gregTo + 'T23:59:59')
      .order('visit_date', { ascending: false });

    if (error) throw error;

    if (!visits?.length) {
      resultEl.innerHTML = `<div class="vr-empty"><i class="bi bi-inbox"></i><div>ویزیتی در این بازه یافت نشد</div></div>`;
      return;
    }

    // واکشی جداول مرجع
    const patientIds = [...new Set(visits.map(v => v.patient_id).filter(Boolean))];
    const reasonIds = [...new Set(visits.map(v => v.reason_for_visit_id || v.reason_id).filter(Boolean))];
    const resultIds = [...new Set(visits.map(v => v.treatment_result_id).filter(Boolean))];

    const [patients, reasons, results] = await Promise.all([
      patientIds.length ? sb.from('core_patient').select('id, first_name, last_name, personnel_number, company_id').in('id', patientIds) : { data: [] },
      reasonIds.length ? sb.from('visits_reasonforvisit').select('id, name').in('id', reasonIds) : { data: [] },
      resultIds.length ? sb.from('visits_treatmentresult').select('id, name').in('id', resultIds) : { data: [] },
    ]);

    // شرکت‌ها
    const companyIds = [...new Set((patients.data || []).map(p => p.company_id).filter(Boolean))];
    const companies = companyIds.length
      ? await sb.from('core_company').select('id, name').in('id', companyIds)
      : { data: [] };

    state.patients = Object.fromEntries((patients.data || []).map(p => [p.id, p]));
    state.reasons = Object.fromEntries((reasons.data || []).map(r => [r.id, r]));
    state.results = Object.fromEntries((results.data || []).map(r => [r.id, r]));
    state.companies = Object.fromEntries((companies.data || []).map(c => [c.id, c]));

    renderReport(visits, dateFrom, dateTo);
  } catch (e) {
    console.error('[VR] error:', e);
    resultEl.innerHTML = `<div class="alert alert-danger">خطا: ${escapeHtml(e.message)}</div>`;
  }
}

function renderReport(visits, dateFrom, dateTo) {
  const resultEl = $('vrResult');

  // آمار
  const total = visits.length;
  const incidents = visits.filter(v => v.incident_type && v.incident_type !== 'none').length;
  const referrals = visits.filter(v => Number(v.treatment_result_id) === 4).length;
  const completed = visits.filter(v => v.status === 'completed').length;

  // توزیع علت مراجعه
  const reasonCounts = {};
  visits.forEach(v => {
    const r = state.reasons[v.reason_for_visit_id || v.reason_id]?.name || 'نامشخص';
    reasonCounts[r] = (reasonCounts[r] || 0) + 1;
  });
  const reasonEntries = Object.entries(reasonCounts).sort((a,b) => b[1] - a[1]);
  const maxReason = Math.max(...reasonEntries.map(e => e[1]), 1);

  // توزیع نتیجه درمان
  const resultCounts = {};
  visits.forEach(v => {
    const r = state.results[v.treatment_result_id]?.name || 'نامشخص';
    resultCounts[r] = (resultCounts[r] || 0) + 1;
  });
  const resultEntries = Object.entries(resultCounts).sort((a,b) => b[1] - a[1]);
  const maxResult = Math.max(...resultEntries.map(e => e[1]), 1);

  resultEl.innerHTML = `
    <!-- خلاصه -->
    <div class="vr-summary">
      <div class="vr-summary-title">بازه: ${escapeHtml(dateFrom)} تا ${escapeHtml(dateTo)}</div>
      <div class="vr-stats">
        <div class="vr-stat"><div class="vr-stat-val">${total.toLocaleString('fa-IR')}</div><div class="vr-stat-lbl">کل ویزیت</div></div>
        <div class="vr-stat danger"><div class="vr-stat-val">${incidents.toLocaleString('fa-IR')}</div><div class="vr-stat-lbl">حوادث</div></div>
        <div class="vr-stat info"><div class="vr-stat-val">${referrals.toLocaleString('fa-IR')}</div><div class="vr-stat-lbl">ارجاعی</div></div>
        <div class="vr-stat success"><div class="vr-stat-val">${completed.toLocaleString('fa-IR')}</div><div class="vr-stat-lbl">تکمیل</div></div>
      </div>
    </div>

    <!-- نمودار علت مراجعه -->
    <div class="vr-chart-section">
      <div class="vr-chart-title"><i class="bi bi-bar-chart-fill"></i> علت مراجعه</div>
      ${reasonEntries.length ? reasonEntries.map(([name, count]) => `
        <div class="vr-bar-row">
          <div class="vr-bar-label">${escapeHtml(name)}</div>
          <div class="vr-bar-track">
            <div class="vr-bar-fill" style="width:${(count/maxReason*100).toFixed(1)}%"></div>
          </div>
          <div class="vr-bar-value">${count.toLocaleString('fa-IR')}</div>
        </div>
      `).join('') : '<div class="vr-empty-small">داده‌ای نیست</div>'}
    </div>

    <!-- نمودار نتیجه درمان -->
    <div class="vr-chart-section">
      <div class="vr-chart-title"><i class="bi bi-clipboard2-check-fill"></i> نتیجه درمان</div>
      ${resultEntries.length ? resultEntries.map(([name, count]) => `
        <div class="vr-bar-row">
          <div class="vr-bar-label">${escapeHtml(name)}</div>
          <div class="vr-bar-track">
            <div class="vr-bar-fill success" style="width:${(count/maxResult*100).toFixed(1)}%"></div>
          </div>
          <div class="vr-bar-value">${count.toLocaleString('fa-IR')}</div>
        </div>
      `).join('') : '<div class="vr-empty-small">داده‌ای نیست</div>'}
    </div>

    <!-- دکمه چاپ -->
    <div class="vr-actions">
      <button class="btn btn-outline-primary w-100" onclick="window.print()">
        <i class="bi bi-printer"></i> چاپ گزارش
      </button>
    </div>

    <!-- لیست ویزیت‌ها -->
    <div class="vr-list-title">لیست ویزیت‌ها (${total.toLocaleString('fa-IR')} مورد)</div>
    <div class="vr-list">
      ${visits.map((v, i) => renderVisitRow(v, i)).join('')}
    </div>
  `;

  // کلیک روی هر ردیف
  resultEl.querySelectorAll('[data-visit-idx]').forEach(el => {
    el.onclick = () => {
      const idx = parseInt(el.dataset.visitIdx, 10);
      openVisitDetail(visits[idx]);
    };
  });
}

function renderVisitRow(v, idx) {
  const p = state.patients[v.patient_id] || {};
  const reason = state.reasons[v.reason_for_visit_id || v.reason_id]?.name || '—';
  const result = state.results[v.treatment_result_id]?.name || '—';
  const company = state.companies[p.company_id]?.name || '';
  const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'ناشناس';
  const dateStr = v.visit_date ? gregorianToJalali(v.visit_date.split('T')[0]) : '—';
  const isIncident = v.incident_type && v.incident_type !== 'none';

  return `
    <button class="vr-row ${isIncident ? 'incident' : ''}" data-visit-idx="${idx}">
      <div class="vr-row-num">${(idx+1).toLocaleString('fa-IR')}</div>
      <div class="vr-row-body">
        <div class="vr-row-head">
          <span class="vr-row-name">${escapeHtml(name)}</span>
          <span class="vr-row-date">${escapeHtml(dateStr)}</span>
        </div>
        <div class="vr-row-meta">
          ${p.personnel_number ? `<span><i class="bi bi-hash"></i> ${escapeHtml(p.personnel_number)}</span>` : ''}
          ${company ? `<span><i class="bi bi-building"></i> ${escapeHtml(company)}</span>` : ''}
        </div>
        <div class="vr-row-tags">
          ${reason !== '—' ? `<span class="vr-tag">علت: ${escapeHtml(reason)}</span>` : ''}
          ${result !== '—' ? `<span class="vr-tag success">نتیجه: ${escapeHtml(result)}</span>` : ''}
          ${isIncident ? `<span class="vr-tag danger">حادثه</span>` : ''}
        </div>
      </div>
      <i class="bi bi-chevron-left vr-row-arrow"></i>
    </button>
  `;
}

function openVisitDetail(v) {
  const p = state.patients[v.patient_id] || {};
  const reason = state.reasons[v.reason_for_visit_id || v.reason_id]?.name || '—';
  const result = state.results[v.treatment_result_id]?.name || '—';
  const company = state.companies[p.company_id]?.name || '—';
  const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'ناشناس';
  const dateStr = v.visit_date ? gregorianToJalali(v.visit_date.split('T')[0]) : '—';
  const timeStr = v.visit_date ? new Date(v.visit_date).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '—';

  const rows = [
    ['نام بیمار', name],
    ['کد پرسنلی', p.personnel_number || '—'],
    ['شرکت', company],
    ['تاریخ ویزیت', dateStr],
    ['ساعت ویزیت', timeStr],
    ['علت مراجعه', reason],
    ['نتیجه درمان', result],
    ['وضعیت', v.status === 'completed' ? 'تکمیل' : v.status || '—'],
    ['نوع حادثه', v.incident_type && v.incident_type !== 'none' ? v.incident_type : '—'],
    ['فشار خون', v.blood_pressure || '—'],
    ['نبض', v.heart_rate || '—'],
    ['دما', v.temperature || '—'],
    ['SpO₂', v.spo2 || '—'],
  ];

  const sheet = document.createElement('div');
  sheet.className = 'vr-sheet';
  sheet.innerHTML = `
    <div class="vr-sheet-handle"></div>
    <div class="vr-sheet-title">جزئیات ویزیت</div>
    <table class="vr-detail-table">
      ${rows.map(([k, val]) => `
        <tr><td class="vr-detail-key">${escapeHtml(k)}</td><td class="vr-detail-val">${escapeHtml(String(val))}</td></tr>
      `).join('')}
    </table>
    <button class="btn btn-light w-100 mt-3" id="vrCloseSheet">بستن</button>
  `;

  const backdrop = document.createElement('div');
  backdrop.className = 'vr-backdrop';
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);

  const close = () => { backdrop.classList.add('closing'); setTimeout(() => backdrop.remove(), 200); };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  sheet.querySelector('#vrCloseSheet').onclick = close;
}
