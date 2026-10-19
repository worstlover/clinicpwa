// js/modules/receive.js
import { sb } from '../sb.js';
import {
  $, faNum, escapeHtml, parseGS1, cleanGTIN, gregorianToJalali,
  jalaliToGregorian, checkExpiry, toast, beep, makeBatchNumber
} from '../utils.js';
import { showScreen } from '../ui.js';

// ⭐ Import مقاوم برای هر دو حالت named/default export
import * as SCANNER_MOD from '../scanner.js';
import * as MODALS_MOD  from '../modals.js';

function resolveExport(mod, name) {
  if (!mod) return null;
  if (typeof mod[name] === 'function') return mod[name];
  if (mod.default) {
    if (typeof mod.default === 'function' && name === 'default') return mod.default;
    if (typeof mod.default[name] === 'function') return mod.default[name];
  }
  return null;
}

const openScanner = resolveExport(SCANNER_MOD, 'openScanner');
const openDrugSearch = resolveExport(MODALS_MOD, 'openDrugSearch');
const askQty = resolveExport(MODALS_MOD, 'askQty');
const promptExpirySelection = resolveExport(MODALS_MOD, 'promptExpirySelection');

// ⭐ لاگ وضعیت ایمپورت‌ها — برای دیباگ
console.log('[RECEIVE] imports status:', {
  openScanner: typeof openScanner,
  openDrugSearch: typeof openDrugSearch,
  askQty: typeof askQty,
  promptExpirySelection: typeof promptExpirySelection,
});

const state = {
  view: 'list',
  receiptId: null,
  supplierId: null,
  supplierName: '',
  linkedInvoice: null,
  items: [],
  listRows: [],
  listTotal: 0,
  listPage: 1,
  listQuery: '',
  listDateFrom: '',
  listDateTo: '',
  isFinalizing: false,
};

const PAGE_SIZE = 20;
const AUTOSAVE_KEY = 'recv_autosave';

setInterval(async () => {
  if (state.view !== 'form' || state.isFinalizing) return;
  if (!state.items.length) return;
  await saveDraft(true);
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
      items: state.items,
      supplierId: state.supplierId,
      supplierName: state.supplierName,
      linkedInvoice: state.linkedInvoice,
      savedAt: Date.now()
    }));
  } catch (_) {}
}, 5000);

