// js/modules/receipt-list.js
import { sb } from '../sb.js';
import { $, faNum, escapeHtml, gregorianToJalali, jalaliToGregorian, toast } from '../utils.js';
import { printA4 } from './list-print.js';
import { currentUser, isAdmin } from '../auth.js'; // ⭐ isAdmin را ایمپورت کردیم

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
  // چک کردن نقش سوپروایزر از متادیتای کاربر
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
    const isDraft = r.status === 'draft';
    const isFinal = r.status === 'final';
    const isVoid = r.status === 'void';

    let badgeCls = 'bg-secondary';
    let badgeText = r.status;
    if (isFinal) { badgeCls = 'bg-success'; badgeText = 'نهایی'; }
    else if (isDraft) { badgeCls = 'bg-warning text-dark'; badgeText = 'پیش‌نویس'; }
    else if (isVoid) { badgeCls = 'bg-danger'; badgeText = 'باطل شده'; }

    // ساخت دکمه‌ها بر اساس وضعیت و دسترسی
    let actionButtons = '';

    if (isDraft) {
      actionButtons = `
        <button class="btn btn-sm btn-outline-danger flex-grow-1" data-delete="${r.id}"><i class="bi bi-trash"></i> حذف</button>
        <button class="btn btn-sm btn-success flex-grow-1" data-finalize="${r.id}"><i class="bi bi-check2-circle"></i> نهایی کردن</button>
      `;
    } else if (isFinal) {
      if (canManage) {
        actionButtons = `
          <button class="btn btn-sm btn-outline-warning flex-grow-1" data-edit-final="${r.id}"><i class="bi bi-pencil"></i> ویرایش (برگشت به پیش‌نویس)</button>
          <button class="btn btn-sm btn-outline-danger flex-grow-1" data-void-final="${r.id}"><i class="bi bi-x-octagon"></i> ابطال سند</button>
        `;
      } else {
        actionButtons = `<button class="btn btn-sm btn-outline-secondary flex-grow-1" disabled><i class="bi bi-lock"></i> قفل شده</button>`;
      }
    } else if (isVoid) {
      actionButtons = `<button class="btn btn-sm btn-outline-secondary flex-grow-1" disabled><i class="bi bi-x-circle"></i> باطل شده</button>`;
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
          
          <div class="mt-3 d-flex gap-2 flex-wrap">
            ${actionButtons}
          </div>
        </div>
      </div>
    `;
  }).join('');

  bindRowEvents(body);
}

function bindRowEvents(body) {
  // حذف پیش‌نویس
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

  // نهایی کردن پیش‌نویس
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

  // ⭐ ویرایش نهایی شده (برگشت به پیش‌نویس با کسر موجودی)
  body.querySelectorAll('[data-edit-final]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.editFinal;
      if (!confirm('⚠️ با ویرایش این رسید نهایی، موجودی انبار به حالت قبل برمی‌گردد و سند به پیش‌نویس تبدیل می‌شود. ادامه می‌دهید؟')) return;
      
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

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

        // ۲. تغییر وضعیت به پیش‌نویس
        await sb.from('drugs_receipt').update({ status: 'draft' }).eq('id', id);
        toast('✅ سند به پیش‌نویس تبدیل شد. موجودی کسر گردید.', 'success');
        
        // ۳. بستن لیست و رفتن به فرم دریافت
        document.getElementById('receiptListWrap').classList.remove('active');
        document.body.style.overflow = '';
        const { openReceive } = await import('./receive.js');
        openReceive(id); // پاس دادن آیدی برای لود در فرم

      } catch (err) {
        alert('❌ خطا: ' + err.message);
        btn.disabled = false;
      }
    };
  });

  // ⭐ ابطال نهایی شده (کسر موجودی و تغییر وضعیت به void)
  body.querySelectorAll('[data-void-final]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.voidFinal;
      if (!confirm('⚠️ هشدار جدی: با ابطال این سند، موجودی اقلام آن از انبار کسر می‌شود و سند برای همیشه باطل می‌گردد. آیا مطمئنید؟')) return;
      if (!confirm('آیا از کسر موجودی و ابطال سند ۱۰۰٪ مطمئن هستید؟')) return;
      
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

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

        // ۲. تغییر وضعیت به باطل شده (void)
        await sb.from('drugs_receipt').update({ status: 'void' }).eq('id', id);
        toast('🗑️ سند باطل شد و موجودی کسر گردید', 'success');
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
