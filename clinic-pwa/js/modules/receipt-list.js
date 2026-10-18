// js/modules/receipt-list.js
import { sb } from '../sb.js';
import { $, faNum, escapeHtml, gregorianToJalali, jalaliToGregorian, toast, makeBatchNumber } from '../utils.js';
import { printA4 } from './list-print.js';
import { currentUser } from '../auth.js';

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
          <input type="text" id="receiptListQ" class="form-control" placeholder="شماره رسید یا نام تأمین‌کننده...">
        </div>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-primary flex-grow-1" id="receiptListFilter"><i class="bi bi-funnel"></i> اعمال فیلتر</button>
          <button class="btn btn-outline-secondary" id="receiptListClear"><i class="bi bi-arrow-counterclockwise"></i></button>
          <button class="btn btn-success" id="receiptListPrint"><i class="bi bi-printer"></i></button>
        </div>
      </div>

      <div class="list-body" id="receiptListBody">
        <div class="text-center py-5"><div class="spinner-border text-primary"></div></div>
      </div>

      <div class="list-footer">
        <button class="btn btn-sm btn-outline-primary" id="receiptListPrev"><i class="bi bi-chevron-right"></i> قبلی</button>
        <span class="small text-muted" id="receiptListPager">—</span>
        <button class="btn btn-sm btn-outline-primary" id="receiptListNext">بعدی <i class="bi bi-chevron-left"></i></button>
      </div>
    </div>
  `;
  document.body.appendChild(div);
}

function bindEvents() {
  const wrap = document.getElementById('receiptListWrap');
  wrap.querySelector('#receiptListClose').onclick = () => {
    wrap.classList.remove('active');
    document.body.style.overflow = '';
  };
  wrap.querySelector('#receiptListFilter').onclick = () => {
    state.query = wrap.querySelector('#receiptListQ').value.trim();
    state.page = 1;
    loadRows();
  };
  wrap.querySelector('#receiptListClear').onclick = () => {
    wrap.querySelector('#receiptListQ').value = '';
    state.query = '';
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
}

async function loadRows() {
  const body = document.getElementById('receiptListBody');
  body.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

  try {
    let q = sb.from('drugs_receipt')
      .select('*', { count: 'exact' })
      .order('id', { ascending: false });

    if (state.query) {
      q = q.or(`receipt_number.ilike.%${state.query}%,supplier_name.ilike.%${state.query}%`);
    }

    const from = (state.page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error, count } = await q.range(from, to);
    if (error) throw error;

    state.rows = data || [];
    state.total = count || 0;
    renderRows();
  } catch (e) {
    console.error(e);
    body.innerHTML = `<div class="alert alert-danger">خطا در بارگذاری: ${escapeHtml(e.message)}</div>`;
  }
}

function renderRows() {
  const body = document.getElementById('receiptListBody');
  if (!state.rows.length) {
    body.innerHTML = '<div class="text-center py-5 text-muted">رسیدی یافت نشد</div>';
    return;
  }

  body.innerHTML = state.rows.map(r => {
    const isDraft = r.status === 'draft';
    const isFinal = r.status === 'final';
    
    return `
      <div class="list-row">
        <div class="list-row-head">
          <span class="fw-bold text-primary">${escapeHtml(r.receipt_number || '-')}</span>
          <span class="badge ${isFinal ? 'bg-success' : 'bg-warning text-dark'}">
            ${isFinal ? 'نهایی' : 'پیش‌نویس'}
          </span>
        </div>
        <div class="list-row-body">
          <div class="small"><i class="bi bi-truck text-muted"></i> ${escapeHtml(r.supplier_name || '-')}</div>
          <div class="small text-muted mt-1"><i class="bi bi-calendar3"></i> ${gregorianToJalali(r.date_received)}</div>
          
          <div class="mt-3 d-flex gap-2">
            ${isDraft ? `
              <button class="btn btn-sm btn-outline-danger flex-grow-1" data-delete="${r.id}"><i class="bi bi-trash"></i> حذف</button>
              <button class="btn btn-sm btn-success flex-grow-1" data-finalize="${r.id}"><i class="bi bi-check2-circle"></i> نهایی کردن</button>
            ` : `
              <button class="btn btn-sm btn-outline-secondary flex-grow-1" disabled><i class="bi bi-lock"></i> قفل شده</button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // دکمه حذف
  body.querySelectorAll('[data-delete]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('آیا مطمئنید؟ این پیش‌نویس حذف خواهد شد.')) return;
      const id = btn.dataset.delete;
      btn.disabled = true;
      try {
        await sb.from('drugs_receiptitem').delete().eq('receipt_id', id);
        await sb.from('drugs_receipt').delete().eq('id', id);
        toast('پیش‌نویس حذف شد', 'success');
        loadRows();
      } catch (e) {
        toast(e.message, 'danger');
        btn.disabled = false;
      }
    };
  });

  // دکمه نهایی کردن (از داخل لیست)
  body.querySelectorAll('[data-finalize]').forEach(btn => {
    btn.onclick = async () => {
      // دابل چک
      if (!confirm('آیا از نهایی کردن این رسید اطمینان دارید؟')) return;
      if (!confirm('با این کار موجودی انبار افزایش می‌یابد. ادامه می‌دهید؟')) return;
      
      const id = btn.dataset.finalize;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

      try {
        // ۱. گرفتن اقلام
        const { data: items, error: e1 } = await sb.from('drugs_receiptitem').select('*').eq('receipt_id', id);
        if (e1) throw e1;
        if (!items?.length) throw new Error('هیچ قلمی ثبت نشده است');

        const row = state.rows.find(x => x.id == id);
        const supplierId = row.supplier_id || null;

        // ۲. تغییر وضعیت
        await sb.from('drugs_receipt').update({ status: 'final' }).eq('id', id);

        // ۳. اعمال روی انبار
        for (let it of items) {
          const { data: existing } = await sb.from('drugs_drugbatch')
            .select('id, quantity').eq('drug_id', it.drug_id).eq('batch_number', it.batch_number).maybeSingle();

          if (existing) {
            await sb.from('drugs_drugbatch').update({ quantity: existing.quantity + it.received_quantity }).eq('id', existing.id);
          } else {
            await sb.from('drugs_drugbatch').insert({
              drug_id: it.drug_id,
              batch_number: it.batch_number,
              expiry_date: it.expiry_date,
              quantity: it.received_quantity,
              supplier_id: supplierId,
              purchase_price: 0,
              is_active: true,
              is_temporary: false
            });
          }
          await sb.rpc('allocate_to_requests', { p_drug_id: it.drug_id, p_quantity: it.received_quantity, p_force_close: false });
        }

        toast('✅ رسید نهایی و موجودی اعمال شد', 'success');
        loadRows();
      } catch (err) {
        alert('❌ خطا: ' + err.message);
        btn.disabled = false;
      }
    };
  });
}

function printReceiptList() {
  if (!state.rows.length) return toast('لیست خالی است', 'warning');
  printA4({
    title: 'لیست رسیدهای دریافت',
    columns: [
      { label: '#', formatter: (r, i) => faNum(i + 1) },
      { label: 'شماره', key: 'receipt_number' },
      { label: 'تأمین‌کننده', key: 'supplier_name' },
      { label: 'تاریخ', formatter: r => gregorianToJalali(r.date_received) },
      { label: 'وضعیت', formatter: r => r.status === 'final' ? 'نهایی' : 'پیش‌نویس' }
    ],
    rows: state.rows,
    signatures: ['مدیر انبار']
  });
}
