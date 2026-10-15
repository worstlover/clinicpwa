// js/modules/visit-reports.js
import { sb } from '../sb.js';
import { $, escapeHtml, gregorianToJalali, jalaliToGregorian, todayJalali } from '../utils.js';

function showScreenDirect(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen' + name);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
}

let REF = { patients: {}, reasons: {}, results: {}, companies: {} };

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
        <div class="vr-sub">گزارش جامع مراجعات با فیلتر و جزئیات</div>
      </div>

      <div class="vr-filters">
        <div class="vr-filter-field">
          <label>از تاریخ</label>
          <input type="text" id="vrDateFrom" value="${year}/01/01" dir="ltr">
        </div>
        <div class="vr-filter-field">
          <label>تا تاریخ</label>
          <input type="text" id="vrDateTo" value="${today}" dir="ltr">
        </div>
        <div class="vr-filter-field">
          <label>شرکت</label>
          <select id="vrCompany" class="form-select"><option value="">همه</option></select>
        </div>
        <div class="vr-filter-field">
          <label>نوع</label>
          <select id="vrKind" class="form-select">
            <option value="all">همه</option>
            <option value="incident">فقط حادثه</option>
            <option value="non">غیرحادثه</option>
          </select>
        </div>
        <button class="btn btn-primary vr-run-btn" id="vrRun"><i class="bi bi-search"></i> تهیه گزارش</button>
      </div>

      <div id="vrResult"></div>
    </div>
  `;

  loadCompanies().then(() => {
    $('vrRun').onclick = runReport;
    runReport();
  });
}

async function loadCompanies() {
  try {
    const { data } = await sb.from('core_company').select('id, name').order('name');
    const sel = $('vrCompany');
    (data || []).forEach(c => {
      const o = document.createElement('option');
      o.value = c.id; o.textContent = c.name;
      sel.appendChild(o);
    });
  } catch (e) { console.warn(e); }
}

async function runReport() {
  const dateFrom = $('vrDateFrom').value.trim();
  const dateTo = $('vrDateTo').value.trim();
  const companyId = $('vrCompany').value;
  const kind = $('vrKind').value;
  if (!dateFrom || !dateTo) { toast('تاریخ‌ها را وارد کنید', 'warning'); return; }

  const gregFrom = jalaliToGregorian(dateFrom);
  const gregTo = jalaliToGregorian(dateTo);
  if (!gregFrom || !gregTo) { toast('تاریخ نامعتبر', 'danger'); return; }

  const resultEl = $('vrResult');
  resultEl.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

  try {
    let q = sb.from('visits_visit').select('*')
      .gte('visit_date', gregFrom + 'T00:00:00')
      .lte('visit_date', gregTo + 'T23:59:59')
      .order('visit_date', { ascending: false });
    const { data: visits, error } = await q;
    if (error) throw error;
    if (!visits?.length) { resultEl.innerHTML = `<div class="vr-empty"><i class="bi bi-inbox"></i><div>ویزیتی یافت نشد</div></div>`; return; }

    // واکشی جداول مرجع
    const pIds = [...new Set(visits.map(v => v.patient_id).filter(Boolean))];
    const rIds = [...new Set(visits.map(v => v.reason_for_visit_id || v.reason_id).filter(Boolean))];
    const tIds = [...new Set(visits.map(v => v.treatment_result_id).filter(Boolean))];

    const [pRes, rRes, tRes] = await Promise.all([
      pIds.length ? sb.from('core_patient').select('id, first_name, last_name, personnel_number, company_id').in('id', pIds) : { data: [] },
      rIds.length ? sb.from('visits_reasonforvisit').select('id, name').in('id', rIds) : { data: [] },
      tIds.length ? sb.from('visits_treatmentresult').select('id, name').in('id', tIds) : { data: [] },
    ]);

    const cIds = [...new Set((pRes.data || []).map(p => p.company_id).filter(Boolean))];
    const cRes = cIds.length ? await sb.from('core_company').select('id, name').in('id', cIds) : { data: [] };

    REF.patients = Object.fromEntries((pRes.data || []).map(p => [p.id, p]));
    REF.reasons = Object.fromEntries((rRes.data || []).map(r => [r.id, r]));
    REF.results = Object.fromEntries((tRes.data || []).map(r => [r.id, r]));
    REF.companies = Object.fromEntries((cRes.data || []).map(c => [c.id, c]));

    // فیلتر شرکت
    let filtered = visits;
    if (companyId) filtered = filtered.filter(v => String(REF.patients[v.patient_id]?.company_id) === String(companyId));
    // فیلتر نوع
    if (kind === 'incident') filtered = filtered.filter(v => v.incident_type && v.incident_type !== 'none');
    else if (kind === 'non') filtered = filtered.filter(v => !v.incident_type || v.incident_type === 'none');

    renderReport(filtered, dateFrom, dateTo);
  } catch (e) {
    console.error(e);
    resultEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
  }
}

function renderReport(visits, dateFrom, dateTo) {
  const el = $('vrResult');
  const total = visits.length;
  const incidents = visits.filter(v => v.incident_type && v.incident_type !== 'none').length;
  const referrals = visits.filter(v => Number(v.treatment_result_id) === 4).length;
  const completed = visits.filter(v => v.status === 'completed').length;

  // علت مراجعه
  const reasonCounts = {};
  visits.forEach(v => {
    const r = REF.reasons[v.reason_for_visit_id || v.reason_id]?.name || 'نامشخص';
    reasonCounts[r] = (reasonCounts[r] || 0) + 1;
  });
  const reasonEntries = Object.entries(reasonCounts).sort((a,b) => b[1]-a[1]);
  const maxReason = Math.max(...reasonEntries.map(e => e[1]), 1);

  // نتیجه درمان
  const resultCounts = {};
  visits.forEach(v => {
    const r = REF.results[v.treatment_result_id]?.name || 'نامشخص';
    resultCounts[r] = (resultCounts[r] || 0) + 1;
  });
  const resultEntries = Object.entries(resultCounts).sort((a,b) => b[1]-a[1]);
  const maxResult = Math.max(...resultEntries.map(e => e[1]), 1);

  // شرکت‌ها
  const companyCounts = {};
  visits.forEach(v => {
    const cId = REF.patients[v.patient_id]?.company_id;
    const cName = REF.companies[cId]?.name || 'نامشخص';
    companyCounts[cName] = (companyCounts[cName] || 0) + 1;
  });
  const companyEntries = Object.entries(companyCounts).sort((a,b) => b[1]-a[1]);
  const maxComp = Math.max(...companyEntries.map(e => e[1]), 1);

  el.innerHTML = `
    <div class="vr-summary">
      <div class="vr-summary-title">بازه: ${escapeHtml(dateFrom)} تا ${escapeHtml(dateTo)}</div>
      <div class="vr-stats">
        <div class="vr-stat"><div class="vr-stat-val">${total.toLocaleString('fa-IR')}</div><div class="vr-stat-lbl">کل</div></div>
        <div class="vr-stat danger"><div class="vr-stat-val">${incidents.toLocaleString('fa-IR')}</div><div class="vr-stat-lbl">حادثه</div></div>
        <div class="vr-stat info"><div class="vr-stat-val">${referrals.toLocaleString('fa-IR')}</div><div class="vr-stat-lbl">ارجاعی</div></div>
        <div class="vr-stat success"><div class="vr-stat-val">${completed.toLocaleString('fa-IR')}</div><div class="vr-stat-lbl">تکمیل</div></div>
      </div>
    </div>

    <div class="vr-chart-section">
      <div class="vr-chart-title"><i class="bi bi-building"></i> توزیع شرکت‌ها</div>
      ${companyEntries.length ? companyEntries.map(([n, c]) => `
        <div class="vr-bar-row">
          <div class="vr-bar-label">${escapeHtml(n)}</div>
          <div class="vr-bar-track"><div class="vr-bar-fill info" style="width:${(c/maxComp*100).toFixed(1)}%"></div></div>
          <div class="vr-bar-value">${c.toLocaleString('fa-IR')}</div>
        </div>
      `).join('') : '<div class="vr-empty-small">داده‌ای نیست</div>'}
    </div>

    <div class="vr-chart-section">
      <div class="vr-chart-title"><i class="bi bi-bar-chart-fill"></i> علت مراجعه</div>
      ${reasonEntries.length ? reasonEntries.map(([n, c]) => `
        <div class="vr-bar-row">
          <div class="vr-bar-label">${escapeHtml(n)}</div>
          <div class="vr-bar-track"><div class="vr-bar-fill" style="width:${(c/maxReason*100).toFixed(1)}%"></div></div>
          <div class="vr-bar-value">${c.toLocaleString('fa-IR')}</div>
        </div>
      `).join('') : '<div class="vr-empty-small">داده‌ای نیست</div>'}
    </div>

    <div class="vr-chart-section">
      <div class="vr-chart-title"><i class="bi bi-clipboard2-check-fill"></i> نتیجه درمان</div>
      ${resultEntries.length ? resultEntries.map(([n, c]) => `
        <div class="vr-bar-row">
          <div class="vr-bar-label">${escapeHtml(n)}</div>
          <div class="vr-bar-track"><div class="vr-bar-fill success" style="width:${(c/maxResult*100).toFixed(1)}%"></div></div>
          <div class="vr-bar-value">${c.toLocaleString('fa-IR')}</div>
        </div>
      `).join('') : '<div class="vr-empty-small">داده‌ای نیست</div>'}
    </div>

    <div class="vr-actions">
      <button class="btn btn-outline-primary w-100" id="vrPrintBtn"><i class="bi bi-printer"></i> چاپ گزارش</button>
    </div>

    <div class="vr-list-title">لیست ویزیت‌ها (${total.toLocaleString('fa-IR')})</div>
    <div class="vr-list">
      ${visits.map((v, i) => renderVisitRow(v, i)).join('')}
    </div>
  `;

  el.querySelectorAll('[data-visit-idx]').forEach(row => {
    row.onclick = () => openVisitDetail(visits[parseInt(row.dataset.visitIdx, 10)]);
  });

  $('vrPrintBtn').onclick = () => printReport();
}

function printReport() {
  const content = $('vrResult').innerHTML;
  const w = window.open('', '_blank');
  if (!w) { alert('پاپ‌آپ را فعال کنید'); return; }
  w.document.write(`
    <!DOCTYPE html><html dir="rtl" lang="fa"><head>
    <meta charset="UTF-8"><title>گزارش ویزیت</title>
    <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet">
    <style>
      body{font-family:Vazirmatn,Tahoma,sans-serif;padding:20px;direction:rtl;color:#000}
      .vr-actions,.vr-row-arrow,button{display:none!important}
      .vr-chart-section,.vr-summary,.vr-row{border:1px solid #ccc;border-radius:8px;padding:10px;margin-bottom:8px;page-break-inside:avoid}
      .vr-bar-track{background:#eee;height:14px;border-radius:4px;overflow:hidden}
      .vr-bar-fill{height:100%;background:#3b82f6}
      .vr-bar-fill.success{background:#10b981}
      .vr-bar-fill.info{background:#0891b2}
      .vr-bar-row{display:grid;grid-template-columns:120px 1fr 40px;gap:8px;align-items:center;margin-bottom:4px;font-size:11px}
      .vr-summary{background:#0d6efd;color:#fff}
      .vr-stats{display:flex;gap:8px}
      .vr-stat{flex:1;text-align:center;background:rgba(255,255,255,.15);padding:8px;border-radius:8px}
      .vr-stat-val{font-size:20px;font-weight:800}
      .vr-stat-lbl{font-size:10px}
      .vr-row{display:flex;gap:8px;align-items:center}
      .vr-row-num{background:#f1f5f9;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px}
      .vr-tag{font-size:10px;background:#f1f5f9;padding:2px 6px;border-radius:4px;margin-left:4px}
      .vr-tag.success{background:#d1fae5;color:#065f46}
      .vr-tag.danger{background:#fee2e2;color:#991b1b}
    </style></head><body>${content}</body></html>
  `);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

function renderVisitRow(v, idx) {
  const p = REF.patients[v.patient_id] || {};
  const reason = REF.reasons[v.reason_for_visit_id || v.reason_id]?.name || '—';
  const result = REF.results[v.treatment_result_id]?.name || '—';
  const company = REF.companies[p.company_id]?.name || '';
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
          ${p.personnel_number?`<span><i class="bi bi-hash"></i> ${escapeHtml(p.personnel_number)}</span>`:''}
          ${company?`<span><i class="bi bi-building"></i> ${escapeHtml(company)}</span>`:''}
        </div>
        <div class="vr-row-tags">
          ${reason!=='—'?`<span class="vr-tag">${escapeHtml(reason)}</span>`:''}
          ${result!=='—'?`<span class="vr-tag success">${escapeHtml(result)}</span>`:''}
          ${isIncident?'<span class="vr-tag danger">حادثه</span>':''}
        </div>
      </div>
      <i class="bi bi-chevron-left vr-row-arrow"></i>
    </button>
  `;
}

function openVisitDetail(v) {
  const p = REF.patients[v.patient_id] || {};
  const reason = REF.reasons[v.reason_for_visit_id || v.reason_id]?.name || '—';
  const result = REF.results[v.treatment_result_id]?.name || '—';
  const company = REF.companies[p.company_id]?.name || '—';
  const name = `${p.first_name||''} ${p.last_name||''}`.trim() || 'ناشناس';
  const dateStr = v.visit_date ? gregorianToJalali(v.visit_date.split('T')[0]) : '—';
  const timeStr = v.visit_date ? new Date(v.visit_date).toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'}) : '—';

  const rows = [
    ['نام', name], ['کد پرسنلی', p.personnel_number||'—'], ['شرکت', company],
    ['تاریخ ویزیت', dateStr], ['ساعت', timeStr], ['علت', reason], ['نتیجه', result],
    ['وضعیت', v.status==='completed'?'تکمیل':v.status||'—'],
    ['نوع حادثه', v.incident_type && v.incident_type!=='none'?v.incident_type:'—'],
    ['BP', v.blood_pressure||'—'], ['PR', v.heart_rate||'—'],
    ['Tem', v.temperature||'—'], ['SpO₂', v.spo2||'—'],
  ];

  const sheet = document.createElement('div');
  sheet.className = 'vr-sheet';
  sheet.innerHTML = `
    <div class="vr-sheet-handle"></div>
    <div class="vr-sheet-title">جزئیات ویزیت</div>
    <table class="vr-detail-table">
      ${rows.map(([k,val]) => `<tr><td class="vr-detail-key">${escapeHtml(k)}</td><td class="vr-detail-val">${escapeHtml(String(val))}</td></tr>`).join('')}
    </table>
    <button class="btn btn-light w-100 mt-3" id="vrCloseSheet">بستن</button>
  `;
  const backdrop = document.createElement('div');
  backdrop.className = 'vr-backdrop';
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
  const close = () => { backdrop.classList.add('closing'); setTimeout(() => backdrop.remove(), 200); };
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  sheet.querySelector('#vrCloseSheet').onclick = close;
}
