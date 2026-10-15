// js/modules/visit-reports.js
import { sb } from '../sb.js';
import { $, escapeHtml, gregorianToJalali, jalaliToGregorian, todayJalali } from '../utils.js';
import { showScreen } from '../ui.js';

function showScreenDirect(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen' + name);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
}

export function openVisitReports() {
  showScreenDirect('VisitReports');
  const wrap = $('visitReportsContent');
  if (!wrap) return;
  renderShell(wrap);
}

function renderShell(wrap) {
  const today = todayJalali();
  wrap.innerHTML = `
    <div class="report-page">
      <div class="report-header">
        <div class="report-header-title">گزارش ویزیت‌ها</div>
        <div class="report-header-sub">گزارش جامع و جزئیات مراجعات</div>
      </div>
      <div class="report-filters">
        <div class="report-filter-row">
          <label>از تاریخ</label>
          <input type="text" id="visitRepDateFrom" placeholder="1404/01/01" value="${today.slice(0,4)}/01/01" dir="ltr">
        </div>
        <div class="report-filter-row">
          <label>تا تاریخ</label>
          <input type="text" id="visitRepDateTo" placeholder="1404/12/29" value="${today}" dir="ltr">
        </div>
        <div class="report-filter-actions">
          <button class="btn btn-primary w-100" id="visitRepRun">تهیه گزارش</button>
        </div>
      </div>
      <div id="visitReportResult"></div>
    </div>
  `;

  $('visitRepRun').onclick = () => runReport();
}

async function runReport() {
  const dateFrom = $('visitRepDateFrom').value.trim();
  const dateTo = $('visitRepDateTo').value.trim();
  if (!dateFrom || !dateTo) { toast('تاریخ شروع و پایان را وارد کنید', 'warning'); return; }

  const gregFrom = jalaliToGregorian(dateFrom);
  const gregTo = jalaliToGregorian(dateTo);
  if (!gregFrom || !gregTo) { toast('تاریخ نامعتبر است', 'danger'); return; }

  const resultEl = $('visitReportResult');
  resultEl.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>';

  try {
    const { data: visits, error } = await sb.from('visits_visit')
      .select('*')
      .gte('visit_date', gregFrom + 'T00:00:00')
      .lte('visit_date', gregTo + 'T23:59:59')
      .order('visit_date', { ascending: false });

    if (error) throw error;
    renderReport(visits || [], dateFrom, dateTo);
  } catch (e) {
    resultEl.innerHTML = `<div class="alert alert-danger">خطا در دریافت داده‌ها: ${escapeHtml(e.message)}</div>`;
  }
}

function renderReport(visits, dateFrom, dateTo) {
  const resultEl = $('visitReportResult');
  if (!visits.length) {
    resultEl.innerHTML = '<div class="alert alert-info text-center">ویزیتی در این بازه یافت نشد</div>';
    return;
  }

  // محاسبه آمار
  const total = visits.length;
  const incidents = visits.filter(v => v.incident_type && v.incident_type !== 'none').length;
  const referrals = visits.filter(v => v.treatment_result_id === 4).length; // فرض: 4 = ارجاع
  const completed = visits.filter(v => v.status === 'completed').length;

  // توزیع علت مراجعه
  const reasonCounts = {};
  visits.forEach(v => {
    const r = v.reason_id || 'نامشخص';
    reasonCounts[r] = (reasonCounts[r] || 0) + 1;
  });

  // توزیع شرکت‌ها
  const companyCounts = {};
  visits.forEach(v => {
    const c = v.patient_company_id || 'نامشخص';
    companyCounts[c] = (companyCounts[c] || 0) + 1;
  });

  resultEl.innerHTML = `
    <div class="report-summary">
      <div class="report-summary-title">خلاصه گزارش از ${escapeHtml(dateFrom)} تا ${escapeHtml(dateTo)}</div>
      <div class="report-summary-grid">
        <div class="report-stat"><div class="report-stat-value">${total}</div><div class="report-stat-label">کل ویزیت</div></div>
        <div class="report-stat"><div class="report-stat-value">${incidents}</div><div class="report-stat-label">حوادث</div></div>
        <div class="report-stat"><div class="report-stat-value">${referrals}</div><div class="report-stat-label">ارجاعی</div></div>
        <div class="report-stat"><div class="report-stat-value">${completed}</div><div class="report-stat-label">تکمیل‌شده</div></div>
      </div>
    </div>
    <div class="report-actions">
      <button class="btn btn-outline-primary" onclick="window.print()"><i class="bi bi-printer"></i> چاپ گزارش</button>
    </div>
    <div class="report-table-wrap">
      <table class="report-table">
        <thead><tr><th>#</th><th>تاریخ</th><th>بیمار</th><th>علت مراجعه</th><th>نتیجه</th><th>وضعیت</th></tr></thead>
        <tbody>
          ${visits.map((v, i) => `
            <tr>
              <td>${i+1}</td>
              <td>${escapeHtml(gregorianToJalali(v.visit_date?.split('T')[0]) || '—')}</td>
              <td>${escapeHtml(v.patient_name || '—')}</td>
              <td>${escapeHtml(v.reason_name || '—')}</td>
              <td>${escapeHtml(v.treatment_result_name || '—')}</td>
              <td>${escapeHtml(v.status === 'completed' ? 'تکمیل' : v.status || '—')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
