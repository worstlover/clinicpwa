// js/modules/receipt-list.js
import { sb } from '../sb.js';
import { $, faNum, escapeHtml, gregorianToJalali, jalaliToGregorian, toast } from '../utils.js';
import { printA4 } from './list-print.js';
import { currentUser, isAdmin } from '../auth.js'; 

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

// ⭐ تابع بررسی سطح دسترسی برای ویرایش/حذف رسیدهای نهایی
function canManageFinalized() {
  if (isAdmin) return true;
  const role = currentUser?.user_metadata?.role || currentUser?.user_metadata?.user_role || '';
  return role === 'supervisor' || role === 'manager' || role === 'admin';
}

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

  const canManage = canManageFinalized();

  body.innerHTML = state.rows.map(r => {
    // ⭐ بررسی دقیق‌تر وضعیت برای نمایش دکمه‌ها
    const isDraft = !r.status || r.status === 'draft' || r.status === 'pending';
    const isFinal = r.status === 'final';
    const isVoid = r.status === 'void' || r.status === 'canceled';

    let badgeCls = 'bg-secondary';
    let badgeText = r.status || 'نامشخص';
    if (isFinal) { badgeCls = 'bg-success'; badgeText = 'نهایی'; }
    else if (isDraft) { badgeCls = 'bg-warning text-dark'; badgeText = 'پیش‌نویس'; }
    else if (isVoid) { badgeCls = 'bg-danger'; badgeText = 'باطل شده'; }

    // ساخت دکمه‌ها بر اساس وضعیت و دسترسی
    let actionButtons = '';

    if (isDraft) {
      // دکمه‌های پیش‌نویس (حذف کاملاً واضح با رنگ قرمز)
      actionButtons = `
        <div class="d-flex gap-2 w-100 mt-2">
          <button class="btn btn-sm btn-danger flex-grow-1" data-delete-draft="${r.id}"><i class="bi bi-trash"></i> حذف پیش‌نویس</button>
          <button class="btn btn-sm btn-success flex-grow-1" data-finalize="${r.id}"><i class="bi bi-check2-circle"></i> نهایی کردن</button>
        </div>
      `;
    } else if (isFinal) {
      if (canManage) {
        // دکمه‌های نهایی (ویرایش و حذف کامل)
        actionButtons = `
          <div class="d-flex flex-column gap-2 w-100 mt-2">
            <button class="btn btn-sm btn-outline-warning w-100" data-edit-final="${r.id}"><i class="bi bi-pencil"></i> ویرایش (برگشت به پیش‌نویس)</button>
            <button class="btn btn-sm btn-outline-danger w-100" data-delete-final="${r.id}"><i class="bi bi-trash"></i> حذف کامل (کسر از انبار)</button>
          </div>
        `;
      } else {
        actionButtons = `<button class="btn btn-sm btn-outline-secondary w-100 mt-2" disabled><i class="bi bi-lock"></i> قفل شده (نیاز به دسترسی مدیر)</button>`;
      }
    } else if (isVoid) {
      actionButtons = `<button class="btn btn-sm btn-outline-secondary w-100 mt-2" disabled><i class="bi bi-x-circle"></i> باطل شده</button>`;
    }

    return `
      <div class="list-row">
        <div class="list-row-head">
          <span class="fw-bold text-primary">${escapeHtml(r.receipt_number || '-')}</span>
          <span class="badge ${badgeCls}">${badgeText}</span>
        </div>
        <div class="list-row-body">
          <div class="small"><i class="bi bi-truck text-muted"></i> ${escapeHtml(r.supplier_name || '-')}</div>
          <div class="small text-muted mt-1"><i class="bi bi-calendar3"></i> ${gregorianToJalali(r.date_received)}</div>
          
          ${actionButtons}
        </div>
      </div>
    `;
  }).join('');

  bindRowEvents(body);
}

