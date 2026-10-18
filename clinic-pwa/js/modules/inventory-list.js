// js/modules/inventory-list.js
import { sb } from '../sb.js';
import { faNum, escapeHtml, gregorianToJalali, jalaliToGregorian, toast } from '../utils.js';
import { printA4 } from './list-print.js';
import { openInventory } from './inventory.js'; // ⬅️ ایمپورت برای ورود به جلسه

const PAGE_SIZE = 20;

const state = {
  page: 1, total: 0,
  query: '', dateFrom: '', dateTo: '',
  rows: [], loading: false,
};

export function openInventoryList() {
  if (!document.getElementById('invListWrap')) buildOverlay();
  document.getElementById('invListWrap').classList.add('active');
  document.body.style.overflow = 'hidden';
  bindEvents();
  loadRows();
}

function buildOverlay() {
  const div = document.createElement('div');
  div.id = 'invListWrap';
  div.className = 'list-overlay';
  div.innerHTML = `
    <div class="list-sheet">
      <div class="list-header">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-clipboard-check text-primary"></i>
          <span class="fw-bold">سندهای انبارگردانی</span>
        </div>
        <button class="list-close" id="invListClose"><i class="bi bi-x-lg"></i></button>
      </div>

      <div class="list-filters">
        <div class="input-group mb-2">
          <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
          <input type="text" id="invListQ" class="form-control" placeholder="کد سند یا عنوان...">
        </div>
        <div class="row g-2">
          <div class="col-6"><input type="text" id="invListFrom" class="form-control text-center" placeholder="از تاریخ" dir="ltr" autocomplete="off"></div>
          <div class="col-6"><input type="text" id="invListTo" class="form-control text-center" placeholder="تا تاریخ" dir="ltr" autocomplete="off"></div>
        </div>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-primary flex-grow-1" id="invListFilter"><i class="bi bi-funnel"></i> اعمال فیلتر</button>
          <button class="btn btn-outline-secondary" id="invListClear"><i class="bi bi-arrow-counterclockwise"></i></button>
          <button class="btn btn-success" id="invListPrint"><i class="bi bi-printer"></i></button>
        </div>
      </div>

      <div class="list-body" id="invListBody">
        <div class="text-center py-5"><div class="spinner-border text-primary"></div></div>
      </div>

      <div class="list-footer">
        <button class="btn btn-sm btn-outline-primary" id="invListPrev"><i class="bi bi-chevron-right"></i> قبلی</button>
        <span class="small text-muted" id="invListPager">—</span>
        <button class="btn btn-sm btn-outline-primary" id="invListNext">بعدی <i class="bi bi-chevron-left"></i></button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

function bindEvents() {
  const wrap = document.getElementById('invListWrap');
  wrap.querySelector('#invListClose').onclick = () => {
    wrap.classList.remove('active');
    document.body.style.overflow = '';
  };
  wrap.querySelector('#invListFilter').onclick = () => {
    state.query = wrap.querySelector('#invListQ').value.trim();
    state.dateFrom = wrap.querySelector('#invListFrom').value.trim();
    state.dateTo = wrap.querySelector('#invListTo').value.trim();
    state.page = 1;
    loadRows();
  };
  wrap.querySelector('#invListClear').onclick = () => {
    wrap.querySelector('#invListQ').value = '';
    wrap.querySelector('#invListFrom').value = '';
    wrap.querySelector('#invListTo').value = '';
    state.query = state.dateFrom = state.dateTo = '';
    state.page = 1;
    loadRows();
  };
  wrap.querySelector('#invListPrint').onclick = printList;
  wrap.querySelector('#invListPrev').onclick = () => {
    if (state.page > 1) { state.page--; loadRows(); }
  };
  wrap.querySelector('#invListNext').onclick = () => {
    const maxPage = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    if (state.page < maxPage) { state.page++; loadRows(); }
  };
  wrap.querySelector('#invListQ').onkeydown = (e) => {
    if (e.key === 'Enter') wrap.querySelector('#invListFilter').click();
  };
}

async function loadRows() {
  const body = document.getElementById('invListBody');
  body.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

  try {
    // استفاده از * برای جلوگیری از خطای عدم وجود ستون در دیتابیس
    let q = sb.from('inv_sessions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (state.query) {
      q = q.or(`code.ilike.%${state.query}%,title.ilike.%${state.query}%`);
    }
    if (state.dateFrom) {
      const g = jalaliToGregorian(state.dateFrom);
      if (g) q = q.gte('created_at', `${g}T00:00:00`);
    }
    if (state.dateTo) {
      const g = jalaliToGregorian(state.dateTo);
      if (g) q = q.lte('created_at', `${g}T23:59:59`);
    }

    const from = (state.page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error, count } = await q.range(from, to);
    if (error) throw error;

    state.rows = data || [];
    state.total = count || 0;

    if (state.rows.length) {
      const ids = state.rows.map(r => r.id);
      
      const { data: items } = await sb.from('inv_count_items')
        .select('session_id, drug_name, counted_quantity, created_at')
        .in('session_id', ids)
        .order('created_at', { ascending: false });

      const { data: disc }  = await sb.from('inv_discrepancies').select('session_id').in('session_id', ids);

      const itemCount = {}, discCount = {}, lastItems = {};
      
      (items || []).forEach(i => {
        itemCount[i.session_id] = (itemCount[i.session_id] || 0) + 1;
        if (!lastItems[i.session_id]) lastItems[i.session_id] = [];
        if (lastItems[i.session_id].length < 3) {
          lastItems[i.session_id].push(i);
        }
      });
      
      (disc || []).forEach(d => discCount[d.session_id] = (discCount[d.session_id] || 0) + 1);

      state.rows.forEach(r => {
        r._items = itemCount[r.id] || 0;
        r._disc = discCount[r.id] || 0;
        r._lastItems = lastItems[r.id] || [];
      });
    }

    renderRows();
  } catch (e) {
    console.error('[INV-LIST] load error:', e);
    body.innerHTML = `
      <div class="alert alert-danger m-3">
        <i class="bi bi-exclamation-triangle"></i>
        خواندن لیست ناموفق بود: ${escapeHtml(e.message || 'خطای نامشخص')}
        <button class="btn btn-sm btn-outline-danger mt-2 d-block" id="invListRetry">تلاش مجدد</button>
      </div>`;
    const retry = body.querySelector('#invListRetry');
    if (retry) retry.onclick = loadRows;
  }
}

function renderRows() {
  const body = document.getElementById('invListBody');
  if (!state.rows.length) {
    body.innerHTML = '<div class="text-center py-5 text-muted">سندی یافت نشد</div>';
    updatePager();
    return;
  }

  body.innerHTML = state.rows.map(r => {
    const isClosed = ['completed', 'applied'].includes(r.status);
    const st = r.status === 'applied' ? { cls: 'bg-success', label: 'بسته شده (اعمال شده)' }
            : r.status === 'completed' ? { cls: 'bg-info text-white', label: 'بسته شده (ثبت گزارش)' }
            : { cls: 'bg-warning text-dark', label: 'باز - در حال انجام' };
            
    const disc = r._disc > 0
      ? `<span class="badge bg-warning text-dark">${faNum(r._disc)} مغایرت</span>`
      : `<span class="badge bg-success">بدون مغایرت</span>`;

    // اگر ستون‌های دیتابیس وجود نداشته باشند، به تاریخ ساخت برمی‌گردیم
    const lastEditTime = r.updated_at || r.created_at;
    const timeStr = lastEditTime ? new Date(lastEditTime).toLocaleString('fa-IR') : 'نامشخص';
    const editorEmail = r.updated_by_email || r.created_by_email || 'نامشخص';

    const itemsSummary = r._lastItems.length > 0 
      ? r._lastItems.map(i => `<div class="small text-muted">• ${escapeHtml(i.drug_name)} (${faNum(i.counted_quantity)} عدد)</div>`).join('')
      : '<div class="small text-muted">قلمی ثبت نشده</div>';

    return `
      <div class="list-row ${isClosed ? 'opacity-75' : ''}" 
           style="${isClosed ? 'cursor: default;' : 'cursor: pointer;'}"
           data-id="${r.id}" data-closed="${isClosed}">
        <div class="list-row-head">
          <span class="fw-bold text-primary">${escapeHtml(r.code || '-')}</span>
          <span class="badge ${st.cls}">${st.label}</span>
        </div>
        <div class="list-row-body">
          <div class="small fw-bold"><i class="bi bi-card-text text-muted"></i>
            <span class="ms-1">${escapeHtml(r.title || 'بدون عنوان')}</span>
          </div>
          
          <div class="small text-muted mt-1">
            <i class="bi bi-clock-history"></i> آخرین ویرایش: <bdi dir="ltr">${timeStr}</bdi> توسط: ${escapeHtml(editorEmail)}
          </div>
          
          <div class="small text-muted mt-1">
            <i class="bi bi-calendar3"></i> ایجاد: <bdi dir="ltr">${escapeHtml(gregorianToJalali((r.created_at || '').slice(0, 10)))}</bdi>
            <span class="mx-2">•</span>
            <i class="bi bi-list-check"></i> ${faNum(r._items || 0)} قلم
          </div>

          <div class="mt-2 bg-light p-2 rounded border" style="font-size: 0.8rem;">
            <div class="fw-bold mb-1 text-secondary">۳ قلم آخر:</div>
            ${itemsSummary}
          </div>

          <div class="mt-2">${disc}</div>
        </div>
      </div>`;
  }).join('');

  // ⭐ اضافه کردن رویداد کلیک برای باز کردن جلسه باز
  body.querySelectorAll('.list-row').forEach(el => {
    el.onclick = () => {
      const isClosed = el.dataset.closed === 'true';
      const sessionId = el.dataset.id;
      if (isClosed) {
        toast('این سند بسته شده و قابل ویرایش نیست.', 'warning');
        return;
      }
      // هدایت به صفحه انبارگردانی و بازیابی جلسه
      localStorage.setItem('inv_session_id', sessionId);
      document.getElementById('invListWrap').classList.remove('active');
      document.body.style.overflow = '';
      openInventory();
    };
  });

  updatePager();
}

function updatePager() {
  const maxPage = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  const pager = document.getElementById('invListPager');
  if (pager) pager.textContent = `صفحه ${faNum(state.page)} از ${faNum(maxPage)} • ${faNum(state.total)} سند`;
}

async function printList() {
  if (!state.rows.length) { toast('لیست خالی است', 'warning'); return; }

  const dateStr = gregorianToJalali(new Date().toISOString().slice(0, 10));

  printA4({
    title: 'لیست سندهای انبارگردانی',
    subtitle: 'انبار دارو و ملزومات پزشکی',
    primaryColor: '#0d6efd',
    headerMeta: {
      date: dateStr,
      status: `تعداد: ${faNum(state.rows.length)} سند`,
    },
    columns: [
      { label: '#', formatter: (r, i) => faNum(i + 1) },
      { label: 'کد سند', key: 'code', cls: 'fw-bold' },
      { label: 'عنوان', key: 'title', align: 'right' },
      { label: 'تاریخ', formatter: (r) => escapeHtml(gregorianToJalali((r.created_at || '').slice(0, 10))) },
      { label: 'اقلام', formatter: (r) => faNum(r._items || 0) },
      { label: 'مغایرت', formatter: (r) => r._disc ? `${faNum(r._disc)} قلم` : 'ندارد' },
      {
        label: 'وضعیت',
        formatter: (r) => r.status === 'applied' ? 'اعمال شده'
                       : r.status === 'completed' ? 'ثبت‌شده'
                       : 'در جریان',
      },
    ],
    rows: state.rows,
    signatures: ['شمارش‌کننده', 'تأییدکننده', 'مدیر انبار'],
  });
}
