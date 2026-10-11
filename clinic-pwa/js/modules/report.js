import { sb } from '../sb.js';
import { $, faNum, escapeHtml, gregorianToJalali } from '../utils.js';
import { showScreen } from '../ui.js';

export async function openReport() {
  showScreen('Report');
  const c = $('repContent');
  c.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

  const today = new Date().toISOString().slice(0, 10);
  const in90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  const [
    { data: expired },
    { data: nearExp },
    { data: allStock },
    { data: disposals }
  ] = await Promise.all([
    sb.from('drugs_drugbatch')
      .select('drug_id, batch_number, expiry_date, quantity, drug:drugs_drug(name)')
      .lt('expiry_date', today).gt('quantity', 0).order('expiry_date').limit(300),
    sb.from('drugs_drugbatch')
      .select('drug_id, batch_number, expiry_date, quantity, drug:drugs_drug(name)')
      .gte('expiry_date', today).lte('expiry_date', in90).gt('quantity', 0).order('expiry_date').limit(300),
    sb.from('v_drug_stock').select('*'),
    sb.from('disposal_orders')
      .select('id, code, created_by_email, created_at, items:disposal_items(drug_name, quantity, batch_number)')
      .order('created_at', { ascending: false }).limit(30)
  ]);

  const lowStock = (allStock || []).filter(s => s.total_quantity > 0 && s.total_quantity < (s.reorder_point || 10));
  const zero = (allStock || []).filter(s => s.total_quantity === 0);

  c.innerHTML = `
    <h5 class="mb-3"><i class="bi bi-graph-up text-info"></i> گزارش‌ها</h5>

    <div class="row g-2 mb-4">
      <div class="col-6"><div class="card text-center" style="padding:18px;"><div class="qty-display" style="color:#dc3545;">${faNum(expired?.length || 0)}</div><div class="muted small">بچ منقضی</div></div></div>
      <div class="col-6"><div class="card text-center" style="padding:18px;"><div class="qty-display" style="color:#d97706;">${faNum(nearExp?.length || 0)}</div><div class="muted small">نزدیک انقضا</div></div></div>
      <div class="col-6"><div class="card text-center" style="padding:18px;"><div class="qty-display" style="color:#0891b2;">${faNum(lowStock.length)}</div><div class="muted small">کمتر از سفارش</div></div></div>
      <div class="col-6"><div class="card text-center" style="padding:18px;"><div class="qty-display" style="color:#64748b;">${faNum(zero.length)}</div><div class="muted small">موجودی صفر</div></div></div>
    </div>

    ${section('🗑 تاریخچه خروج منقضی', (disposals || []).map(d => {
      const itemCount = d.items?.length || 0;
      const totalQty = (d.items || []).reduce((s, i) => s + i.quantity, 0);
      const dt = new Date(d.created_at);
      return `
        <div class="item-card danger">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1">
              <div class="name">${escapeHtml(d.code)}</div>
              <div class="meta">
                <i class="bi bi-person"></i> ${escapeHtml(d.created_by_email || '—')}<br>
                <i class="bi bi-clock"></i> ${dt.toLocaleString('fa-IR')}
              </div>
              ${itemCount ? `<div class="meta"><strong>${faNum(itemCount)} قلم</strong> - مجموع <strong>${faNum(totalQty)} عدد</strong></div>` : ''}
            </div>
          </div>
        </div>`;
    }).join(''))}

    ${section('🚫 داروهای منقضی (بچ‌های موجود)', (expired || []).map(b => `
      <div class="item-card danger">
        <div class="d-flex justify-content-between">
          <div>
            <strong>${escapeHtml(b.drug?.name || '#' + b.drug_id)}</strong>
            <div class="meta">بچ: ${escapeHtml(b.batch_number || '—')} | ${gregorianToJalali(b.expiry_date)}</div>
          </div>
          <span class="badge-soft danger">${faNum(b.quantity)}</span>
        </div>
      </div>`).join(''))}

    ${section('⏰ نزدیک به انقضا (۹۰ روز)', (nearExp || []).map(b => `
      <div class="item-card warn">
        <div class="d-flex justify-content-between">
          <div>
            <strong>${escapeHtml(b.drug?.name || '#' + b.drug_id)}</strong>
            <div class="meta">بچ: ${escapeHtml(b.batch_number || '—')} | ${gregorianToJalali(b.expiry_date)}</div>
          </div>
          <span class="badge-soft warning">${faNum(b.quantity)}</span>
        </div>
      </div>`).join(''))}

    ${section('⚠️ زیر نقطه سفارش', lowStock.slice(0, 80).map(s => `
      <div class="item-card">
        <div class="d-flex justify-content-between">
          <div><strong>${escapeHtml(s.drug_name)}</strong><div class="meta">نقطه سفارش: ${faNum(s.reorder_point || 0)}</div></div>
          <span class="badge-soft primary">${faNum(s.total_quantity)}</span>
        </div>
      </div>`).join(''))}

    ${section('🚫 موجودی صفر', zero.slice(0, 80).map(s => `
      <div class="item-card">
        <div><strong>${escapeHtml(s.drug_name)}</strong> <span class="muted small">${escapeHtml(s.form || '')}</span></div>
      </div>`).join(''))}
  `;
}

function section(title, html) {
  if (!html?.trim()) html = '<div class="card text-center py-4 muted">موردی نیست ✅</div>';
  return `<div class="section-title">${title}</div>${html}`;
}
