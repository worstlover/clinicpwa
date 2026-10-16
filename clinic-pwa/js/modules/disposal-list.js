// js/modules/disposal-list.js
import { sb } from '../sb.js';
import { faNum, escapeHtml, gregorianToJalali, jalaliToGregorian, toast } from '../utils.js';
import { printA4 } from './list-print.js';

const PAGE_SIZE = 20;

const state = {
  page: 1, total: 0,
  query: '', dateFrom: '', dateTo: '',
  rows: [], loading: false,
};

export function openDisposalList() {
  if (!document.getElementById('dispListWrap')) buildOverlay();
  document.getElementById('dispListWrap').classList.add('active');
  document.body.style.overflow = 'hidden';
  bindEvents();
  loadRows();
}

function buildOverlay() {
  const div = document.createElement('div');
  div.id = 'dispListWrap';
  div.className = 'list-overlay';
  div.innerHTML = `
    <div class="list-sheet">
      <div class="list-header">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-trash3 text-danger"></i>
          <span class="fw-bold">سندهای خروج دارو (امحا)</span>
        </div>
        <button class="list-close" id="dispListClose"><i class="bi bi-x-lg"></i></button>
      </div>

      <div class="list-filters">
        <div class="input-group mb-2">
          <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
          <input type="text" id="dispListQ" class="form-control" placeholder="کد سند یا نام دارو...">
        </div>
        <div class="row g-2">
          <div class="col-6"><input type="text" id="dispListFrom" class="form-control text-center" placeholder="از تاریخ" dir="ltr" autocomplete="off"></div>
          <div class="col-6"><input type="text" id="dispListTo" class="form-control text-center" placeholder="تا تاریخ" dir="ltr" autocomplete="off"></div>
        </div>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-danger flex-grow-1" id="dispListFilter"><i class="bi bi-funnel"></i> اعمال فیلتر</button>
          <button class="btn btn-outline-secondary" id="dispListClear"><i class="bi bi-arrow-counterclockwise"></i></button>
          <button class="btn btn-success" id="dispListPrint"><i class="bi bi-printer"></i></button>
        </div>
      </div>

      <div class="list-body" id="dispListBody">
        <div class="text-center py-5"><div class="spinner-border text-danger"></div></div>
      </div>

      <div class="list-footer">
        <button class="btn btn-sm btn-outline-danger" id="dispListPrev"><i class="bi bi-chevron-right"></i> قبلی</button>
        <span class="small text-muted" id="dispListPager">—</span>
        <button class="btn btn-sm btn-outline-danger" id="dispListNext">بعدی <i class="bi bi-chevron-left"></i></button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

function bindEvents() {
  const wrap = document.getElementById('dispListWrap');
  wrap.querySelector('#dispListClose').onclick = () => {
    wrap.classList.remove('active');
    document.body.style.overflow = '';
  };
  wrap.querySelector('#dispListFilter').onclick = () => {
    state.query = wrap.querySelector('#dispListQ').value.trim();
    state.dateFrom = wrap.querySelector('#dispListFrom').value.trim();
    state.dateTo = wrap.querySelector('#dispListTo').value.trim();
    state.page = 1;
    loadRows();
  };
  wrap.querySelector('#dispListClear').onclick = () => {
    wrap.querySelector('#dispListQ').value = '';
    wrap.querySelector('#dispListFrom').value = '';
    wrap.querySelector('#dispListTo').value = '';
    state.query = state.dateFrom = state.dateTo = '';
    state.page = 1;
    loadRows();
  };
  wrap.querySelector('#dispListPrint').onclick = printList;
  wrap.querySelector('#dispListPrev').onclick = () => {
    if (state.page > 1) { state.page--; loadRows(); }
  };
  wrap.querySelector('#dispListNext').onclick = () => {
    const maxPage = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    if (state.page < maxPage) { state.page++; loadRows(); }
  };
  wrap.querySelector('#dispListQ').onkeydown = (e) => {
    if (e.key === 'Enter') wrap.querySelector('#dispListFilter').click();
  };
}

async function loadRows() {
  const body = document.getElementById('dispListBody');
  body.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-danger"></div></div>';

  try {
    let q = sb.from('disposal_orders')
      .select('id, code, created_by_email, created_at', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (state.query) {
      // جستجو در کد سند یا نام دارو (از طریق آیتم‌ها)
      const { data: matchItems } = await sb.from('disposal_items')
        .select('order_id').ilike('drug_name', `%${state.query}%`).limit(200);
      const ids = (matchItems || []).map(m => m.order_id).filter(Boolean);
      if (ids.length) {
        q = q.or(`code.ilike.%${state.query}%,id.in.(${ids.join(',')})`);
      } else {
        q = q.ilike('code', `%${state.query}%`);
      }
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

    // مجموع تعداد هر سند
    if (state.rows.length) {
      const ids = state.rows.map(r => r.id);
      const { data: items } = await sb.from('disposal_items')
        .select('order_id, quantity').in('order_id', ids);
      const totals = {}, counts = {};
      (items || []).forEach(i => {
        totals[i.order_id] = (totals[i.order_id] || 0) + Number(i.quantity || 0);
        counts[i.order_id] = (counts[i.order_id] || 0) + 1;
      });
      state.rows.forEach(r => {
        r._items = counts[r.id] || 0;
        r._total = totals[r.id] || 0;
      });
    }

    renderRows();
  } catch (e) {
    console.error('[DISP-LIST] load error:', e);
    body.innerHTML = `
      <div class="alert alert-danger m-3">
        <i class="bi bi-exclamation-triangle"></i>
        خواندن لیست ناموفق بود: ${escapeHtml(e.message || 'خطای نامشخص')}
        <button class="btn btn-sm btn-outline-danger mt-2 d-block" id="dispListRetry">تلاش مجدد</button>
      </div>`;
    const retry = body.querySelector('#dispListRetry');
    if (retry) retry.onclick = loadRows;
  }
}

function renderRows() {
  const body = document.getElementById('dispListBody');
  if (!state.rows.length) {
    body.innerHTML = '<div class="text-center py-5 text-muted">سندی یافت نشد</div>';
    updatePager();
    return;
  }

  body.innerHTML = state.rows.map(r => `
    <div class="list-row">
      <div class="list-row-head">
        <span class="fw-bold text-danger">${escapeHtml(r.code || '-')}</span>
        <span class="badge bg-light text-dark border">${faNum(r._items || 0)} قلم</span>
      </div>
      <div class="list-row-body">
        <div class="small text-muted">
          <i class="bi bi-calendar3"></i>
          <bdi dir="ltr">${escapeHtml(gregorianToJalali((r.created_at || '').slice(0, 10)))}</bdi>
        </div>
        <div class="small mt-1">
          <i class="bi bi-box-seam text-muted"></i>
          مجموع خروج: <strong class="text-danger">${faNum(r._total || 0)}</strong> عدد
        </div>
        ${r.created_by_email ? `<div class="small text-muted mt-1"><i class="bi bi-person"></i> <bdi dir="ltr">${escapeHtml(r.created_by_email)}</bdi></div>` : ''}
      </div>
    </div>
  `).join('');

  updatePager();
}

function updatePager() {
  const maxPage = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  const pager = document.getElementById('dispListPager');
  if (pager) pager.textContent = `صفحه ${faNum(state.page)} از ${faNum(maxPage)} • ${faNum(state.total)} سند`;
}

async function printList() {
  if (!state.rows.length) { toast('لیست خالی است', 'warning'); return; }

  const dateStr = gregorianToJalali(new Date().toISOString().slice(0, 10));

  printA4({
    title: 'لیست سندهای خروج دارو (امحا)',
    subtitle: 'انبار دارو و ملزومات پزشکی',
    primaryColor: '#991b1b',
    headerMeta: {
      date: dateStr,
      status: `تعداد: ${faNum(state.rows.length)} سند`,
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
      { label: '#', formatter: (r, i) => faNum(i + 1) },
      { label: 'کد سند', key: 'code', cls: 'fw-bold' },
      { label: 'تاریخ ثبت', formatter: (r) => escapeHtml(gregorianToJalali((r.created_at || '').slice(0, 10))) },
      { label: 'تعداد اقلام', formatter: (r) => faNum(r._items || 0) },
      { label: 'مجموع تعداد', formatter: (r) => faNum(r._total || 0) },
      { label: 'ثبت‌کننده', formatter: (r) => escapeHtml(r.created_by_email || '-') },
    ],
    rows: state.rows,
    signatures: ['تنظیم‌کننده', 'تأییدکننده', 'مدیر انبار'],
  });
}