function bindRowEvents(body) {
  // ۱. حذف پیش‌نویس
  body.querySelectorAll('[data-delete-draft]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('آیا مطمئنید؟ این پیش‌نویس حذف خواهد شد.')) return;
      const id = btn.dataset.deleteDraft;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
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

  // ۲. نهایی کردن پیش‌نویس
  body.querySelectorAll('[data-finalize]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('آیا از نهایی کردن این رسید اطمینان دارید؟')) return;
      if (!confirm('با این کار موجودی انبار افزایش می‌یابد. ادامه می‌دهید؟')) return;
      
      const id = btn.dataset.finalize;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

      try {
        const { data: items, error: e1 } = await sb.from('drugs_receiptitem').select('*').eq('receipt_id', id);
        if (e1) throw e1;
        if (!items?.length) throw new Error('هیچ قلمی ثبت نشده است');

        const row = state.rows.find(x => x.id == id);
        const supplierId = row.supplier_id || null;

        await sb.from('drugs_receipt').update({ status: 'final' }).eq('id', id);

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

  // ۳. ویرایش نهایی شده (برگشت به پیش‌نویس با کسر موجودی)
  body.querySelectorAll('[data-edit-final]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.editFinal;
      if (!confirm('⚠️ با ویرایش این رسید نهایی، موجودی انبار به حالت قبل برمی‌گردد و سند به پیش‌نویس تبدیل می‌شود. ادامه می‌دهید؟')) return;
      
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

      try {
        const { data: items } = await sb.from('drugs_receiptitem').select('*').eq('receipt_id', id);
        
        // کسر موجودی
        for (let it of items) {
          const { data: batch } = await sb.from('drugs_drugbatch')
            .select('id, quantity').eq('drug_id', it.drug_id).eq('batch_number', it.batch_number).maybeSingle();
          if (batch) {
            const newQty = Math.max(0, batch.quantity - it.received_quantity);
            await sb.from('drugs_drugbatch').update({ quantity: newQty }).eq('id', batch.id);
          }
        }

        // تغییر وضعیت به پیش‌نویس
        await sb.from('drugs_receipt').update({ status: 'draft' }).eq('id', id);
        toast('✅ سند به پیش‌نویس تبدیل شد. موجودی کسر گردید.', 'success');
        
        // بستن لیست و رفتن به فرم دریافت
        document.getElementById('receiptListWrap').classList.remove('active');
        document.body.style.overflow = '';
        const { openReceive } = await import('./receive.js');
        openReceive(id);

      } catch (err) {
        alert('❌ خطا: ' + err.message);
        btn.disabled = false;
      }
    };
  });

  // ⭐ ۴. حذف کامل نهایی شده (کسر موجودی + پاک کردن از دیتابیس)
  body.querySelectorAll('[data-delete-final]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.deleteFinal;
      if (!confirm('⚠️ هشدار جدی: با حذف این سند نهایی، موجودی انبار کسر شده و سند برای همیشه پاک می‌شود. آیا مطمئنید؟')) return;
      if (!confirm('آیا از حذف کامل و کسر موجودی ۱۰۰٪ مطمئن هستید؟')) return;
      
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال حذف...';

      try {
        const { data: items } = await sb.from('drugs_receiptitem').select('*').eq('receipt_id', id);
        
        // ۱. کسر موجودی
        for (let it of items) {
          const { data: batch } = await sb.from('drugs_drugbatch')
            .select('id, quantity').eq('drug_id', it.drug_id).eq('batch_number', it.batch_number).maybeSingle();
          if (batch) {
            const newQty = Math.max(0, batch.quantity - it.received_quantity);
            await sb.from('drugs_drugbatch').update({ quantity: newQty }).eq('id', batch.id);
          }
        }

        // ۲. پاک کردن کامل از دیتابیس
        await sb.from('drugs_receiptitem').delete().eq('receipt_id', id);
        await sb.from('drugs_receipt').delete().eq('id', id);
        
        toast('🗑️ سند نهایی حذف شد و موجودی کسر گردید', 'success');
        loadRows();

      } catch (err) {
        alert('❌ خطا: ' + err.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-trash"></i> حذف کامل (کسر از انبار)';
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
      { label: 'وضعیت', formatter: r => {
          if (r.status === 'final') return 'نهایی';
          if (r.status === 'draft') return 'پیش‌نویس';
          if (r.status === 'void') return 'باطل شده';
          return r.status;
        } 
      }
    ],
    rows: state.rows,
    signatures: ['مدیر انبار']
  });
           }
