// js/modules/receipt-list.js
import { sb } from '../sb.js';
import { $, faNum, escapeHtml, gregorianToJalali, jalaliToGregorian, toast } from '../utils.js';
import { printA4 } from './list-print.js';

const PAGE_SIZE = 20;

const state = {
  page: 1,
  total: 0,
  query: '',
  dateFrom: '',
  dateTo: '',
  rows: [],
  loading: false,
};

// ═══════════════════════════════════════════════════════════
// ورودی
// ═══════════════════════════════════════════════════════════
export function openReceiptList() {
  if (!document.getElementById('receiptListWrap')) buildOverlay();
  document.getElementById('receiptListWrap').classList.add('active');
  document.body.style.overflow = 'hidden';
  bindEvents();
  loadRows();
}

function buildOverlay() {
  const div = document.createElement('div');
  div.id = 'receiptListWrap';
  div.className = 'list-overlay';
  div.innerHTML = `
    <div class="list-sheet">
      <div class="list-header">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-file-earmark-text text-primary"></i>
          <span class="fw-bold">لیست رسیدهای دریافت</span>
        </div>
        <button class="list-close" id="receiptListClose"><i class="bi bi-x-lg"></i></button>
      </div>

      <div class="list-filters">
        <div class="input-group mb-2">
          <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
          <input type="text" id="receiptListQ" class="form-control"
                 placeholder="شماره رسید یا نام تأمین‌کننده...">
        </div>
        <div class="row g-2">
          <div class="col-6">
            <input type="text" id="receiptListFrom" class="form-control text-center"
                   placeholder="از تاریخ" dir="ltr" autocomplete="off">
          </div>
          <div class="col-6">
            <input type="text" id="receiptListTo" class="form-control text-center"
                   placeholder="تا تاریخ" dir="ltr" autocomplete="off">
          </div>
        </div>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-primary flex-grow-1" id="receiptListFilter">
            <i class="bi bi-funnel"></i> اعمال فیلتر
          </button>
          <button class="btn btn-outline-secondary" id="receiptListClear" title="پاک کردن">
            <i class="bi bi-arrow-counterclockwise"></i>
          </button>
          <button class="btn btn-success" id="receiptListPrint" title="چاپ لیست">
            <i class="bi bi-printer"></i>
          </button>
        </div>
      </div>

      <div class="list-body" id="receiptListBody">
        <div class="text-center py-5">
          <div class="spinner-border text-primary"></div>
        </div>
      </div>

      <div class="list-footer">
        <button class="btn btn-sm btn-outline-primary" id="receiptListPrev">
          <i class="bi bi-chevron-right"></i> قبلی
        </button>
        <span class="small text-muted" id="receiptListPager">—</span>
        <button class="btn btn-sm btn-outline-primary" id="receiptListNext">
          بعدی <i class="bi bi-chevron-left"></i>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(div);
  injectStyles();
}

function bindEvents() {
  const wrap = document.getElementById('receiptListWrap');
  wrap.querySelector('#receiptListClose').onclick = closeReceiptList;
  wrap.querySelector('#receiptListFilter').onclick = () => {
    state.query = wrap.querySelector('#receiptListQ').value.trim();
    state.dateFrom = wrap.querySelector('#receiptListFrom').value.trim();
    state.dateTo = wrap.querySelector('#receiptListTo').value.trim();
    state.page = 1;
    loadRows();
  };
  wrap.querySelector('#receiptListClear').onclick = () => {
    wrap.querySelector('#receiptListQ').value = '';
    wrap.querySelector('#receiptListFrom').value = '';
    wrap.querySelector('#receiptListTo').value = '';
    state.query = state.dateFrom = state.dateTo = '';
    state.page = 1;
    loadRows();
  };
  wrap.querySelector('#receiptListPrint').onclick = () => printReceiptList();
  wrap.querySelector('#receiptListPrev').onclick = () => {
    if (state.page > 1) { state.page--; loadRows(); }
  };
  wrap.querySelector('#receiptListNext').onclick = () => {
    const maxPage = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    if (state.page < maxPage) { state.page++; loadRows(); }
  };
  wrap.querySelector('#receiptListQ').onkeydown = (e) => {
    if (e.key === 'Enter') wrap.querySelector('#receiptListFilter').click();
  };
}

export function closeReceiptList() {
  const wrap = document.getElementById('receiptListWrap');
  if (wrap) wrap.classList.remove('active');
  document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════════════════
// بارگذاری از Supabase
// ═══════════════════════════════════════════════════════════
async function loadRows() {
  const body = document.getElementById('receiptListBody');
  if (!body) return;
  body.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
  state.loading = true;

  try {
    let q = sb.from('drugs_receipt')
      .select('id, receipt_number, supplier_name, status, receipt_type, date_received, created_at',
              { count: 'exact' })
      .order('date_received', { ascending: false })
      .order('id', { ascending: false });

    if (state.query) {
      // جستجو در شماره رسید و نام تأمین‌کننده
      q = q.or(`receipt_number.ilike.%${state.query}%,supplier_name.ilike.%${state.query}%`);
    }
    if (state.dateFrom) {
      const g = jalaliToGregorian(state.dateFrom);
      if (g) q = q.gte('date_received', g);
    }
    if (state.dateTo) {
      const g = jalaliToGregorian(state.dateTo);
      if (g) q = q.lte('date_received', g);
    }

    const from = (state.page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error, count } = await q.range(from, to);

    if (error) throw error;

    state.rows = data || [];
    state.total = count || 0;
    renderRows();
  } catch (e) {
    console.error('[RECEIPT-LIST] load error:', e);
    body.innerHTML = `
      <div class="alert alert-danger m-3">
        <i class="bi bi-exclamation-triangle"></i>
        خواندن لیست ناموفق بود: ${escapeHtml(e.message || 'خطای نامشخص')}
        <button class="btn btn-sm btn-outline-danger mt-2 d-block" id="receiptListRetry">تلاش مجدد</button>
      </div>`;
    const retry = body.querySelector('#receiptListRetry');
    if (retry) retry.onclick = loadRows;
  } finally {
    state.loading = false;
  }
}

function renderRows() {
  const body = document.getElementById('receiptListBody');
  if (!body) return;

  if (!state.rows.length) {
    body.innerHTML = '<div class="text-center py-5 text-muted">موردی یافت نشد</div>';
    updatePager();
    return;
  }

  body.innerHTML = state.rows.map(r => `
    <div class="list-row" data-id="${r.id}">
      <div class="list-row-head">
        <span class="fw-bold text-primary">${escapeHtml(r.receipt_number || '-')}</span>
        <span class="badge ${r.status === 'final' ? 'bg-success' : 'bg-warning text-dark'}">
          ${r.status === 'final' ? 'نهایی' : 'پیش‌نویس'}
        </span>
      </div>
      <div class="list-row-body">
        <div><i class="bi bi-truck text-muted"></i>
          <span class="ms-1">${escapeHtml(r.supplier_name || '-')}</span>
        </div>
        <div class="small text-muted mt-1">
          <i class="bi bi-calendar3"></i>
          تاریخ: <bdi dir="ltr">${escapeHtml(gregorianToJalali(r.date_received))}</bdi>
        </div>
        ${r.receipt_type ? `<div class="small mt-1"><span class="badge bg-light text-dark border">${escapeHtml(r.receipt_type === 'with_invoice' ? 'با فاکتور' : 'بدون فاکتور')}</span></div>` : ''}
      </div>
    </div>
  `).join('');

  updatePager();
}

function updatePager() {
  const maxPage = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  const pager = document.getElementById('receiptListPager');
  if (pager) pager.textContent = `صفحه ${faNum(state.page)} از ${faNum(maxPage)} • ${faNum(state.total)} رسید`;
}

// ═══════════════════════════════════════════════════════════
// چاپ لیست (A4 با سربرگ)
// ═══════════════════════════════════════════════════════════
async function printReceiptList() {
  if (!state.rows.length) {
    toast('لیست خالی است', 'warning');
    return;
  }

  // اگر تعداد کل > سقف نمایش داده‌شده، هشدار بده
  if (state.total > state.rows.length) {
    if (!confirm(`فقط ${state.rows.length} ردیف از ${state.total} ردیف چاپ می‌شود. ادامه؟`)) return;
  }

  const now = new Date();
  const dateStr = gregorianToJalali(now.toISOString().slice(0, 10));

  printA4({
    title: 'لیست رسیدهای دریافت کالا',
    subtitle: 'انبار دارو و ملزمات پزشکی',
    primaryColor: '#0d6efd',
    headerMeta: {
      code: state.query ? `جستجو: ${state.query}` : '',
      date: dateStr,
      status: `تعداد: ${faNum(state.rows.length)} رسید`,
    },
    infoCards: [{
      title: 'مشخصات گزارش',
      rows: [
        ['نام واحد', 'مجتمع گندله‌سازی بهاباد'],
        ['شناسه ملی', '۱۰۸۶۱۸۳۵۴۷۰'],
      ],
    }, {
      title: 'فیلترها',
      rows: [
        ['از تاریخ', state.dateFrom || '-'],
        ['تا تاریخ', state.dateTo || '-'],
        ['جستجو', state.query || '-'],
      ],
    }],
    columns: [
      { label: '#', key: 'idx', formatter: (r, i) => faNum(i + 1) },
      { label: 'شماره رسید', key: 'receipt_number', cls: 'fw-bold' },
      { label: 'تأمین‌کننده', key: 'supplier_name', align: 'right' },
      { label: 'تاریخ دریافت', key: 'date_received', formatter: (r) => escapeHtml(gregorianToJalali(r.date_received)) },
      { label: 'وضعیت', key: 'status', formatter: (r) => r.status === 'final' ? 'نهایی' : 'پیش‌نویس' },
    ],
    rows: state.rows,
    signatures: ['تنظیم‌کننده', 'مدیر انبار', 'تأییدکننده'],
  });
}

// ═══════════════════════════════════════════════════════════
// استایل‌ها (یک‌بار inject می‌شود)
// ═══════════════════════════════════════════════════════════
function injectStyles() {
  if (document.getElementById('listOverlayStyles')) return;
  const style = document.createElement('style');
  style.id = 'listOverlayStyles';
  style.textContent = `
    .list-overlay {
      position: fixed; inset: 0; background: rgba(15,23,42,.55);
      z-index: 9998; display: none; align-items: center; justify-content: center;
      padding: 8px; backdrop-filter: blur(2px);
    }
    .list-overlay.active { display: flex; }
    .list-sheet {
      background: #fff; border-radius: 16px; width: 100%; max-width: 720px;
      max-height: 96vh; display: flex; flex-direction: column; overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,.3);
    }
    .list-header {
      padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
      display: flex; align-items: center; justify-content: space-between;
    }
    .list-close {
      background: none; border: none; font-size: 1.1rem; color: #64748b;
      width: 36px; height: 36px; border-radius: 50%;
    }
    .list-close:active { background: #e2e8f0; }
    .list-filters { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; }
    .list-body {
      flex: 1; overflow-y: auto; padding: 8px 12px;
      -webkit-overflow-scrolling: touch;
    }
    .list-row {
      background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 10px 12px; margin-bottom: 8px;
    }
    .list-row-head {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 6px;
    }
    .list-footer {
      padding: 10px 16px; border-top: 1px solid #e2e8f0; background: #f8fafc;
      display: flex; justify-content: space-between; align-items: center;
    }
    @media (max-width: 480px) {
      .list-sheet { border-radius: 12px; max-height: 98vh; }
    }
  `;
  document.head.appendChild(style);
}