async function restoreReceiveState() {
  const saved = localStorage.getItem(AUTOSAVE_KEY);
  if (!saved) return false;
  try {
    const data = JSON.parse(saved);
    if (!data.items?.length) return false;
    if (Date.now() - data.savedAt > 24 * 3600 * 1000) {
      localStorage.removeItem(AUTOSAVE_KEY);
      return false;
    }
    const dt = new Date(data.savedAt).toLocaleString('fa-IR');
    if (confirm(`یک ذخیره موقت از ${dt} پیدا شد (${data.items.length} قلم). بازیابی شود؟`)) {
      state.items = data.items;
      state.supplierId = data.supplierId;
      state.supplierName = data.supplierName;
      state.linkedInvoice = data.linkedInvoice;
      state.receiptId = null;
      state.view = 'form';
      return true;
    }
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch (_) {}
  return false;
}

export async function openReceive() {
  showScreen('Receive');
  const restored = await restoreReceiveState();
  if (restored) { await renderFormView(); return; }
  state.view = 'list';
  state.listPage = 1;
  await renderListView();
}

// ═══════════════════════════════════════════════════════════
// لیست رسیدها
// ═══════════════════════════════════════════════════════════
async function renderListView() {
  const c = $('recvContent');
  if (!c) return;

  c.innerHTML = `
    <div class="card mb-3">
      <div class="card-body py-3">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div>
            <div class="fw-bold"><i class="bi bi-file-earmark-text text-warning"></i> رسیدهای دریافت</div>
            <div class="muted small">لیست سندهای دریافت دارو</div>
          </div>
          <button class="btn btn-warning" id="recvNewBtn">
            <i class="bi bi-plus-circle"></i> دریافت جدید
          </button>
        </div>
        <div class="input-group mt-2">
          <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
          <input type="text" class="form-control" id="recvListSearch" placeholder="شماره رسید یا نام تأمین‌کننده...">
        </div>
        <div class="row g-2 mt-2">
          <div class="col-6"><input type="text" class="form-control text-center" id="recvListFrom" placeholder="از تاریخ" dir="ltr" autocomplete="off"></div>
          <div class="col-6"><input type="text" class="form-control text-center" id="recvListTo" placeholder="تا تاریخ" dir="ltr" autocomplete="off"></div>
        </div>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-primary flex-grow-1" id="recvFilter"><i class="bi bi-funnel"></i> اعمال فیلتر</button>
          <button class="btn btn-outline-secondary" id="recvClear" title="پاک کردن"><i class="bi bi-arrow-counterclockwise"></i></button>
        </div>
      </div>
    </div>
    <div id="recvListBox"></div>
    <div class="d-flex justify-content-between align-items-center mt-3" id="recvPagerWrap">
      <button class="btn btn-sm btn-outline-primary" id="recvPrev"><i class="bi bi-chevron-right"></i> قبلی</button>
      <span class="small text-muted" id="recvPager">—</span>
      <button class="btn btn-sm btn-outline-primary" id="recvNext">بعدی <i class="bi bi-chevron-left"></i></button>
    </div>`;

  $('recvListSearch').value = state.listQuery || '';
  $('recvListFrom').value = state.listDateFrom || '';
  $('recvListTo').value = state.listDateTo || '';

  $('recvNewBtn').onclick = () => openNewReceive(null);
  $('recvFilter').onclick = () => {
    state.listQuery = $('recvListSearch').value.trim();
    state.listDateFrom = $('recvListFrom').value.trim();
    state.listDateTo = $('recvListTo').value.trim();
    state.listPage = 1;
    loadReceiptList();
  };
  $('recvClear').onclick = () => {
    $('recvListSearch').value = ''; $('recvListFrom').value = ''; $('recvListTo').value = '';
    state.listQuery = state.listDateFrom = state.listDateTo = '';
    state.listPage = 1; loadReceiptList();
  };
  $('recvListSearch').onkeydown = (e) => { if (e.key === 'Enter') $('recvFilter').click(); };
  $('recvPrev').onclick = () => { if (state.listPage > 1) { state.listPage--; loadReceiptList(); } };
  $('recvNext').onclick = () => {
    const maxPage = Math.max(1, Math.ceil(state.listTotal / PAGE_SIZE));
    if (state.listPage < maxPage) { state.listPage++; loadReceiptList(); }
  };

  initJalaliPickers();
  await loadReceiptList();
}

function initJalaliPickers() {
  if (typeof jQuery === 'undefined' || !jQuery.fn.persianDatepicker) return;
  try {
    jQuery('#recvListFrom, #recvListTo').persianDatepicker({
      theme: 'melon', formatDate: 'YYYY/MM/DD',
      cellWidth: 32, cellHeight: 25, fontSize: 13
    });
  } catch (_) {}
}

async function loadReceiptList() {
  const box = $('recvListBox');
  if (!box) return;
  box.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-warning"></div></div>';

  try {
    let q = sb.from('drugs_receipt')
      .select(
        'id, receipt_number, supplier_name, status, receipt_type, date_received, created_at, ' +
        'invoice_id, created_by, created_by_name, finalized_by, finalized_at',
        { count: 'exact' }
      )
      .order('date_received', { ascending: false })
      .order('id', { ascending: false });

    if (state.listQuery) q = q.or(`receipt_number.ilike.%${state.listQuery}%,supplier_name.ilike.%${state.listQuery}%`);
    if (state.listDateFrom) { const g = jalaliToGregorian(state.listDateFrom); if (g) q = q.gte('date_received', g); }
    if (state.listDateTo)   { const g = jalaliToGregorian(state.listDateTo);   if (g) q = q.lte('date_received', g); }

    const from = (state.listPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error, count } = await q.range(from, to);
    if (error) throw error;

    state.listRows = data || [];
    state.listTotal = count || 0;
    renderReceiptRows();
  } catch (e) {
    console.error('[RECEIVE-LIST] error:', e);
    box.innerHTML = `
      <div class="alert alert-danger m-2">
        <i class="bi bi-exclamation-triangle"></i>
        خواندن لیست ناموفق بود: ${escapeHtml(e.message || 'خطای نامشخص')}
        <button class="btn btn-sm btn-outline-danger mt-2 d-block" id="recvRetry">تلاش مجدد</button>
      </div>`;
    const r = box.querySelector('#recvRetry');
    if (r) r.onclick = loadReceiptList;
  }
}

function statusBadge(status) {
  const map = {
    draft:     { cls: 'bg-warning text-dark', label: 'پیش‌نویس' },
    final:     { cls: 'bg-success',           label: 'نهایی' },
    finalized: { cls: 'bg-success',           label: 'نهایی' },
    pending:   { cls: 'bg-info text-white',   label: 'در انتظار' },
    cancelled: { cls: 'bg-danger',            label: 'لغو شده' },
    canceled:  { cls: 'bg-danger',            label: 'لغو شده' },
    void:      { cls: 'bg-secondary',         label: 'باطل' },
  };
  const m = map[String(status || '').toLowerCase()] || { cls: 'bg-secondary', label: status || '—' };
  return `<span class="badge ${m.cls}">${escapeHtml(m.label)}</span>`;
}

function renderReceiptRows() {
  const box = $('recvListBox');
  if (!box) return;

  if (!state.listRows.length) {
    box.innerHTML = `
      <div class="card text-center py-5 muted">
        <i class="bi bi-inbox" style="font-size:2.5rem;opacity:.4;"></i>
        <div class="mt-2">رسیدی یافت نشد</div>
        <div class="small">با دکمه «دریافت جدید» سند بسازید</div>
      </div>`;
    updatePager(); return;
  }

  box.innerHTML = state.listRows.map(r => `
    <div class="item-card" data-id="${r.id}" style="cursor:pointer;">
      <div class="d-flex justify-content-between align-items-center">
        <div class="flex-grow-1">
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="fw-bold text-primary">${escapeHtml(r.receipt_number || '-')}</span>
            ${statusBadge(r.status)}
          </div>
          <div class="meta"><i class="bi bi-truck"></i> ${escapeHtml(r.supplier_name || '-')}</div>
          <div class="meta">
            <i class="bi bi-calendar3"></i> ${escapeHtml(gregorianToJalali(r.date_received) || '-')}
            ${r.receipt_type ? `<span class="badge bg-light text-dark border ms-2">${
              r.receipt_type === 'with_invoice' ? 'با فاکتور' : 'بدون فاکتور'}</span>` : ''}
          </div>
          <div class="meta small">
            <i class="bi bi-person"></i> ${escapeHtml(r.created_by_name || (r.created_by ? r.created_by.slice(0, 8) : '—'))}
          </div>
        </div>
        <i class="bi bi-chevron-left text-muted"></i>
      </div>
    </div>`).join('');

  box.querySelectorAll('.item-card').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.id;
      const row = state.listRows.find(x => String(x.id) === id);
      if (row) openReceiptDetail(row);
    };
  });

  updatePager();
}

function updatePager() {
  const maxPage = Math.max(1, Math.ceil(state.listTotal / PAGE_SIZE));
  const el = $('recvPager');
  if (el) el.textContent = `صفحه ${faNum(state.listPage)} از ${faNum(maxPage)} • ${faNum(state.listTotal)} سند`;
}

