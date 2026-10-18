// js/modules/receive.js
import { sb } from '../sb.js';
import {
  $, faNum, escapeHtml, parseGS1, cleanGTIN, gregorianToJalali,
  jalaliToGregorian, checkExpiry, toast, beep, makeBatchNumber
} from '../utils.js';
import { showScreen } from '../ui.js';
import { openScanner } from '../scanner.js';
import { askQty, openDrugSearch, promptExpirySelection } from '../modals.js';
import { currentUser } from '../auth.js';

const state = {
  view: 'list',
  receiptId: null, // برای ذخیره پیش‌نویس
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
  listLoading: false,
};

const PAGE_SIZE = 20;

// ═══ ذخیره خودکار در دیتابیس هر ۵ ثانیه ═══
setInterval(async () => {
  if (state.view === 'form' && state.items.length > 0 && !state.isFinalizing) {
    await saveDraft(true); // true یعنی در پس‌زمینه بی‌صدا انجام شود
  }
}, 5000);

export async function openReceive() {
  showScreen('Receive');
  state.view = 'list';
  state.listPage = 1;
  await renderListView();
}

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
          <input type="text" class="form-control" id="recvSearch" placeholder="شماره رسید یا نام تأمین‌کننده...">
        </div>

        <div class="row g-2 mt-2">
          <div class="col-6">
            <input type="text" class="form-control text-center" id="recvFrom" placeholder="از تاریخ" dir="ltr" autocomplete="off">
          </div>
          <div class="col-6">
            <input type="text" class="form-control text-center" id="recvTo" placeholder="تا تاریخ" dir="ltr" autocomplete="off">
          </div>
        </div>

        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-primary flex-grow-1" id="recvFilter">
            <i class="bi bi-funnel"></i> اعمال فیلتر
          </button>
          <button class="btn btn-outline-secondary" id="recvClear" title="پاک کردن">
            <i class="bi bi-arrow-counterclockwise"></i>
          </button>
        </div>
      </div>
    </div>

    <div id="recvListBox"></div>

    <div class="d-flex justify-content-between align-items-center mt-3" id="recvPagerWrap">
      <button class="btn btn-sm btn-outline-primary" id="recvPrev">
        <i class="bi bi-chevron-right"></i> قبلی
      </button>
      <span class="small text-muted" id="recvPager">—</span>
      <button class="btn btn-sm btn-outline-primary" id="recvNext">
        بعدی <i class="bi bi-chevron-left"></i>
      </button>
    </div>
  `;

  $('recvSearch').value = state.listQuery || '';
  $('recvFrom').value = state.listDateFrom || '';
  $('recvTo').value = state.listDateTo || '';

  $('recvNewBtn').onclick = () => openNewReceive(null);
  $('recvFilter').onclick = () => {
    state.listQuery = $('recvSearch').value.trim();
    state.listDateFrom = $('recvFrom').value.trim();
    state.listDateTo = $('recvTo').value.trim();
    state.listPage = 1;
    loadReceiptList();
  };
  $('recvClear').onclick = () => {
    $('recvSearch').value = '';
    $('recvFrom').value = '';
    $('recvTo').value = '';
    state.listQuery = state.listDateFrom = state.listDateTo = '';
    state.listPage = 1;
    loadReceiptList();
  };
  $('recvSearch').onkeydown = (e) => { if (e.key === 'Enter') $('recvFilter').click(); };
  $('recvPrev').onclick = () => {
    if (state.listPage > 1) { state.listPage--; loadReceiptList(); }
  };
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
    jQuery('#recvFrom, #recvTo').persianDatepicker({
      theme: 'melon', formatDate: 'YYYY/MM/DD',
      cellWidth: 32, cellHeight: 25, fontSize: 13
    });
  } catch (e) {}
}

async function loadReceiptList() {
  const box = $('recvListBox');
  if (!box) return;
  box.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-warning"></div></div>';

  try {
    let q = sb.from('drugs_receipt')
      .select('id, receipt_number, supplier_name, status, receipt_type, date_received, created_at', { count: 'exact' })
      .order('date_received', { ascending: false })
      .order('id', { ascending: false });

    if (state.listQuery) {
      q = q.or(`receipt_number.ilike.%${state.listQuery}%,supplier_name.ilike.%${state.listQuery}%`);
    }
    if (state.listDateFrom) {
      const g = jalaliToGregorian(state.listDateFrom);
      if (g) q = q.gte('date_received', g);
    }
    if (state.listDateTo) {
      const g = jalaliToGregorian(state.listDateTo);
      if (g) q = q.lte('date_received', g);
    }

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
    const retry = box.querySelector('#recvRetry');
    if (retry) retry.onclick = loadReceiptList;
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
    updatePager();
    return;
  }

  box.innerHTML = state.listRows.map(r => `
    <div class="item-card" data-id="${r.id}" style="cursor:pointer;">
      <div class="d-flex justify-content-between align-items-center">
        <div class="flex-grow-1">
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="fw-bold text-primary">${escapeHtml(r.receipt_number || '-')}</span>
            ${statusBadge(r.status)}
          </div>
          <div class="meta">
            <i class="bi bi-truck"></i> ${escapeHtml(r.supplier_name || '-')}
          </div>
          <div class="meta">
            <i class="bi bi-calendar3"></i> ${escapeHtml(gregorianToJalali(r.date_received) || '-')}
            ${r.receipt_type ? `<span class="badge bg-light text-dark border ms-2">${
              r.receipt_type === 'with_invoice' ? 'با فاکتور' : 'بدون فاکتور'}</span>` : ''}
          </div>
        </div>
        <i class="bi bi-chevron-left text-muted"></i>
      </div>
    </div>
  `).join('');

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
      </div>
      <div class="archive-sheet-body" id="recvDetailItems">
        <div class="text-center py-4"><div class="spinner-border text-warning spinner-border-sm"></div></div>
      </div>
      <div class="archive-sheet-actions" style="display:flex; gap:8px;">
        <button class="btn btn-light flex-grow-1" id="recvDetailClose">بستن</button>
        ${isDraft ? `
          <button class="btn btn-primary flex-grow-1" id="recvEditDraft">ویرایش پیش‌نویس</button>
        ` : ''}
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  const close = () => { backdrop.classList.add('closing'); setTimeout(() => backdrop.remove(), 200); };
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  backdrop.querySelector('#recvDetailClose').onclick = close;

  if (isDraft) {
    backdrop.querySelector('#recvEditDraft').onclick = () => {
      close();
      openNewReceive(row);
    };
  }

  try {
    const { data: items, error } = await sb.from('drugs_receiptitem')
      .select('id, drug_id, received_quantity, batch_number, expiry_date, drug:drugs_drug(name, form)')
      .eq('receipt_id', row.id);
    if (error) throw error;

    const body = backdrop.querySelector('#recvDetailItems');
    if (!items?.length) {
      body.innerHTML = '<div class="text-center muted">قلمی ثبت نشده</div>';
      return;
    }
    body.innerHTML = `
      <div class="archive-sheet-section-title">اقلام (${faNum(items.length)})</div>
      <table class="archive-detail-table">
        <tbody>
          ${items.map((it, i) => `
            <tr>
              <td class="detail-key">${faNum(i + 1)}. ${escapeHtml(it.drug?.name || '—')} ${it.drug?.form ? `(${escapeHtml(it.drug.form)})` : ''}</td>
              <td class="detail-val">
                <div>تعداد: <strong>${faNum(it.received_quantity)}</strong></div>
                <div class="small muted">بچ: <bdi dir="ltr">${escapeHtml(it.batch_number || '-')}</bdi></div>
                <div class="small muted">انقضا: ${escapeHtml(gregorianToJalali(it.expiry_date) || '-')}</div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    backdrop.querySelector('#recvDetailItems').innerHTML =
      `<div class="alert alert-danger small m-2">${escapeHtml(e.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════
// فرم دریافت (جدید یا ویرایش پیش‌نویس)
// ═══════════════════════════════════════════════════════════
async function openNewReceive(existingDraft = null) {
  state.view = 'form';
  state.isFinalizing = false;
  
  if (existingDraft) {
    // بارگذاری پیش‌نویس موجود
    state.receiptId = existingDraft.id;
    state.supplierId = existingDraft.supplier_id || null;
    state.supplierName = existingDraft.supplier_name || '';
    
    const { data: items } = await sb.from('drugs_receiptitem').select('*, drug:drugs_drug(name, form)').eq('receipt_id', existingDraft.id);
    state.items = (items || []).map(i => ({
      drug_id: i.drug_id,
      drug_name: i.drug?.name || 'نامشخص',
      drug_form: i.drug?.form || '',
      qty: i.received_quantity,
      batch: i.batch_number,
      expiry: i.expiry_date,
      barcode: null // در پیش‌نویس ذخیره نمی‌شود
    }));
  } else {
    // شروع جدید
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
        <button class="btn btn-sm btn-outline-light" id="recvBackToList">
          <i class="bi bi-arrow-right"></i> لیست
        </button>
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
        <button class="btn btn-outline-secondary w-100" id="recvLinkInvoice">
          <i class="bi bi-receipt"></i> اتصال به فاکتور
        </button>
      </div>
    </div>
    <div class="row g-2 mb-3">
      <div class="col-6"><button class="btn btn-warning w-100 py-3" id="recvScan"><i class="bi bi-upc-scan"></i> اسکن</button></div>
      <div class="col-6"><button class="btn btn-outline-warning w-100 py-3" id="recvSearch"><i class="bi bi-search"></i> جستجو</button></div>
    </div>
    <div class="section-title"><span>اقلام دریافتی</span><span class="badge-soft warning" id="recvCount">۰</span></div>
    <div id="recvList"></div>
    
    <div class="d-grid gap-2 mt-3">
      <button class="btn btn-outline-primary btn-lg w-100 py-3" id="recvSaveDraft">
        <i class="bi bi-save"></i> ذخیره پیش‌نویس
      </button>
      <button class="btn btn-success btn-lg w-100 py-3" id="recvFinalize">
        <i class="bi bi-check-circle-fill"></i> ثبت نهایی
      </button>
    </div>`;

  $('recvBackToList').onclick = () => { state.view = 'list'; renderListView(); };
  
  $('recvSupplier').onchange = e => {
    state.supplierId = parseInt(e.target.value) || null;
    state.supplierName = e.target.options[e.target.selectedIndex].text;
  };
  if (state.supplierId) {
    $('recvSupplier').value = state.supplierId;
  }

  $('recvScan').onclick = () => openScanner(handleBarcode);
  $('recvSearch').onclick = () => openDrugSearch('دارو را جستجو کنید', d => addDrug(d));
  
  $('recvSaveDraft').onclick = () => saveDraft(false);
  $('recvFinalize').onclick = finalize;

  // کد اتصال فاکتور حذف شد تا کد کوتاه‌تر شود (در صورت نیاز می‌توانید اضافه کنید)
  
  renderList();
}

function renderList() {
  const c = $('recvContent');
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
              انقضا: ${escapeHtml(it.expiry || '—')} <span class="muted">(${gregorianToJalali(it.expiry)})</span>
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
}

// ═══════════════════════════════════════════════════════════
// ذخیره پیش‌نویس (دستی یا خودکار)
// ═══════════════════════════════════════════════════════════
async function saveDraft(silent = false) {
  if (!state.items.length) {
    if (!silent) toast('قلمی برای ذخیره وجود ندارد', 'warning');
    return false;
  }

  try {
    let receiptId = state.receiptId;
    const code = receiptId ? null : `RCV-${Date.now().toString().slice(-6)}`;

    // ۱. ایجاد یا آپدیت سربرگ
    if (!receiptId) {
      const { data, error } = await sb.from('drugs_receipt').insert({
        receipt_number: code,
        supplier_name: state.supplierName || 'نامشخص',
        status: 'draft',
        receipt_type: 'without_invoice',
        date_received: new Date().toISOString().slice(0, 10)
      }).select().single();
      
      if (error) throw error;
      receiptId = data.id;
      state.receiptId = receiptId;
    } else {
      await sb.from('drugs_receipt').update({
        supplier_name: state.supplierName || 'نامشخص',
      }).eq('id', receiptId);
    }

    // ۲. پاک کردن اقلام قبلی و درج مجدد
    await sb.from('drugs_receiptitem').delete().eq('receipt_id', receiptId);
    
    const itemsToInsert = state.items.map(it => ({
      receipt_id: receiptId,
      drug_id: it.drug_id,
      received_quantity: it.qty,
      batch_number: it.batch,
      expiry_date: it.expiry
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

// ═══════════════════════════════════════════════════════════
// پردازش بارکد و افزودن دارو
// ═══════════════════════════════════════════════════════════
async function handleBarcode(raw) {
  const parsed = parseGS1(raw);
  if (parsed.exps && parsed.exps.length > 0) {
    const isInvalid = !parsed.exp.includes('-');
    if (parsed.exps.length > 1 || isInvalid) {
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
}

function reopenScannerAuto() {
  setTimeout(() => {
    const wrap = $('scannerWrap');
    if (!wrap || !wrap.classList.contains('active')) {
      openScanner(handleBarcode);
    }
  }, 350);
}

async function addDrug(drug, barcode = '', parsed = {}) {
  const res = await askQty({
    title: 'تایید دریافت',
    headerClass: 'bg-warning',
    drugName: drug.name + (drug.form ? ` (${drug.form})` : ''),
    defaultQty: 1,
    defaultExpiry: parsed?.exp || '',
    showExtras: true,
    hideBatchInput: true,
    requireExpiry: true,
  });

  if (res.qty < 1) return false;
  if (!res.expiry_gregorian) { toast('تاریخ انقضا الزامی است', 'danger'); beep(300); return false; }

  const finalBatch = makeBatchNumber(drug.name, drug.form, res.expiry_gregorian);
  if (!finalBatch) { toast('ساخت بچ ناموفق', 'danger'); return false; }

  const ex = state.items.find(it => it.drug_id === drug.id && (it.batch || '') === finalBatch);
  if (ex && ex.expiry === res.expiry_gregorian) ex.qty += res.qty;
  else state.items.push({
    drug_id: drug.id,
    drug_name: drug.name,
    drug_form: drug.form || '',
    qty: res.qty,
    batch: finalBatch,
    expiry: res.expiry_gregorian,
    barcode
  });

  renderList();
  beep();
  return true;
}

// ═══════════════════════════════════════════════════════════
// ذخیره نهایی (با دابل چک)
// ═══════════════════════════════════════════════════════════
async function finalize() {
  if (!state.supplierId) { toast('تامین‌کننده را انتخاب کنید', 'warning'); return; }
  if (!state.items.length) { toast('حداقل یک قلم', 'warning'); return; }

  // ⬅️ دابل چک (دو مرحله تایید)
  if (!confirm(`آیا از ثبت نهایی ${faNum(state.items.length)} قلم اطمینان دارید؟`)) return;
  if (!confirm('⚠️ هشدار نهایی: با این کار موجودی انبار افزایش می‌یابد و سند قفل می‌شود. ادامه می‌دهید؟')) return;

  state.isFinalizing = true;
  const btn = $('recvFinalize');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> ثبت نهایی...';

  try {
    // ۱. اگر پیش‌نویس داشتیم، اول ذخیره می‌کنیم
    if (!state.receiptId) {
      const saved = await saveDraft(true);
      if (!saved) throw new Error('خطا در آماده‌سازی سند');
    }

    const receiptId = state.receiptId;

    // ۲. تغییر وضعیت به نهایی
    const { error: eStatus } = await sb.from('drugs_receipt').update({ status: 'final' }).eq('id', receiptId);
    if (eStatus) throw eStatus;

    const errors = [];
    const successes = [];

    // ۳. اعمال روی موجودی (با چک کردن بچ تکراری)
    for (const it of state.items) {
      try {
        const { data: existing, error: eFind } = await sb.from('drugs_drugbatch')
          .select('id, quantity')
          .eq('drug_id', it.drug_id)
          .eq('batch_number', it.batch)
          .maybeSingle();
          
        if (eFind) throw new Error(`جستجو بچ: ${eFind.message}`);

        if (existing) {
          // اگر بچ قبلا بود، فقط تعداد رو اضافه میکنیم
          const newQty = (existing.quantity || 0) + it.qty;
          const { error: eUpd } = await sb.from('drugs_drugbatch')
            .update({ quantity: newQty })
            .eq('id', existing.id);
          if (eUpd) throw new Error(`آپدیت بچ: ${eUpd.message}`);
          successes.push(`${it.drug_name}: بچ موجود، افزایش تعداد`);
        } else {
          // اگر نبود، بچ جدید میسازیم
          const { error: eIns } = await sb.from('drugs_drugbatch')
            .insert({
              drug_id: it.drug_id,
              batch_number: it.batch,
              expiry_date: it.expiry,
              quantity: it.qty,
              supplier_id: state.supplierId,
              purchase_price: 0,
              is_active: true,
              is_temporary: false
            });
          if (eIns) throw new Error(`درج بچ: ${eIns.message}`);
          successes.push(`${it.drug_name}: بچ جدید ایجاد شد`);
        }

        // تخصیص به درخواست‌ها
        await sb.rpc('allocate_to_requests', { p_drug_id: it.drug_id, p_quantity: it.qty, p_force_close: false });

      } catch (err) {
        errors.push(`${it.drug_name}: ${err.message}`);
      }
    }

    if (errors.length) {
      alert('⚠ برخی اقلام با خطا مواجه شدند:\n\n' + errors.join('\n'));
    } else {
      toast('✅ رسید با موفقیت ثبت نهایی شد', 'success');
    }

    // پاکسازی فرم
    state.items = [];
    state.supplierId = null;
    state.supplierName = '';
    state.receiptId = null;
    state.isFinalizing = false;

    state.view = 'list';
    state.listPage = 1;
    await renderListView();
    
  } catch (e) {
    alert('❌ ' + (e.message || e));
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> ثبت نهایی';
    state.isFinalizing = false;
  }
}
