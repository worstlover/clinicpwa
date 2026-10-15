function renderReport(visits, dateFrom, dateTo) {
  const el = $('vrResult');

  // ⭐ آمار ساده: کل، عادی، حادثه‌ای
  const total = visits.length;
  const incidents = visits.filter(v => v.incident_type && v.incident_type !== 'none').length;
  const normal = total - incidents;

  // علت مراجعه
  const reasonCounts = {};
  visits.forEach(v => {
    const r = REF.reasons[v.reason_for_visit_id || v.reason_id]?.name || 'نامشخص';
    reasonCounts[r] = (reasonCounts[r] || 0) + 1;
  });
  const reasonEntries = Object.entries(reasonCounts).sort((a,b) => b[1]-a[1]);
  const maxReason = Math.max(...reasonEntries.map(e => e[1]), 1);

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
    <!-- ⭐ کارت‌های ساده -->
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
      <div class="vr-chart-title"><i class="bi bi-building"></i> توزیع شرکت‌ها</div>
      ${companyEntries.length ? companyEntries.map(([n, c]) => `
        <div class="vr-bar-row">
          <div class="vr-bar-label">${escapeHtml(n)}</div>
          <div class="vr-bar-track"><div class="vr-bar-fill info" style="width:${(c/maxComp*100).toFixed(1)}%"></div></div>
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
  $('vrPrintBtn').onclick = () => printReport(dateFrom, dateTo);
}
