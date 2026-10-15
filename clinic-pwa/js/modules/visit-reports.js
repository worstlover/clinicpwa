// js/modules/visit-reports.js
import { sb } from '../sb.js';
import { $, escapeHtml, gregorianToJalali, jalaliToGregorian, todayJalali } from '../utils.js';

// ═══════════════════════════════════════════════════════
// ابزارها
// ═══════════════════════════════════════════════════════
function showScreenDirect(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen' + name);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
}

let REF = { patients: {}, reasons: {}, results: {}, companies: {} };

// ═══════════════════════════════════════════════════════
// ورودی
// ═══════════════════════════════════════════════════════
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
          <select id="vrCompany" class="form-select"><option value="">همه شرکت‌ها</option></select>
        </div>
        <div class="vr-filter-field">
          <label>نوع ویزیت</label>
          <select id="vrKind" class="form-select">
            <option value="all">همه</option>
            <option value="incident">فقط حادثه‌ای</option>
            <option value="non">فقط عادی</option>
          </select>
        </div>
        <button class="btn btn-primary vr-run-btn" id="vrRun">
          <i class="bi bi-search"></i> تهیه گزارش
        </button>
      </div>

      <div id="vrResult"></div>
    </div>
  `;

  loadCompanies().then(() => {
    $('vrRun').onclick = runReport;
    $('vrDateFrom').addEventListener('keydown', e => { if (e.key === 'Enter') runReport(); });
    $('vrDateTo').addEventListener('keydown', e => { if (e.key === 'Enter') runReport(); });
    runReport();
  });
}

// ═══════════════════════════════════════════════════════
// واکشی لیست شرکت‌ها
// ═══════════════════════════════════════════════════════
async function loadCompanies() {
  try {
    const { data } = await sb.from('core_company').select('id, name').order('name');
    const sel = $('vrCompany');
    (data || []).forEach(c => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.name;
      sel.appendChild(o);
    });
  } catch (e) { console.warn('[VR] load companies:', e); }
}

// ═══════════════════════════════════════════════════════
// اجرای گزارش
// ═══════════════════════════════════════════════════════
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
    if (companyId) {
      filtered = filtered.filter(v => String(REF.patients[v.patient_id]?.company_id) === String(companyId));
    }

    // فیلتر نوع
    if (kind === 'incident') {
      filtered = filtered.filter(v => v.incident_type && v.incident_type !== 'none');
    } else if (kind === 'non') {
      filtered = filtered.filter(v => !v.incident_type || v.incident_type === 'none');
    }

    if (!filtered.length) {
      resultEl.innerHTML = `<div class="vr-empty"><i class="bi bi-inbox"></i><div>ویزیتی با این فیلترها یافت نشد</div></div>`;
      return;
    }

    renderReport(filtered, dateFrom, dateTo);
  } catch (e) {
    console.error('[VR] runReport:', e);
    resultEl.innerHTML = `<div class="alert alert-danger">خطا در دریافت داده‌ها: ${escapeHtml(e.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════
// رندر گزارش
// ═══════════════════════════════════════════════════════
function renderReport(visits, dateFrom, dateTo) {
  const el = $('vrResult');

  // ⭐ آمار ساده: کل / عادی / حادثه‌ای
  const total = visits.length;
  const incidents = visits.filter(v => v.incident_type && v.incident_type !== 'none').length;
  const normal = total - incidents;

  // ⭐ علت مراجعه
  const reasonCounts = {};
  visits.forEach(v => {
    const r = REF.reasons[v.reason_for_visit_id || v.reason_id]?.name || 'نامشخص';
    reasonCounts[r] = (reasonCounts[r] || 0) + 1;
  });
  const reasonEntries = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
  const maxReason = Math.max(...reasonEntries.map(e => e[1]), 1);

  // ⭐ توزیع شرکت‌ها
  const companyCounts = {};
  visits.forEach(v => {
    const cId = REF.patients[v.patient_id]?.company_id;
    const cName = REF.companies[cId]?.name || 'نامشخص';
    companyCounts[cName] = (companyCounts[cName] || 0) + 1;
  });
  const companyEntries = Object.entries(companyCounts).sort((a, b) => b[1] - a[1]);
  const maxComp = Math.max(...companyEntries.map(e => e[1]), 1);

  el.innerHTML = `
    <!-- کارت‌های ساده -->
    <div class="vr-summary">
      <div class="vr-summary-title">گزارش از ${escapeHtml(dateFrom)} تا ${escapeHtml(dateTo)}</div>
      <div class="vr-stats-3">
        <div class="vr-stat-box total">
          <div class="vr-stat-val">${total.toLocaleString('fa-IR')}</div>
          <div class="vr-stat-lbl">کل ویزیت‌ها</div>
        </div>
        <div class="vr-stat-box normal">
          <div class="vr-stat-val">${normal.toLocaleString('fa-IR')}</div>
          <div class="vr-stat-lbl">ویزیت عادی</div>
        </div>
        <div class="vr-stat-box incident">
          <div class="vr-stat-val">${incidents.toLocaleString('fa-IR')}</div>
          <div class="vr-stat-lbl">ویزیت حادثه‌ای</div>
        </div>
      </div>
    </div>

    <!-- نمودار علت مراجعه -->
    <div class="vr-chart-section">
      <div class="vr-chart-title"><i class="bi bi-bar-chart-fill"></i> علت مراجعه</div>
      ${reasonEntries.length ? reasonEntries.map(([n, c]) => `
        <div class="vr-bar-row">
          <div class="vr-bar-label">${escapeHtml(n)}</div>
          <div class="vr-bar-track">
            <div class="vr-bar-fill" style="width:${(c / maxReason * 100).toFixed(1)}%"></div>
          </div>
          <div class="vr-bar-value">${c.toLocaleString('fa-IR')}</div>
        </div>
      `).join('') : '<div class="vr-empty-small">داده‌ای نیست</div>'}
    </div>

    <!-- نمودار توزیع شرکت‌ها -->
    <div class="vr-chart-section">
      <div class="vr-chart-title"><i class="bi bi-building"></i> توزیع شرکت‌ها</div>
      ${companyEntries.length ? companyEntries.map(([n, c]) => `
        <div class="vr-bar-row">
          <div class="vr-bar-label">${escapeHtml(n)}</div>
          <div class="vr-bar-track">
            <div class="vr-bar-fill info" style="width:${(c / maxComp * 100).toFixed(1)}%"></div>
          </div>
          <div class="vr-bar-value">${c.toLocaleString('fa-IR')}</div>
        </div>
      `).join('') : '<div class="vr-empty-small">داده‌ای نیست</div>'}
    </div>

    <!-- دکمه چاپ -->
    <div class="vr-actions">
      <button class="btn btn-outline-primary w-100" id="vrPrintBtn">
        <i class="bi bi-printer"></i> چاپ گزارش رسمی
      </button>
    </div>

    <!-- لیست ویزیت‌ها -->
    <div class="vr-list-title">لیست ویزیت‌ها (${total.toLocaleString('fa-IR')} مورد)</div>
    <div class="vr-list">
      ${visits.map((v, i) => renderVisitRow(v, i)).join('')}
    </div>
  `;

  // کلیک روی ردیف
  el.querySelectorAll('[data-visit-idx]').forEach(row => {
    row.onclick = () => openVisitDetail(visits[parseInt(row.dataset.visitIdx, 10)]);
  });

  // چاپ
  $('vrPrintBtn').onclick = () => printReport(dateFrom, dateTo);
}

// ═══════════════════════════════════════════════════════
// ردیف ویزیت
// ═══════════════════════════════════════════════════════
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
      <div class="vr-row-num">${(idx + 1).toLocaleString('fa-IR')}</div>
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
          ${reason !== '—' ? `<span class="vr-tag">${escapeHtml(reason)}</span>` : ''}
          ${result !== '—' ? `<span class="vr-tag success">${escapeHtml(result)}</span>` : ''}
          ${isIncident ? '<span class="vr-tag danger">حادثه</span>' : ''}
        </div>
      </div>
      <i class="bi bi-chevron-left vr-row-arrow"></i>
    </button>
  `;
}

// ═══════════════════════════════════════════════════════
// جزئیات ویزیت
// ═══════════════════════════════════════════════════════
function openVisitDetail(v) {
  const p = REF.patients[v.patient_id] || {};
  const reason = REF.reasons[v.reason_for_visit_id || v.reason_id]?.name || '—';
  const result = REF.results[v.treatment_result_id]?.name || '—';
  const company = REF.companies[p.company_id]?.name || '—';
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
        <tr>
          <td class="vr-detail-key">${escapeHtml(k)}</td>
          <td class="vr-detail-val">${escapeHtml(String(val))}</td>
        </tr>
      `).join('')}
    </table>
    <button class="btn btn-light w-100 mt-3" id="vrCloseSheet">بستن</button>
  `;

  const backdrop = document.createElement('div');
  backdrop.className = 'vr-backdrop';
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);

  const close = () => {
    backdrop.classList.add('closing');
    setTimeout(() => backdrop.remove(), 200);
  };
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  sheet.querySelector('#vrCloseSheet').onclick = close;
}

// ═══════════════════════════════════════════════════════
// چاپ رسمی گزارش
// ═══════════════════════════════════════════════════════
function printReport(dateFrom, dateTo) {
  const content = $('vrResult').innerHTML;
  const now = new Date();
  const printDate = now.toLocaleDateString('fa-IR') + ' ' + now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

  const w = window.open('', '_blank');
  if (!w) { alert('پاپ‌آپ را فعال کنید'); return; }

  w.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="fa">
    <head>
      <meta charset="UTF-8">
      <title>گزارش ویزیت‌ها — ${dateFrom} تا ${dateTo}</title>
      <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet">
      <style>
        @page { size: A4; margin: 12mm; }
        * { box-sizing: border-box; }
        body {
          font-family: Vazirmatn, Tahoma, sans-serif;
          direction: rtl; color: #000; font-size: 11px;
          margin: 0; padding: 0;
        }
        .print-header {
          text-align: center;
          border-bottom: 2px solid #000;
          padding-bottom: 8px;
          margin-bottom: 12px;
        }
        .print-header h1 {
          font-size: 16px; margin: 0 0 4px; font-weight: 800;
        }
        .print-header .print-sub {
          font-size: 11px; color: #333; margin-bottom: 6px;
        }
        .print-header .print-meta {
          display: flex; justify-content: space-between;
          font-size: 10px; margin-top: 6px;
          padding-top: 6px; border-top: 1px dashed #999;
        }

        /* پنهان کردن دکمه‌ها */
        .vr-actions, .vr-row-arrow, button { display: none !important; }

        /* کارت‌های بالا */
        .vr-summary {
          border: 1.5px solid #000; border-radius: 6px;
          padding: 8px; margin-bottom: 10px;
          background: #f8f9fa;
        }
        .vr-summary-title {
          font-size: 12px; font-weight: 800; text-align: center;
          margin-bottom: 8px;
        }
        .vr-stats-3 {
          display: flex; gap: 6px;
        }
        .vr-stat-box {
          flex: 1; text-align: center; padding: 6px;
          border: 1px solid #333; border-radius: 4px;
          background: #fff;
        }
        .vr-stat-val { font-size: 16px; font-weight: 800; }
        .vr-stat-lbl { font-size: 10px; margin-top: 2px; }

        /* نمودارها */
        .vr-chart-section {
          border: 1px solid #333; border-radius: 4px;
          padding: 8px; margin-bottom: 8px;
          page-break-inside: avoid;
        }
        .vr-chart-title {
          font-size: 11px; font-weight: 800;
          margin-bottom: 6px;
          border-bottom: 1px solid #ccc;
          padding-bottom: 4px;
        }
        .vr-bar-row {
          display: grid;
          grid-template-columns: 130px 1fr 40px;
          gap: 6px; align-items: center;
          margin-bottom: 3px; font-size: 10px;
        }
        .vr-bar-label {
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .vr-bar-track {
          height: 10px; background: #eee;
          border-radius: 2px; overflow: hidden;
          border: 1px solid #ccc;
        }
        .vr-bar-fill { height: 100%; background: #4b5563; }
        .vr-bar-fill.info { background: #0891b2; }
        .vr-bar-value { font-weight: 800; text-align: left; }
        .vr-empty-small { text-align: center; color: #888; font-size: 10px; padding: 6px; }

        /* لیست ویزیت‌ها */
        .vr-list-title {
          font-size: 12px; font-weight: 800;
          margin: 12px 0 6px;
          border-bottom: 1.5px solid #000;
          padding-bottom: 4px;
        }
        .vr-row {
          display: flex; gap: 8px; align-items: center;
          border: 1px solid #ccc; border-radius: 4px;
          padding: 6px 8px; margin-bottom: 4px;
          page-break-inside: avoid;
        }
        .vr-row.incident { border-right: 3px solid #dc2626; }
        .vr-row-num {
          width: 22px; height: 22px; background: #f1f5f9;
          border-radius: 50%; display: flex;
          align-items: center; justify-content: center;
          font-size: 10px; font-weight: 700; flex-shrink: 0;
        }
        .vr-row-body { flex: 1; }
        .vr-row-head {
          display: flex; justify-content: space-between;
        }
        .vr-row-name { font-weight: 800; font-size: 11px; }
        .vr-row-date { font-size: 10px; color: #555; }
        .vr-row-meta {
          font-size: 9px; color: #555; margin-top: 2px;
        }
        .vr-row-tags { margin-top: 3px; }
        .vr-tag {
          font-size: 9px; background: #f1f5f9;
          padding: 1px 6px; border-radius: 3px;
          margin-left: 4px;
        }
        .vr-tag.danger { background: #fee2e2; color: #991b1b; }
        .vr-tag.success { background: #d1fae5; color: #065f46; }

        .print-footer {
          text-align: center; margin-top: 14px;
          padding-top: 8px; border-top: 1px dashed #999;
          font-size: 9px; color: #555;
        }
      </style>
    </head>
    <body>
      <div class="print-header">
        <h1>کلینیک گندله سازی بهاباد</h1>
        <div class="print-sub">گزارش ویزیت‌ها</div>
        <div class="print-meta">
          <span>بازه گزارش: ${dateFrom} تا ${dateTo}</span>
          <span>تاریخ چاپ: ${printDate}</span>
        </div>
      </div>
      ${content}
      <div class="print-footer">
        این گزارش به صورت خودکار توسط سامانه کلینیک تولید شده است.
      </div>
    </body>
    </html>
  `);
  w.document.close();
  setTimeout(() => w.print(), 500);
}