async function openReceiptDetail(row) {
  const isDraft = row.status === 'draft';
  const backdrop = document.createElement('div');
  backdrop.className = 'archive-backdrop';
  backdrop.innerHTML = `
    <div class="archive-sheet">
      <div class="archive-sheet-handle"></div>
      <div class="archive-sheet-head">
        <div class="archive-sheet-icon" style="background:#fef3c7;color:#d97706;">
          <i class="bi bi-file-earmark-text-fill"></i>
        </div>
        <div>
          <div class="archive-sheet-title">${escapeHtml(row.receipt_number || '-')}</div>
          <div class="archive-sheet-sub">${escapeHtml(row.supplier_name || '-')}</div>
        </div>
      </div>
      <div class="archive-sheet-meta">
        <div class="archive-meta-item"><i class="bi bi-calendar3"></i>
          <span>${escapeHtml(gregorianToJalali(row.date_received) || '-')}</span>
        </div>
        <div class="archive-meta-item">${statusBadge(row.status)}</div>
        <div class="archive-meta-item"><i class="bi bi-person"></i>
          <span>ثبت‌کننده: ${escapeHtml(row.created_by_name || (row.created_by ? row.created_by.slice(0, 8) : '—'))}</span>
        </div>
        ${row.finalized_at ? `
          <div class="archive-meta-item"><i class="bi bi-check2-circle text-success"></i>
            <span>نهایی: ${escapeHtml(gregorianToJalali(row.finalized_at) || '')}${
              row.finalized_by ? ' • ' + escapeHtml(row.finalized_by.slice(0, 8)) : ''
            }</span>
          </div>` : ''}
      </div>
      <div class="archive-sheet-body" id="recvDetailItems">
        <div class="text-center py-4"><div class="spinner-border text-warning spinner-border-sm"></div></div>
      </div>
      <div class="archive-sheet-actions" style="display:flex; flex-wrap:wrap; gap:8px;">
        <button class="btn btn-light flex-grow-1" id="recvDetailClose">بستن</button>
        ${row.status === 'final' ? `
          <button class="btn btn-outline-danger flex-grow-1" id="recvDetailDiscrepancy">
            <i class="bi bi-exclamation-diamond"></i> گزارش مغایرت
          </button>
        ` : ''}
        ${isDraft ? `<button class="btn btn-primary flex-grow-1" id="recvEditDraft">ویرایش پیش‌نویس</button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  const close = () => { backdrop.classList.add('closing'); setTimeout(() => backdrop.remove(), 200); };
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  backdrop.querySelector('#recvDetailClose').onclick = close;
  if (isDraft) backdrop.querySelector('#recvEditDraft').onclick = () => { close(); openNewReceive(row); };
  if (row.status === 'final') {
    backdrop.querySelector('#recvDetailDiscrepancy').onclick = () => {
      close();
      openDiscrepancyReport(row);
    };
  }

  try {
    const { data: items, error } = await sb.from('drugs_receiptitem')
      .select('id, drug_id, received_quantity, batch_number, expiry_date, drug:drugs_drug(name, form)')
      .eq('receipt_id', row.id);
    if (error) throw error;

    const body = backdrop.querySelector('#recvDetailItems');
    if (!items?.length) { body.innerHTML = '<div class="text-center muted">قلمی ثبت نشده</div>'; return; }
    body.innerHTML = `
      <div class="archive-sheet-section-title">اقلام (${faNum(items.length)})</div>
      <table class="archive-detail-table"><tbody>
        ${items.map((it, i) => `
          <tr>
            <td class="detail-key">${faNum(i + 1)}. ${escapeHtml(it.drug?.name || '—')} ${it.drug?.form ? `(${escapeHtml(it.drug.form)})` : ''}</td>
            <td class="detail-val">
              <div>تعداد: <strong>${faNum(it.received_quantity)}</strong></div>
              <div class="small muted">بچ: <bdi dir="ltr">${escapeHtml(it.batch_number || '-')}</bdi></div>
              <div class="small muted">انقضا: ${escapeHtml(gregorianToJalali(it.expiry_date) || '-')}</div>
            </td>
          </tr>`).join('')}
      </tbody></table>`;
  } catch (e) {
    backdrop.querySelector('#recvDetailItems').innerHTML =
      `<div class="alert alert-danger small m-2">${escapeHtml(e.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════
// گزارش مغایرت
// ═══════════════════════════════════════════════════════════
async function loadDiscrepancyData(receiptId, invoiceId) {
  const { data: receiptItems, error: e1 } = await sb.from('drugs_receiptitem')
    .select('drug_id, received_quantity, drug:drugs_drug(id, name, form)')
    .eq('receipt_id', receiptId);
  if (e1) throw e1;

  let invoiceItems = [];
  if (invoiceId) {
    const { data, error: e2 } = await sb.from('drugs_purchaseinvoiceitem')
      .select('drug_id, quantity, drug:drugs_drug(id, name, form)')
      .eq('invoice_id', invoiceId);
    if (e2) throw e2;
    invoiceItems = data || [];
  }

  const drugSet = new Map();
  (receiptItems || []).forEach(it => {
    drugSet.set(it.drug_id, {
      drug: it.drug,
      received: Number(it.received_quantity) || 0,
      invoice_qty: 0,
    });
  });
  invoiceItems.forEach(it => {
    if (drugSet.has(it.drug_id)) {
      drugSet.get(it.drug_id).invoice_qty = Number(it.quantity) || 0;
      if (!drugSet.get(it.drug_id).drug) drugSet.get(it.drug_id).drug = it.drug;
    } else {
      drugSet.set(it.drug_id, {
        drug: it.drug,
        received: 0,
        invoice_qty: Number(it.quantity) || 0,
      });
    }
  });

  if (!drugSet.size) return { rows: [], invoiceLinked: !!invoiceId };

  const drugIds = Array.from(drugSet.keys());
  const { data: pendings, error: e3 } = await sb.from('v_drug_pending')
    .select('drug_id, pending_qty')
    .in('drug_id', drugIds);
  if (e3) throw e3;

  const pendingMap = new Map();
  (pendings || []).forEach(p => pendingMap.set(p.drug_id, Number(p.pending_qty) || 0));

  const rows = Array.from(drugSet.entries()).map(([drugId, info]) => {
    const currentPending = pendingMap.get(drugId) || 0;
    const received = info.received;
    const invoice_qty = info.invoice_qty;
    const original_order_qty = currentPending + received;
    const invoice_disc = invoice_qty - received;
    const order_disc = currentPending;

    return {
      drug_id: drugId,
      drug_name: info.drug?.name || '—',
      drug_form: info.drug?.form || '',
      invoice_qty,
      order_qty: original_order_qty,
      received,
      invoice_disc,
      order_disc,
      current_pending: currentPending,
      has_invoice: invoice_qty > 0,
      has_order: currentPending > 0,
    };
  });

  rows.sort((a, b) => {
    const aHas = (a.invoice_disc > 0 || a.order_disc > 0) ? 1 : 0;
    const bHas = (b.invoice_disc > 0 || b.order_disc > 0) ? 1 : 0;
    return bHas - aHas;
  });

  return { rows, invoiceLinked: !!invoiceId };
}

async function openDiscrepancyReport(receiptRow) {
  const backdrop = document.createElement('div');
  backdrop.className = 'archive-backdrop';
  backdrop.innerHTML = `
    <div class="archive-sheet" style="max-width:760px;">
      <div class="archive-sheet-handle"></div>
      <div class="archive-sheet-head">
        <div class="archive-sheet-icon" style="background:#fee2e2;color:#dc2626;">
          <i class="bi bi-exclamation-diamond-fill"></i>
        </div>
        <div>
          <div class="archive-sheet-title">گزارش مغایرت‌ها</div>
          <div class="archive-sheet-sub">${escapeHtml(receiptRow.receipt_number || '-')} • ${escapeHtml(receiptRow.supplier_name || '-')}</div>
        </div>
      </div>
      <div class="archive-sheet-body" id="discBody">
        <div class="text-center py-4"><div class="spinner-border text-danger spinner-border-sm"></div> در حال بارگذاری...</div>
      </div>
      <div class="archive-sheet-actions">
        <button class="btn btn-light w-100" id="discClose">بستن</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  const close = () => { backdrop.classList.add('closing'); setTimeout(() => backdrop.remove(), 200); };
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  backdrop.querySelector('#discClose').onclick = close;

  try {
    const { rows, invoiceLinked } = await loadDiscrepancyData(receiptRow.id, receiptRow.invoice_id);

    if (!rows.length) {
      backdrop.querySelector('#discBody').innerHTML = `
        <div class="alert alert-info m-3">
          <i class="bi bi-info-circle"></i> هیچ قلمی برای بررسی مغایرت ثبت نشده.
        </div>`;
      return;
    }

    const invoiceRows = rows.filter(r => r.has_invoice);
    const orderRows = rows.filter(r => r.has_order || r.received > 0);

    const fmt = n => faNum(Math.abs(n));
    const discBadge = (val) => {
      if (val > 0) return `<span class="badge bg-danger">${fmt(val)} کسری</span>`;
      if (val < 0) return `<span class="badge bg-warning text-dark">${fmt(val)} مازاد</span>`;
      return `<span class="badge bg-success">تطبیق</span>`;
    };

    const invoiceSection = invoiceLinked ? `
      <div class="mb-3">
        <div class="fw-bold mb-2" style="color:#dc2626;">
          <i class="bi bi-receipt"></i> مغایرت فاکتور (${faNum(invoiceRows.length)} قلم)
        </div>
        ${invoiceRows.length === 0 ? `
          <div class="alert alert-light text-center small">فاکتور قلمی ندارد</div>
        ` : `
          <table class="archive-detail-table" style="width:100%;">
            <thead>
              <tr style="background:#fef2f2;">
                <th style="text-align:right;padding:8px;font-size:12px;">دارو</th>
                <th style="text-align:center;padding:8px;font-size:12px;">فاکتور</th>
                <th style="text-align:center;padding:8px;font-size:12px;">دریافتی</th>
                <th style="text-align:center;padding:8px;font-size:12px;">مغایرت</th>
              </tr>
            </thead>
            <tbody>
              ${invoiceRows.map(r => `
                <tr>
                  <td style="padding:8px;">${escapeHtml(r.drug_name)}${r.drug_form ? ` <span class="muted small">(${escapeHtml(r.drug_form)})</span>` : ''}</td>
                  <td style="padding:8px;text-align:center;">${faNum(r.invoice_qty)}</td>
                  <td style="padding:8px;text-align:center;">${faNum(r.received)}</td>
                  <td style="padding:8px;text-align:center;">${discBadge(r.invoice_disc)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        `}
      </div>` : `
      <div class="mb-3">
        <div class="fw-bold mb-2" style="color:#6b7280;">
          <i class="bi bi-receipt"></i> مغایرت فاکتور
        </div>
        <div class="alert alert-light text-center small">این رسید به فاکتور متصل نیست</div>
      </div>`;

    const orderSection = `
      <div class="mb-2">
        <div class="fw-bold mb-2" style="color:#d97706;">
          <i class="bi bi-clipboard-check"></i> مغایرت سفارش (${faNum(orderRows.filter(r => r.has_order).length)} باز)
        </div>
        ${orderRows.length === 0 ? `
          <div class="alert alert-light text-center small">هیچ سفارش بازی وجود ندارد</div>
        ` : `
          <table class="archive-detail-table" style="width:100%;">
            <thead>
              <tr style="background:#fffbeb;">
                <th style="text-align:right;padding:8px;font-size:12px;">دارو</th>
                <th style="text-align:center;padding:8px;font-size:12px;">دریافتی</th>
                <th style="text-align:center;padding:8px;font-size:12px;">سفارش باز</th>
                <th style="text-align:center;padding:8px;font-size:12px;">مغایرت</th>
                <th style="text-align:center;padding:8px;font-size:12px;">اقدام</th>
              </tr>
            </thead>
            <tbody>
              ${orderRows.map(r => `
                <tr data-drug-id="${r.drug_id}">
                  <td style="padding:8px;">${escapeHtml(r.drug_name)}${r.drug_form ? ` <span class="muted small">(${escapeHtml(r.drug_form)})</span>` : ''}</td>
                  <td style="padding:8px;text-align:center;">${faNum(r.received)}</td>
                  <td style="padding:8px;text-align:center;">${faNum(r.current_pending)}</td>
                  <td style="padding:8px;text-align:center;">
                    ${r.current_pending > 0
                      ? `<span class="badge bg-danger">${faNum(r.current_pending)} کسری</span>`
                      : `<span class="badge bg-success">تأمین شده</span>`}
                  </td>
                  <td style="padding:8px;text-align:center;">
                    ${r.current_pending > 0 ? `
                      <button class="btn btn-sm btn-warning discCloseOrderBtn" data-drug-id="${r.drug_id}" data-drug-name="${escapeHtml(r.drug_name)}">
                        <i class="bi bi-check2-square"></i> تکمیل سفارش
                      </button>
                    ` : '—'}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        `}
      </div>`;

    backdrop.querySelector('#discBody').innerHTML = invoiceSection + orderSection;

    backdrop.querySelectorAll('.discCloseOrderBtn').forEach(btn => {
      btn.onclick = async () => {
        const drugId = parseInt(btn.dataset.drugId);
        const drugName = btn.dataset.drugName;
        await closeDrugOrders(drugId, drugName, btn);
      };
    });

  } catch (e) {
    backdrop.querySelector('#discBody').innerHTML =
      `<div class="alert alert-danger m-3">${escapeHtml(e.message || 'خطا در بارگذاری')}</div>`;
  }
}

async function closeDrugOrders(drugId, drugName, btn) {
  if (!confirm(`همه سفارش‌های باز «${drugName}» بسته شوند؟\n(کسری نادیده گرفته می‌شود)`)) return;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

  try {
    const { error } = await sb.rpc('allocate_to_requests', {
      p_drug_id: drugId,
      p_quantity: 0,
      p_force_close: true
    });
    if (error) throw error;
    toast(`✅ سفارش‌های «${drugName}» بسته شد`, 'success');
    btn.closest('tr').querySelector('td:nth-child(3)').textContent = '۰';
    btn.closest('tr').querySelector('td:nth-child(4)').innerHTML = '<span class="badge bg-success">تأمین شده</span>';
    btn.closest('td').innerHTML = '—';
  } catch (e) {
    toast('خطا در بستن سفارش: ' + (e.message || 'نامشخص'), 'danger');
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check2-square"></i> تکمیل سفارش';
  }
}

// ═══════════════════════════════════════════════════════════
// فرم دریافت
// ═══════════════════════════════════════════════════════════
async function openNewReceive(existingDraft = null) {
  state.view = 'form';
  state.isFinalizing = false;

  if (existingDraft) {
    state.receiptId = existingDraft.id;
    state.supplierId = existingDraft.supplier_id || null;
    state.supplierName = existingDraft.supplier_name || '';

    if (existingDraft.invoice_id) {
      try {
        const { data: inv } = await sb.from('drugs_purchaseinvoice')
          .select('id, invoice_number').eq('id', existingDraft.invoice_id).maybeSingle();
        if (inv) {
          const { data: invItems } = await sb.from('drugs_purchaseinvoiceitem')
            .select('drug_id, quantity, unit_price').eq('invoice_id', inv.id);
          state.linkedInvoice = { id: inv.id, invoice_number: inv.invoice_number, items: invItems || [] };
        }
      } catch (_) {}
    }

    const { data: items } = await sb.from('drugs_receiptitem')
      .select('*, drug:drugs_drug(name, form)').eq('receipt_id', existingDraft.id);
    state.items = (items || []).map(i => ({
      drug_id: i.drug_id,
      drug_name: i.drug?.name || 'نامشخص',
      drug_form: i.drug?.form || '',
      qty: i.received_quantity,
      batch: i.batch_number,
      expiry: i.expiry_date,
      barcode: null,
      closeOrder: false,
    }));
  } else {
    state.receiptId = null;
    state.items = [];
    state.supplierId = null;
    state.supplierName = '';
    state.linkedInvoice = null;
  }

  await renderFormView();
}

async function renderFormView() {
  const c = $('recvContent');
  if (!c) return;
  const { data: suppliers } = await sb.from('drugs_supplier').select('id, name').order('name');

  c.innerHTML = `
    <div class="card">
      <div class="card-head warning d-flex justify-content-between align-items-center">
        <span><i class="bi bi-truck"></i> ${state.receiptId ? 'ویرایش پیش‌نویس' : 'دریافت دارو (جدید)'}</span>
        <button class="btn btn-sm btn-outline-light" id="recvBackToList"><i class="bi bi-arrow-right"></i> لیست</button>
      </div>
      <div class="card-body">
        <label class="form-label">تامین‌کننده *</label>
        <select class="form-select mb-3" id="recvSupplier">
          <option value="">انتخاب کنید...</option>
          ${(suppliers || []).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
        </select>
        <div id="recvInvoiceBox" class="hidden mb-2">
          <div class="badge-soft primary">
            <i class="bi bi-link"></i> فاکتور: <span id="recvInvoiceNum"></span>
            <button style="background:none;border:none;color:#dc3545;margin-right:8px;font-weight:700;" id="recvUnlinkInvoice">✕</button>
          </div>
        </div>
        <button class="btn btn-outline-secondary w-100" id="recvLinkInvoice"><i class="bi bi-receipt"></i> اتصال به فاکتور</button>
      </div>
    </div>
    <div class="row g-2 mb-3">
      <div class="col-6"><button type="button" class="btn btn-warning w-100 py-3" id="recvScan"><i class="bi bi-upc-scan"></i> اسکن</button></div>
      <div class="col-6"><button type="button" class="btn btn-outline-warning w-100 py-3" id="recvSearch"><i class="bi bi-search"></i> جستجو</button></div>
    </div>
    <div class="section-title"><span>اقلام دریافتی</span><span class="badge-soft warning" id="recvCount">۰</span></div>
    <div id="recvList"></div>
    <div class="d-grid gap-2 mt-3">
      <button class="btn btn-outline-primary btn-lg w-100 py-3" id="recvSaveDraft"><i class="bi bi-save"></i> ذخیره پیش‌نویس</button>
      <button class="btn btn-success btn-lg w-100 py-3" id="recvFinalize"><i class="bi bi-check-circle-fill"></i> ثبت نهایی</button>
    </div>`;

  // ─── بقیه دکمه‌ها ───
  $('recvBackToList').onclick = () => { state.view = 'list'; renderListView(); };
  $('recvSupplier').onchange = e => {
    state.supplierId = parseInt(e.target.value) || null;
    state.supplierName = e.target.options[e.target.selectedIndex].text;
  };
  if (state.supplierId) {
    $('recvSupplier').value = state.supplierId;
  } else if (state.supplierName) {
    const opts = $('recvSupplier').options;
    for (let i = 0; i < opts.length; i++) {
      if (opts[i].text === state.supplierName) {
        $('recvSupplier').selectedIndex = i;
        state.supplierId = parseInt(opts[i].value) || null;
        break;
      }
    }
  }

  // ⭐⭐⭐ اسکنر — با تشخیص دقیق خطا ⭐⭐⭐
  const scanBtn = $('recvScan');
  if (scanBtn) {
    scanBtn.onclick = async (ev) => {
      ev.preventDefault();
      console.log('[RECEIVE] Scan button clicked');
      if (typeof openScanner !== 'function') {
        console.error('[RECEIVE] openScanner is not a function. Check that scanner.js exports it (named or default).');
        alert('❌ سیستم اسکنر لود نشده.\nلطفاً به برنامه‌نویس بگویید:\nscanner.js باید openScanner را export کند.');
        return;
      }
      try {
        await openScanner(handleBarcode);
        console.log('[RECEIVE] openScanner resolved');
      } catch (e) {
        console.error('[RECEIVE] openScanner threw:', e);
        alert('❌ خطا در باز کردن اسکنر:\n' + (e.message || e));
      }
    };
  }

  // ⭐⭐⭐ جستجو — با تشخیص دقیق خطا ⭐⭐⭐
  const searchBtn = $('recvSearch');
  if (searchBtn) {
    searchBtn.onclick = async (ev) => {
      ev.preventDefault();
      console.log('[RECEIVE] Search button clicked');
      if (typeof openDrugSearch !== 'function') {
        console.error('[RECEIVE] openDrugSearch is not a function. Check that modals.js exports it (named or default).');
        alert('❌ سیستم جستجو لود نشده.\nلطفاً به برنامه‌نویس بگویید:\nmodals.js باید openDrugSearch را export کند.');
        return;
      }
      try {
        await openDrugSearch('دارو را جستجو کنید', (d) => addDrug(d));
        console.log('[RECEIVE] openDrugSearch resolved');
      } catch (e) {
        console.error('[RECEIVE] openDrugSearch threw:', e);
        alert('❌ خطا در باز کردن جستجو:\n' + (e.message || e));
      }
    };
  }

  // فاکتور
  $('recvLinkInvoice').onclick = linkInvoice;
  $('recvUnlinkInvoice').onclick = () => {
    state.linkedInvoice = null;
    $('recvInvoiceBox').classList.add('hidden');
    $('recvLinkInvoice').classList.remove('hidden');
  };

  $('recvSaveDraft').onclick = () => saveDraft(false);
  $('recvFinalize').onclick = finalize;

  if (state.linkedInvoice) {
    $('recvInvoiceNum').textContent = state.linkedInvoice.invoice_number;
    $('recvInvoiceBox').classList.remove('hidden');
    $('recvLinkInvoice').classList.add('hidden');
  }

  console.log('[RECEIVE] All button handlers attached. Scan:', typeof openScanner, '| Search:', typeof openDrugSearch);

  renderList();
}

async function linkInvoice() {
  const q = prompt('شماره فاکتور را وارد کنید:');
  if (!q?.trim()) return;
  const { data } = await sb.from('drugs_purchaseinvoice')
    .select('id, invoice_number, supplier_id, supplier:drugs_supplier(name)')
    .ilike('invoice_number', `%${q.trim()}%`).limit(5);
  if (!data?.length) { toast('فاکتوری یافت نشد', 'warning'); return; }

  let chosen = data[0];
  if (data.length > 1) {
    const list = data.map((d, i) => `${i + 1}) ${d.invoice_number} - ${d.supplier?.name || ''}`).join('\n');
    const idx = parseInt(prompt('کدام؟\n' + list)) - 1;
    if (isNaN(idx) || !data[idx]) return;
    chosen = data[idx];
  }

  const { data: items } = await sb.from('drugs_purchaseinvoiceitem')
    .select('drug_id, quantity, unit_price').eq('invoice_id', chosen.id);

  state.linkedInvoice = {
    id: chosen.id,
    invoice_number: chosen.invoice_number,
    items: items || []
  };
  if (chosen.supplier_id) {
    state.supplierId = chosen.supplier_id;
    $('recvSupplier').value = chosen.supplier_id;
    state.supplierName = $('recvSupplier').options[$('recvSupplier').selectedIndex]?.text || '';
  }
  $('recvInvoiceNum').textContent = chosen.invoice_number;
  $('recvInvoiceBox').classList.remove('hidden');
  $('recvLinkInvoice').classList.add('hidden');
  toast(`فاکتور ${chosen.invoice_number} لینک شد`, 'success');
}

function renderList() {
  const c = $('recvContent');
  if (!c) return;
  const cnt = c.querySelector('#recvCount');
  if (cnt) cnt.textContent = faNum(state.items.length);
  const list = c.querySelector('#recvList');
  if (!list) return;
  if (!state.items.length) {
    list.innerHTML = '<div class="card text-center py-4 muted">هنوز قلمی اضافه نشده</div>';
    return;
  }
  list.innerHTML = state.items.map((it, i) => {
    const cls = it.warnings?.some(w => w.level === 'danger') ? 'danger' :
                it.warnings?.some(w => w.level === 'warning') ? 'warn' : '';
    return `
      <div class="item-card ${cls}">
        <div class="d-flex justify-content-between align-items-center">
          <div class="flex-grow-1">
            <div class="name">${escapeHtml(it.drug_name)}</div>
            <div class="meta">
              ${it.batch ? `بچ: <code dir="ltr">${escapeHtml(it.batch)}</code> | ` : ''}
              انقضا: ${escapeHtml(it.expiry || '—')} <span class="muted">(${gregorianToJalali(it.expiry) || '—'})</span>
            </div>
            ${it.warnings?.length ? `<div class="meta" style="color:#dc3545;">${it.warnings.map(w => `• ${escapeHtml(w.text)}`).join('<br>')}</div>` : ''}
            <div class="mt-1">
              <label class="d-flex align-items-center gap-2 small" style="cursor:pointer;color:#d97706;font-weight:600;">
                <input type="checkbox" data-close-order="${i}" ${it.closeOrder ? 'checked' : ''} style="width:16px;height:16px;accent-color:#d97706;">
                بستن سفارش این دارو (کسری نادیده گرفته شود)
              </label>
            </div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <button class="num-btn" style="width:38px;height:38px;" data-act="dec" data-i="${i}">−</button>
            <div class="qty-display" style="color:#d97706;">${faNum(it.qty)}</div>
            <button class="num-btn" style="width:38px;height:38px;" data-act="inc" data-i="${i}">+</button>
            <button class="num-btn" style="width:38px;height:38px;" data-act="del" data-i="${i}"><i class="bi bi-trash text-danger"></i></button>
          </div>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-act]').forEach(b => {
    const i = +b.dataset.i;
    b.onclick = () => {
      if (b.dataset.act === 'inc') state.items[i].qty++;
      else if (b.dataset.act === 'dec' && state.items[i].qty > 1) state.items[i].qty--;
      else if (b.dataset.act === 'del' && confirm('حذف شود؟')) state.items.splice(i, 1);
      renderList();
    };
  });

  list.querySelectorAll('[data-close-order]').forEach(cb => {
    cb.onchange = () => {
      const i = +cb.dataset.closeOrder;
      if (state.items[i]) state.items[i].closeOrder = cb.checked;
    };
  });
}

async function saveDraft(silent = false) {
  if (!state.items.length) {
    if (!silent) toast('قلمی برای ذخیره وجود ندارد', 'warning');
    return false;
  }
  try {
    let receiptId = state.receiptId;
    const code = receiptId ? null : `RCV-${Date.now().toString().slice(-6)}`;

    if (!receiptId) {
      let userId = null, userName = null;
      try {
        const { data: { user } } = await sb.auth.getUser();
        userId = user?.id || null;
        userName = user?.user_metadata?.full_name
                || user?.user_metadata?.name
                || user?.email
                || null;
      } catch (_) {}

      const { data, error } = await sb.from('drugs_receipt').insert({
        receipt_number: code,
        supplier_name: state.supplierName || 'نامشخص',
        status: 'draft',
        receipt_type: state.linkedInvoice ? 'with_invoice' : 'without_invoice',
        invoice_id: state.linkedInvoice?.id || null,
        date_received: new Date().toISOString().slice(0, 10),
        created_by: userId,
        created_by_name: userName
      }).select().single();
      if (error) throw error;
      receiptId = data.id;
      state.receiptId = receiptId;
    } else {
      await sb.from('drugs_receipt').update({
        supplier_name: state.supplierName || 'نامشخص',
        receipt_type: state.linkedInvoice ? 'with_invoice' : 'without_invoice',
        invoice_id: state.linkedInvoice?.id || null
      }).eq('id', receiptId);
    }

    await sb.from('drugs_receiptitem').delete().eq('receipt_id', receiptId);

    const itemsToInsert = state.items.map(it => ({
      receipt_id: receiptId,
      drug_id: it.drug_id,
      received_quantity: it.qty,
      batch_number: it.batch,
      expiry_date: it.expiry,
      force_close_shortage: !!it.closeOrder
    }));
    await sb.from('drugs_receiptitem').insert(itemsToInsert);

    if (!silent) toast('✅ پیش‌نویس با موفقیت ذخیره شد', 'success');
    return true;
  } catch (e) {
    if (!silent) toast('خطا در ذخیره پیش‌نویس: ' + e.message, 'danger');
    console.error(e);
    return false;
  }
}

async function handleBarcode(raw) {
  console.log('[RECEIVE] handleBarcode received:', raw);
  try {
    const parsed = parseGS1(raw);
    if (parsed.exps && parsed.exps.length > 0) {
      const isInvalid = !parsed.exp || !parsed.exp.includes('-');
      if (parsed.exps.length > 1 || isInvalid) {
        if (typeof promptExpirySelection !== 'function') {
          toast('سیستم انتخاب انقضا لود نشده', 'danger');
          return;
        }
        const selectedDate = await promptExpirySelection(parsed.exps);
        if (!selectedDate) return;
        if (selectedDate.includes('-')) parsed.exp = selectedDate;
        else { toast('تاریخ نامعتبر', 'warning'); parsed.exp = ''; }
      }
    }

    const gtin = cleanGTIN(parsed.gtin);
    const padded = gtin.padStart(14, '0');
    const { data: bc } = await sb.from('drugs_drugbarcode')
      .select('drug:drugs_drug(id, name, form)')
      .or(`gtin.eq.${gtin},gtin.eq.${padded}`).maybeSingle();

    if (!bc?.drug) {
      toast('بارکد ناشناس', 'warning');
      openDrugSearch(`بارکد ${escapeHtml(gtin)} ثبت نشده`, d => addDrug(d, gtin, parsed));
      return;
    }
    const added = await addDrug(bc.drug, gtin, parsed);
    if (added) reopenScannerAuto();
  } catch (e) {
    console.error('[RECEIVE] handleBarcode error:', e);
    toast('خطا در پردازش بارکد: ' + (e.message || ''), 'danger');
  }
}

function reopenScannerAuto() {
  setTimeout(() => {
    const wrap = $('scannerWrap');
    if (!wrap || !wrap.classList.contains('active')) {
      if (typeof openScanner === 'function') openScanner(handleBarcode);
    }
  }, 350);
}

async function addDrug(drug, barcode = '', parsed = {}) {
  console.log('[RECEIVE] addDrug called:', drug.name);
  try {
    if (barcode) {
      try {
        await sb.from('drugs_drugbarcode').upsert({ drug_id: drug.id, gtin: barcode }, { onConflict: 'gtin' });
      } catch (_) {}
    }

    const { data: stock } = await sb.from('v_drug_stock').select('total_quantity').eq('drug_id', drug.id).maybeSingle();
    const { data: pend }  = await sb.from('v_drug_pending').select('pending_qty').eq('drug_id', drug.id).maybeSingle();
    const available = stock?.total_quantity || 0;
    const ordered   = pend?.pending_qty || 0;

    let invoiceQty = null;
    if (state.linkedInvoice?.items) {
      const inv = state.linkedInvoice.items.find(i => Number(i.drug_id) === Number(drug.id));
      if (inv) invoiceQty = inv.quantity;
    }

    const extraInfo = `
      <div class="row g-2 text-center">
        <div class="col-4"><div class="badge-soft primary w-100" style="justify-content:center;">موجودی: <strong>${faNum(available)}</strong></div></div>
        <div class="col-4"><div class="badge-soft warning w-100" style="justify-content:center;">سفارش: <strong>${faNum(ordered)}</strong></div></div>
        <div class="col-4"><div class="badge-soft gray w-100" style="justify-content:center;">فاکتور: <strong>${invoiceQty !== null ? faNum(invoiceQty) : '—'}</strong></div></div>
      </div>`;

    if (typeof askQty !== 'function') {
      console.error('[RECEIVE] askQty is not a function');
      alert('❌ سیستم مودال تعداد لود نشده.\nmodals.js باید askQty را export کند.');
      return false;
    }

    const res = await askQty({
      title: 'تایید دریافت',
      headerClass: 'bg-warning',
      drugName: drug.name + (drug.form ? ` (${drug.form})` : ''),
      extraInfo,
      defaultQty: 1,
      defaultExpiry: parsed?.exp || '',
      defaultBatch: parsed?.batch || '',
      showExtras: true,
      requireExpiry: true
    });

    if (!res || res.qty < 1) return false;
    if (!res.expiry_gregorian) { toast('تاریخ انقضا الزامی است', 'danger'); beep(300); return false; }

    const warnings = [];
    if (ordered > 0 && res.qty < ordered) warnings.push({ level: 'warning', text: `کمتر از سفارش (${faNum(ordered - res.qty)} کسری)` });
    else if (ordered === 0) warnings.push({ level: 'info', text: 'خارج از لیست سفارش' });
    else if (res.qty > ordered) warnings.push({ level: 'info', text: `${faNum(res.qty - ordered)} مازاد` });
    if (invoiceQty !== null) {
      if (res.qty < invoiceQty) warnings.push({ level: 'warning', text: `کمتر از فاکتور (${faNum(invoiceQty - res.qty)})` });
      else if (res.qty > invoiceQty) warnings.push({ level: 'info', text: `${faNum(res.qty - invoiceQty)} مازاد فاکتور` });
    }
    const chk = checkExpiry(res.expiry_gregorian);
    if (chk && (chk.level === 'danger' || chk.level === 'expired')) warnings.push({ level: 'danger', text: chk.msg });
    else if (chk && chk.level === 'warning') warnings.push({ level: 'warning', text: chk.msg });

    let finalBatch = res.batch || '';
    if (!finalBatch && res.expiry_gregorian) {
      finalBatch = makeBatchNumber(drug.name, drug.form, res.expiry_gregorian) || '';
    }
    if (!finalBatch) finalBatch = `AUTO-${Date.now()}`;

    const ex = state.items.find(it => it.drug_id === drug.id && (it.batch || '') === finalBatch);
    if (ex && ex.expiry === res.expiry_gregorian) ex.qty += res.qty;
    else state.items.push({
      drug_id: drug.id,
      drug_name: drug.name,
      drug_form: drug.form || '',
      qty: res.qty,
      batch: finalBatch,
      expiry: res.expiry_gregorian,
      expiry_jalali: res.expiry_jalali || '',
      barcode,
      ordered_qty: ordered,
      invoice_qty: invoiceQty,
      warnings,
      closeOrder: false,
    });

    renderList();
    beep();
    return true;
  } catch (e) {
    console.error('[RECEIVE] addDrug error:', e);
    alert('❌ خطا در افزودن دارو:\n' + (e.message || e));
    return false;
  }
}

async function finalize() {
  if (!state.supplierId) { toast('تامین‌کننده را انتخاب کنید', 'warning'); return; }
  if (!state.items.length) { toast('حداقل یک قلم', 'warning'); return; }
  for (const it of state.items) {
    if (!it.expiry) { toast(`تاریخ انقضای «${it.drug_name}» الزامی است`, 'warning'); return; }
  }

  if (!confirm(`آیا از ثبت نهایی ${faNum(state.items.length)} قلم اطمینان دارید؟`)) return;
  if (!confirm('⚠️ هشدار نهایی: با این کار موجودی انبار افزایش می‌یابد و سند قفل می‌شود. ادامه می‌دهید؟')) return;

  state.isFinalizing = true;
  const btn = $('recvFinalize');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> ثبت نهایی...'; }

  try {
    const saved = await saveDraft(true);
    if (!saved) throw new Error('خطا در آماده‌سازی سند');
    const receiptId = state.receiptId;

    let finalizerId = null;
    try {
      const { data: { user } } = await sb.auth.getUser();
      finalizerId = user?.id || null;
    } catch (_) {}

    const { error: eStatus } = await sb.from('drugs_receipt').update({
      status: 'final',
      invoice_id: state.linkedInvoice?.id || null,
      receipt_type: state.linkedInvoice ? 'with_invoice' : 'without_invoice',
      finalized_by: finalizerId,
      finalized_at: new Date().toISOString()
    }).eq('id', receiptId);
    if (eStatus) throw eStatus;

    const errors = [];
    const successes = [];

    for (const it of state.items) {
      let batchForDb = it.batch || '';
      if (!batchForDb && it.expiry) batchForDb = makeBatchNumber(it.drug_name, it.drug_form, it.expiry) || '';
      if (!batchForDb) batchForDb = `AUTO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      try {
        const { data: existing, error: eFind } = await sb.from('drugs_drugbatch')
          .select('id, quantity')
          .eq('drug_id', it.drug_id)
          .eq('batch_number', batchForDb)
          .maybeSingle();
        if (eFind) throw new Error(`جستجو بچ: ${eFind.message}`);

        if (existing) {
          const newQty = (existing.quantity || 0) + it.qty;
          const { error: eUpd, data: updData } = await sb.from('drugs_drugbatch')
            .update({ quantity: newQty, expiry_date: it.expiry })
            .eq('id', existing.id).select();
          if (eUpd) throw new Error(`آپدیت بچ: ${eUpd.message}`);
          if (!updData?.length) throw new Error('آپدیت بچ: دسترسی ندارید');
          successes.push(`${it.drug_name}: بچ ${batchForDb} از ${existing.quantity} → ${newQty}`);
        } else {
          const { error: eIns, data: insData } = await sb.from('drugs_drugbatch')
            .insert({
              drug_id: it.drug_id,
              batch_number: batchForDb,
              expiry_date: it.expiry,
              quantity: it.qty,
              supplier_id: state.supplierId,
              purchase_price: 0,
              is_active: true,
              is_temporary: false
            }).select();
          if (eIns) throw new Error(`درج بچ: ${eIns.message}`);
          if (!insData?.length) throw new Error('درج بچ: دسترسی ندارید');
          successes.push(`${it.drug_name}: بچ جدید ${batchForDb}`);
        }

        try {
          const { error: e3 } = await sb.rpc('allocate_to_requests', {
            p_drug_id: it.drug_id,
            p_quantity: it.qty,
            p_force_close: !!it.closeOrder
          });
          if (e3) errors.push(`FIFO ${it.drug_name}: ${e3.message}`);
        } catch (errRpc) {
          errors.push(`FIFO ${it.drug_name}: ${errRpc.message || 'خطای شبکه'}`);
        }
      } catch (e) {
        errors.push(`${it.drug_name}: ${e.message}`);
      }
    }

    console.log('✅ موفق:', successes);
    console.log('❌ خطاها:', errors);

    const finalizedRow = {
      id: receiptId,
      receipt_number: state.receiptId ? `RCV-${receiptId}` : '-',
      supplier_name: state.supplierName,
      status: 'final',
      invoice_id: state.linkedInvoice?.id || null,
      date_received: new Date().toISOString().slice(0, 10),
    };

    if (errors.length) {
      alert('⚠ برخی اقلام با خطا مواجه شدند:\n\n' + errors.join('\n\n') +
        (successes.length ? '\n\n✅ موفق:\n' + successes.join('\n') : ''));
    } else {
      toast('✅ رسید با موفقیت ثبت نهایی شد', 'success');
    }

    setTimeout(() => {
      if (confirm('گزارش مغایرت فاکتور و سفارش این رسید را ببینید؟')) {
        openDiscrepancyReport(finalizedRow);
      }
    }, 400);

    localStorage.removeItem(AUTOSAVE_KEY);
    state.items = [];
    state.supplierId = null;
    state.supplierName = '';
    state.linkedInvoice = null;
    state.receiptId = null;
    state.isFinalizing = false;
    state.view = 'list';
    state.listPage = 1;
    await renderListView();

  } catch (e) {
    alert('❌ ' + (e.message || e));
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> ثبت نهایی'; }
    state.isFinalizing = false;
  }
}
