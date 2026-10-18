// js/modules/inventory.js
import { sb } from '../sb.js';
import {
  $, faNum, escapeHtml, gregorianToJalali, parseGS1, cleanGTIN,
  toast, beep, makeBatchNumber
} from '../utils.js';
import { showScreen } from '../ui.js';
import { openScanner } from '../scanner.js';
import { askQty, openDrugSearch, promptExpirySelection } from '../modals.js';
import { isAdmin, currentUser } from '../auth.js';
import { printA4 } from './list-print.js';

const state = { 
  session: null, 
  currentStep: 1,
  items: [],
  reportData: null,
  pendingDiscrepancies: [] // برای گام ۷
};

const AUTOSAVE_KEY = 'inv_autosave_data';

const getUserName = () => {
  if (!currentUser) return 'نامشخص';
  if (currentUser.user_metadata?.display_name) return currentUser.user_metadata.display_name;
  if (currentUser.user_metadata?.name) return currentUser.user_metadata.name;
  if (currentUser.email) return currentUser.email.split('@')[0]; 
  return 'نامشخص';
};

export function openInventory(sessionId = null) {
  showScreen('Inventory');
  if (sessionId) {
    localStorage.setItem('inv_session_id', sessionId);
    state.session = null;
  }
  if (state.session) { renderStep(); return; }
  if (sessionId) { continueSession(); return; }
  initSession();
}

async function initSession() {
  const savedData = localStorage.getItem(AUTOSAVE_KEY);
  if (savedData) {
    try {
      const parsed = JSON.parse(savedData);
      if (Date.now() - parsed.timestamp < 24 * 3600 * 1000) { // کمتر از ۲۴ ساعت
        if (confirm('یک ذخیره موقت از انبارگردانی قبلی پیدا شد. بازیابی شود؟')) {
          state.items = parsed.items || [];
          state.currentStep = parsed.step || 5;
          if (parsed.session) {
            state.session = parsed.session;
            renderStep();
            return;
          }
        }
      }
    } catch(e) {}
  }

  const id = localStorage.getItem('inv_session_id');
  if (id) {
    const { data } = await sb.from('inv_sessions').select('*').eq('id', id).maybeSingle();
    if (data && !['completed', 'applied'].includes(data.status)) {
      state.session = data;
      state.currentStep = data.step || 1;
      loadSessionItems();
      return;
    }
  }
  
  state.session = null;
  state.currentStep = 1;
  state.items = [];
  renderStep();
}

async function continueSession() {
  const id = localStorage.getItem('inv_session_id');
  if (!id) { toast('جلسه‌ای وجود ندارد', 'warning'); return; }
  const { data } = await sb.from('inv_sessions').select('*').eq('id', id).maybeSingle();
  if (!data) { toast('یافت نشد', 'danger'); return; }
  if (['completed', 'applied'].includes(data.status)) { toast('این سند بسته شده است', 'warning'); return; }
  state.session = data;
  state.currentStep = data.step || 1;
  loadSessionItems();
}

async function loadSessionItems() {
  const { data } = await sb.from('inv_count_items').select('*').eq('session_id', state.session.id);
  state.items = (data || []).map(i => ({
    drug_id: i.drug_id, drug_name: i.drug_name, drug_form: i.drug_form || '',
    batch_number: i.batch_number, expiry_date: i.expiry_date,
    counted_quantity: i.counted_quantity, barcode: i.barcode,
    counted_by_email: i.counted_by_email, counted_by_name: i.counted_by_name || 'نامشخص'
  }));
  renderStep();
}

async function saveStep(step) {
  if (!state.session) {
    const title = `انبارگردانی ${new Date().toLocaleDateString('fa-IR')}`;
    const { data: code } = await sb.rpc('gen_inv_code');
    const { data, error } = await sb.from('inv_sessions').insert({ 
      code, title, status: 'in_progress', step,
      created_by_email: currentUser?.email || null, created_by_name: getUserName()
    }).select().single();
    if (error) { toast(error.message, 'danger'); return false; }
    state.session = data;
    localStorage.setItem('inv_session_id', data.id);
  } else {
    await sb.from('inv_sessions').update({ step }).eq('id', state.session.id);
  }
  state.currentStep = step;
  renderStep();
  return true;
}

// ═══════════════════════════════════════════════════════════
// ذخیره خودکار هر ۵ ثانیه
// ═══════════════════════════════════════════════════════════
setInterval(() => {
  if (state.currentStep >= 5 && state.currentStep <= 7 && state.items.length > 0) {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
      items: state.items,
      step: state.currentStep,
      session: state.session,
      timestamp: Date.now()
    }));
  }
}, 5000);

// ═══════════════════════════════════════════════════════════
// توابع کمکی (CSV و غیره)
// ═══════════════════════════════════════════════════════════
function downloadCSV(data, filename) {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  let csvContent = "\uFEFF"; // BOM برای نمایش صحیح فارسی در اکسل
  
  csvContent += headers.join(",") + "\n";
  data.forEach(row => {
    const values = headers.map(header => {
      let val = row[header] === null || row[header] === undefined ? '' : String(row[header]);
      return `"${val.replace(/"/g, '""')}"`;
    });
    csvContent += values.join(",") + "\n";
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ═══════════════════════════════════════════════════════════
// راهنمای گام‌ها (Router)
// ═══════════════════════════════════════════════════════════
function renderStep() {
  const c = $('invContent');
  if (!c) return;
  
  const steps = [
    { id: 1, title: 'دریافتی‌ها ۱', icon: 'bi-file-earmark-text' },
    { id: 2, title: 'ویزیت‌ها', icon: 'bi-person-lines-fill' },
    { id: 3, title: 'دریافتی‌ها ۲', icon: 'bi-file-earmark-check' },
    { id: 4, title: 'داروهای منقضی', icon: 'bi-trash3' },
    { id: 5, title: 'شمارش فیزیکی', icon: 'bi-upc-scan' },
    { id: 6, title: 'مغایرت‌گیری', icon: 'bi-exclamation-triangle' },
    { id: 7, title: 'شمارش مغایر', icon: 'bi-arrow-repeat' },
    { id: 8, title: 'تصویب نهایی', icon: 'bi-file-earmark-check' },
  ];

  c.innerHTML = `
    <div class="card mb-3">
      <div class="card-body py-2 d-flex justify-content-between align-items-center" style="overflow-x:auto;">
        ${steps.map(s => `
          <div class="text-center mx-2" style="opacity:${state.currentStep === s.id ? '1' : '0.5'}; min-width:60px;">
            <div class="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-1" 
                 style="width:36px;height:36px;background:${state.currentStep === s.id ? 'var(--primary)' : '#e2e8f0'}; color:${state.currentStep === s.id ? '#fff' : '#64748b'};">
              <i class="bi ${s.icon}"></i>
            </div>
            <div style="font-size:0.65rem; font-weight:${state.currentStep === s.id ? 'bold' : 'normal'};">${s.title}</div>
          </div>
        `).join('')}
      </div>
    </div>
    <div id="stepContent"></div>
  `;

  if (state.currentStep === 1) renderStep1_Receipts();
  else if (state.currentStep === 2) renderStep2_Visits();
  else if (state.currentStep === 3) renderStep3_ReceiptsAgain();
  else if (state.currentStep === 4) renderStep4_Expired();
  else if (state.currentStep === 5) renderStep5_Scan();
  else if (state.currentStep === 6) renderStep6_Discrepancies();
  else if (state.currentStep === 7) renderStep7_Recount();
  else if (state.currentStep === 8) renderStep8_Report();
}

// ═══════════════════════════════════════════════════════════
// گام ۱ و ۳: سندهای دریافتی
// ═══════════════════════════════════════════════════════════
async function renderStep1_Receipts() {
  const c = $('stepContent');
  c.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
  
  const { data: drafts } = await sb.from('drugs_receipt').select('id, receipt_number, supplier_name').eq('status', 'draft');

  if (!drafts || drafts.length === 0) {
    c.innerHTML = `<div class="alert alert-success text-center"><i class="bi bi-check-circle-fill"></i> هیچ سند دریافت پیش‌نویسی وجود ندارد.</div>
      <button class="btn btn-primary w-100 py-3" id="btnNext">تایید و گام بعدی <i class="bi bi-arrow-left"></i></button>`;
    $('btnNext').onclick = () => saveStep(2);
    return;
  }

  c.innerHTML = `
    <div class="alert alert-warning small">
      <i class="bi bi-exclamation-triangle"></i> شما ${faNum(drafts.length)} سند دریافت پیش‌نویس دارید. لطفا در صفحه دریافت آن‌ها را نهایی یا حذف کنید.
    </div>
    <button class="btn btn-outline-warning w-100 mb-3" id="btnGoReceive"><i class="bi bi-truck"></i> رفتن به صفحه دریافت دارو</button>
    <button class="btn btn-primary w-100 py-3" id="btnNext">بررسی مجدد و گام بعدی <i class="bi bi-arrow-left"></i></button>
  `;
  $('btnGoReceive').onclick = () => { document.getElementById('invContent').innerHTML = ''; import('./receive.js').then(m => m.openReceive()); };
  $('btnNext').onclick = () => renderStep1_Receipts();
}

async function renderStep3_ReceiptsAgain() {
  const c = $('stepContent');
  c.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
  
  const { data: drafts } = await sb.from('drugs_receipt').select('id').eq('status', 'draft');

  if (!drafts || drafts.length === 0) {
    c.innerHTML = `<div class="alert alert-success text-center"><i class="bi bi-check-circle-fill"></i> تایید شد. هیچ سند دریافتی جدیدی وجود ندارد.</div>
      <button class="btn btn-primary w-100 py-3" id="btnNext">گام بعدی <i class="bi bi-arrow-left"></i></button>`;
    $('btnNext').onclick = () => saveStep(4);
    return;
  }

  c.innerHTML = `
    <div class="alert alert-danger small">
      <i class="bi bi-exclamation-triangle-fill"></i> هنوز ${faNum(drafts.length)} سند دریافت پیش‌نویس دارید! لطفا آن‌ها را تعیین تکلیف کنید.
    </div>
    <button class="btn btn-danger w-100 mb-3" id="btnGoReceive"><i class="bi bi-truck"></i> رفتن به صفحه دریافت دارو</button>
    <button class="btn btn-primary w-100 py-3" id="btnNext">بررسی مجدد <i class="bi bi-arrow-left"></i></button>
  `;
  $('btnGoReceive').onclick = () => { document.getElementById('invContent').innerHTML = ''; import('./receive.js').then(m => m.openReceive()); };
  $('btnNext').onclick = () => renderStep3_ReceiptsAgain();
}

// ═══════════════════════════════════════════════════════════
// گام ۲: تکمیل گروهی ویزیت‌ها
// ═══════════════════════════════════════════════════════════
async function renderStep2_Visits() {
  const c = $('stepContent');
  c.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
  
  const { data: visits } = await sb.from('visits_visit')
    .select('id, patient:core_patient(first_name, last_name), visit_date')
    .neq('status', 'completed');

  if (!visits || visits.length === 0) {
    c.innerHTML = `<div class="alert alert-success text-center"><i class="bi bi-check-circle-fill"></i> هیچ ویزیت ناقصی وجود ندارد.</div>
      <button class="btn btn-primary w-100 py-3" id="btnNext">گام بعدی <i class="bi bi-arrow-left"></i></button>`;
    $('btnNext').onclick = () => saveStep(3);
    return;
  }

  c.innerHTML = `
    <div class="alert alert-warning small">
      <i class="bi bi-exclamation-triangle"></i> شما ${faNum(visits.length)} ویزیت تکمیل‌نشده دارید.
    </div>
    <div class="d-flex gap-2 mb-3">
      <button class="btn btn-danger flex-grow-1" id="btnBulkComplete"><i class="bi bi-check-all"></i> تکمیل یکجای همه</button>
      <button class="btn btn-outline-success" id="btnExportVisits"><i class="bi bi-file-earmark-excel"></i> اکسل</button>
    </div>
    <div class="d-flex flex-column gap-2 mb-3" style="max-height:300px; overflow-y:auto;">
      ${visits.map(v => {
        const pName = `${v.patient?.first_name || ''} ${v.patient?.last_name || ''}`.trim() || 'بیمار';
        return `<div class="card p-2 d-flex justify-content-between align-items-center small">
            <span>${escapeHtml(pName)} (${gregorianToJalali(v.visit_date)})</span>
          </div>`;
      }).join('')}
    </div>
    <button class="btn btn-primary w-100 py-3" id="btnNext">بررسی مجدد و گام بعدی <i class="bi bi-arrow-left"></i></button>
  `;

  $('btnExportVisits').onclick = () => {
    const csvData = visits.map(v => ({
      'بیمار': `${v.patient?.first_name || ''} ${v.patient?.last_name || ''}`.trim(),
      'تاریخ ویزیت': gregorianToJalali(v.visit_date),
      'شناسه': v.id
    }));
    downloadCSV(csvData, 'visits_pending.csv');
  };

  $('btnBulkComplete').onclick = async () => {
    if (!confirm('تمام ویزیت‌های ناقص تکمیل شوند؟ (در صورت کمبود موجودی سالم، از داروهای منقضی کسر می‌شود)')) return;
    const btn = $('btnBulkComplete');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال پردازش...';

    let successCount = 0;
    for (let v of visits) {
      const { data: items } = await sb.from('visits_visititem').select('drug_id, quantity').eq('visit_id', v.id);
      if (items) {
        for (let it of items) {
          // تلاش برای کسر عادی
          const { error } = await sb.rpc('deduct_stock_fifo', { p_drug_id: it.drug_id, p_quantity: it.quantity });
          // اگر خطا داد (موجودی کافی نبود)، از داروهای منقضی کسر میکنیم
          if (error) {
            const { data: expiredBatches } = await sb.from('drugs_drugbatch').select('id, quantity').eq('drug_id', it.drug_id).lt('expiry_date', new Date().toISOString().slice(0, 10)).gt('quantity', 0);
            let remQty = it.quantity;
            for (let eb of (expiredBatches || [])) {
              if (remQty <= 0) break;
              const deduct = Math.min(eb.quantity, remQty);
              await sb.from('drugs_drugbatch').update({ quantity: eb.quantity - deduct }).eq('id', eb.id);
              remQty -= deduct;
            }
          }
        }
      }
      await sb.from('visits_visit').update({ status: 'completed', completed_at: new Date().toISOString(), completed_by_id: currentUser?.id }).eq('id', v.id);
      successCount++;
    }
    toast(`${faNum(successCount)} ویزیت تکمیل شد`, 'success');
    renderStep2_Visits();
  };
  $('btnNext').onclick = () => saveStep(3);
}

// ═══════════════════════════════════════════════════════════
// گام ۴: خروج گروهی داروهای منقضی
// ═══════════════════════════════════════════════════════════
async function renderStep4_Expired() {
  const c = $('stepContent');
  c.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
  
  const today = new Date().toISOString().slice(0, 10);
  const { data: expired } = await sb.from('drugs_drugbatch')
    .select('id, batch_number, expiry_date, quantity, drug:drugs_drug(name)')
    .lt('expiry_date', today).gt('quantity', 0);

  if (!expired || expired.length === 0) {
    c.innerHTML = `<div class="alert alert-success text-center"><i class="bi bi-check-circle-fill"></i> هیچ داروی منقضی وجود ندارد.</div>
      <button class="btn btn-primary w-100 py-3" id="btnNext">گام بعدی <i class="bi bi-arrow-left"></i></button>`;
    $('btnNext').onclick = () => saveStep(5);
    return;
  }

  c.innerHTML = `
    <div class="alert alert-warning small">
      <i class="bi bi-exclamation-triangle"></i> شما ${faNum(expired.length)} بچ منقضی دارید. با یک کلیک همه را دور بریزید.
    </div>
    <div class="d-flex gap-2 mb-3">
      <button class="btn btn-danger flex-grow-1" id="btnBulkDispose"><i class="bi bi-trash"></i> خروج یکجای همه</button>
      <button class="btn btn-outline-success" id="btnExportExp"><i class="bi bi-file-earmark-excel"></i> اکسل</button>
    </div>
    <div class="d-flex flex-column gap-2 mb-3" style="max-height:300px; overflow-y:auto;">
      ${expired.map(e => `<div class="card p-2 d-flex justify-content-between align-items-center small">
          <span>${escapeHtml(e.drug?.name || '—')} (${escapeHtml(e.batch_number)})</span>
          <span class="badge bg-danger">${faNum(e.quantity)}</span>
        </div>`).join('')}
    </div>
    <button class="btn btn-primary w-100 py-3" id="btnNext">گام بعدی <i class="bi bi-arrow-left"></i></button>
  `;

  $('btnExportExp').onclick = () => {
    const csvData = expired.map(e => ({
      'نام دارو': e.drug?.name || '',
      'شماره بچ': e.batch_number,
      'تعداد': e.quantity,
      'تاریخ انقضا': e.expiry_date
    }));
    downloadCSV(csvData, 'expired_drugs.csv');
  };

  $('btnBulkDispose').onclick = async () => {
    if (!confirm('آیا از خروج تمام این داروها مطمئنید؟')) return;
    const btn = $('btnBulkDispose');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ثبت...';
    
    const { data: order } = await sb.from('disposal_orders').insert({ code: `DSP-${Date.now()}`, created_by_email: currentUser?.email }).select().single();
    if (order) {
      for (let e of expired) {
        await sb.from('disposal_items').insert({
          order_id: order.id, drug_id: e.drug.id, drug_name: e.drug.name,
          batch_number: e.batch_number, expiry_date: e.expiry_date, quantity: e.quantity
        });
        await sb.from('drugs_drugbatch').update({ quantity: 0 }).eq('id', e.id);
      }
      toast('همه داروهای منقضی خارج شدند', 'success');
      renderStep4_Expired();
    } else {
      toast('خطا در ثبت خروج', 'danger');
      btn.disabled = false;
    }
  };
  $('btnNext').onclick = () => saveStep(5);
}

// ═══════════════════════════════════════════════════════════
// گام ۵: شمارش فیزیکی
// ═══════════════════════════════════════════════════════════
function renderStep5_Scan() {
  $('stepContent').innerHTML = `
    <div class="alert alert-info small"><i class="bi bi-info-circle"></i> با اسکن بارکد، اقلام را بشمارید. (ذخیره خودکار هر ۵ ثانیه)</div>
    <div class="row g-2 mb-3">
      <div class="col-6"><button class="btn btn-primary w-100 py-3" id="btnInvScan"><i class="bi bi-upc-scan"></i> اسکن</button></div>
      <div class="col-6"><button class="btn btn-outline-primary w-100 py-3" id="btnInvSearch"><i class="bi bi-search"></i> جستجو</button></div>
    </div>
    <div class="d-flex justify-content-between mb-2">
      <span class="fw-bold">اقلام شمارش شده:</span>
      <span class="badge bg-success">${faNum(state.items.length)} قلم</span>
    </div>
    <div id="invList" style="max-height:350px; overflow-y:auto;"></div>
    <button class="btn btn-warning btn-lg w-100 py-3 mt-3" id="btnInvFinish">پایان شمارش و بررسی مغایرت</button>
  `;
  $('btnInvScan').onclick = () => openScanner(handleBarcode);
  $('btnInvSearch').onclick = () => openDrugSearch('دارو را جستجو کنید', d => addDrug(d));
  $('btnInvFinish').onclick = () => {
    if (!state.items.length) { toast('قلمی ثبت نشده', 'warning'); return; }
    if (confirm('پایان شمارش؟')) saveStep(6);
  };
  renderList('invList');
}

function renderList(containerId) {
  const list = $(containerId);
  if (!list) return;
  if (!state.items.length) {
    list.innerHTML = '<div class="card text-center py-4 muted">هنوز قلمی اضافه نشده</div>';
    return;
  }
  list.innerHTML = state.items.slice().reverse().map((it, idx) => {
    const realIdx = state.items.length - 1 - idx;
    return `
      <div class="item-card">
        <div class="d-flex justify-content-between align-items-center">
          <div class="flex-grow-1" data-edit="${realIdx}" style="cursor:pointer;">
            <div class="name">${escapeHtml(it.drug_name)} <i class="bi bi-pencil-square text-primary" style="font-size:0.85rem;"></i></div>
            <div class="meta">
              ${it.batch_number ? `بچ: <code dir="ltr">${escapeHtml(it.batch_number)}</code><br>` : ''}
              انقضا: ${escapeHtml(it.expiry_date)}
              <span class="badge bg-light text-dark border ms-2" style="font-size:0.7rem;">${escapeHtml(it.counted_by_name || 'نامشخص')}</span>
            </div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <div class="qty-display">${faNum(it.counted_quantity)}</div>
            <button class="num-btn text-danger" data-remove="${realIdx}"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      </div>`;
  }).join('');
  list.querySelectorAll('[data-remove]').forEach(b => {
    b.onclick = (e) => { e.stopPropagation(); removeItem(+b.dataset.remove, containerId); };
  });
  list.querySelectorAll('[data-edit]').forEach(b => {
    b.onclick = () => editItem(+b.dataset.edit, containerId);
  });
}

async function removeItem(idx, containerId = 'invList') {
  if (!confirm('حذف شود؟')) return;
  const it = state.items[idx];
  await sb.from('inv_count_items').delete().eq('session_id', state.session.id).eq('drug_id', it.drug_id).eq('batch_number', it.batch_number || '').eq('expiry_date', it.expiry_date || '');
  state.items.splice(idx, 1);
  renderList(containerId);
}

async function editItem(idx, containerId = 'invList') {
  const it = state.items[idx];
  if (!it) return;
  const res = await askQty({
    title: 'ویرایش تعداد', drugName: it.drug_name, defaultQty: it.counted_quantity, defaultExpiry: it.expiry_date, hideBatchInput: true,
  });
  if (res.qty === it.counted_quantity) return;
  if (res.qty === 0) { if (confirm('تعداد صفر شد. حذف شود؟')) await removeItem(idx, containerId); return; }
  it.counted_quantity = res.qty;
  it.counted_by_name = getUserName();
  await sb.from('inv_count_items').upsert({
    session_id: state.session.id, drug_id: it.drug_id, drug_name: it.drug_name,
    batch_number: it.batch_number || '', expiry_date: it.expiry_date,
    counted_quantity: res.qty, counted_by_name: it.counted_by_name
  }, { onConflict: 'session_id,drug_id,batch_number,expiry_date' });
  renderList(containerId); beep();
}

async function buildBatchAndWarnings(drug, expiryGreg) { return ''; } // ساده شده

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
  const { data: bc } = await sb.from('drugs_drugbarcode').select('drug:drugs_drug(id, name, form)').or(`gtin.eq.${gtin},gtin.eq.${gtin.padStart(14, '0')}`).maybeSingle();
  if (!bc?.drug) { toast('بارکد ناشناس', 'warning'); return; }
  const added = await addDrug(bc.drug, gtin, parsed);
  if (added) reopenScannerAuto();
}

function reopenScannerAuto() {
  setTimeout(() => { if (!$('scannerWrap')?.classList.contains('active')) openScanner(handleBarcode); }, 350);
}

async function addDrug(drug, barcode = '', parsed = {}) {
  const res = await askQty({ title: 'شمارش دارو', drugName: drug.name, defaultQty: 1, defaultExpiry: parsed?.exp || '', requireExpiry: true });
  if (res.qty < 0) return false;
  if (!res.expiry_gregorian) { toast('تاریخ الزامی است', 'danger'); return false; }

  const existing = state.items.find(it => it.drug_id === drug.id && (it.expiry_date || '') === res.expiry_gregorian);
  
  // ⬅️ هشدار داروی تکراری (دو بار شمرده نشه)
  if (existing) {
    const prevUser = existing.counted_by_name || 'نامشخص';
    if (!confirm(`⚠️ این دارو با تاریخ ${gregorianToJalali(res.expiry_gregorian)} قبلا توسط "${prevUser}" شمرده شده است.\nآیا تعداد جدید (${res.qty}) به آن اضافه شود؟`)) return false;
    existing.counted_quantity += res.qty;
    existing.counted_by_name = getUserName();
  } else {
    const computedBatch = makeBatchNumber(drug.name, drug.form, res.expiry_gregorian);
    state.items.push({
      drug_id: drug.id, drug_name: drug.name, drug_form: drug.form || '',
      batch_number: computedBatch, expiry_date: res.expiry_gregorian,
      counted_quantity: res.qty, counted_by_name: getUserName()
    });
  }

  const row = state.items.find(it => it.drug_id === drug.id && (it.expiry_date || '') === res.expiry_gregorian);
  await sb.from('inv_count_items').upsert({
    session_id: state.session.id, drug_id: row.drug_id, drug_name: row.drug_name,
    batch_number: row.batch_number || '', expiry_date: row.expiry_date,
    counted_quantity: row.counted_quantity, counted_by_name: row.counted_by_name
  }, { onConflict: 'session_id,drug_id,batch_number,expiry_date' });
  
  if (state.currentStep === 5) renderList('invList');
  beep(); return true;
}

// ═══════════════════════════════════════════════════════════
// گام ۶: مغایرت‌گیری اولیه
// ═══════════════════════════════════════════════════════════
async function renderStep6_Discrepancies() {
  const c = $('stepContent');
  c.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
  
  const discrepancies = [];
  for (const item of state.items) {
    let sysQty = 0;
    if (item.batch_number) {
      const { data: batch } = await sb.from('drugs_drugbatch').select('quantity').eq('drug_id', item.drug_id).eq('batch_number', item.batch_number).maybeSingle();
      sysQty = batch?.quantity || 0;
    }
    if (item.counted_quantity !== sysQty) {
      discrepancies.push({ ...item, system_quantity: sysQty });
    }
  }
  state.pendingDiscrepancies = discrepancies;

  if (!discrepancies.length) {
    c.innerHTML = `<div class="alert alert-success text-center"><i class="bi bi-check-circle-fill"></i> بدون مغایرت!</div>
      <button class="btn btn-primary w-100 py-3" id="btnNext">گام بعدی</button>`;
    $('btnNext').onclick = () => saveStep(8);
    return;
  }

  c.innerHTML = `
    <div class="alert alert-warning small"><i class="bi bi-exclamation-triangle"></i> ${faNum(discrepancies.length)} قلم مغایرت پیدا شد.</div>
    <button class="btn btn-primary w-100 py-3 mb-2" id="btnGoRecount">رفتن به شمارش مجدد (گام ۷)</button>
    <button class="btn btn-outline-secondary w-100" id="btnNext">رد کردن و رفتن به گزارش</button>
  `;
  $('btnGoRecount').onclick = () => saveStep(7);
  $('btnNext').onclick = () => saveStep(8);
}

// ═══════════════════════════════════════════════════════════
// گام ۷: شمارش مجدد موارد مغایر (با کانتر و حذف از لیست)
// ═══════════════════════════════════════════════════════════
function renderStep7_Recount() {
  $('stepContent').innerHTML = `
    <div class="alert alert-warning small">
      <i class="bi bi-arrow-repeat"></i> موارد مغایر را دوباره بشمارید. هر آیتمی که شمرده شود از لیست زیر حذف می‌شود.
    </div>
    <div class="card p-3 text-center mb-3 bg-light">
      <h4 class="mb-0">مانده برای شمارش: <span id="recountCounter" class="text-danger fw-bold">${faNum(state.pendingDiscrepancies.length)}</span> قلم</h4>
    </div>
    <div class="row g-2 mb-3">
      <div class="col-6"><button class="btn btn-primary w-100 py-3" id="btnRecountScan"><i class="bi bi-upc-scan"></i> اسکن مجدد</button></div>
      <div class="col-6"><button class="btn btn-outline-primary w-100 py-3" id="btnRecountSearch"><i class="bi bi-search"></i> جستجو</button></div>
    </div>
    <div id="recountList" style="max-height:300px; overflow-y:auto;"></div>
    <button class="btn btn-success btn-lg w-100 py-3 mt-3" id="btnFinishRecount">پایان شمارش مجدد</button>
  `;

  $('btnRecountScan').onclick = () => openScanner(handleRecountBarcode);
  $('btnRecountSearch').onclick = () => openDrugSearch('دارو را جستجو کنید', d => addRecountDrug(d));
  
  $('btnFinishRecount').onclick = () => {
    if (state.pendingDiscrepancies.length > 0) {
      if (!confirm(`⚠️ شما هنوز ${faNum(state.pendingDiscrepancies.length)} قلم مغایر را دوباره نشمرده‌اید!\nآیا مطمئنید که می‌خواهید به گام بعد بروید؟`)) return;
      if (!confirm(`تایید نهایی: آیا از رد کردن ${faNum(state.pendingDiscrepancies.length)} قلم مغایر مطمئنید؟`)) return;
    }
    saveStep(8);
  };
  renderRecountList();
}

function renderRecountList() {
  const list = $('recountList');
  if (!list) return;
  if (!state.pendingDiscrepancies.length) {
    list.innerHTML = '<div class="alert alert-success text-center">همه موارد مغایر دوباره شمارش شدند!</div>';
    return;
  }
  list.innerHTML = state.pendingDiscrepancies.map(d => {
    const diff = d.counted_quantity - d.system_quantity;
    return `
      <div class="card p-2 mb-2 border-warning">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <div class="fw-bold small">${escapeHtml(d.drug_name)}</div>
            <div class="text-muted" style="font-size:0.7rem;">سیستم: ${faNum(d.system_quantity)} | قبلی: ${faNum(d.counted_quantity)}</div>
          </div>
          <span class="badge ${diff > 0 ? 'bg-warning text-dark' : 'bg-danger'}">${diff > 0 ? '+' : ''}${faNum(diff)}</span>
        </div>
      </div>`;
  }).join('');
}

async function handleRecountBarcode(raw) {
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
  const { data: bc } = await sb.from('drugs_drugbarcode').select('drug:drugs_drug(id, name, form)').or(`gtin.eq.${gtin},gtin.eq.${gtin.padStart(14, '0')}`).maybeSingle();
  if (!bc?.drug) { toast('بارکد ناشناس', 'warning'); return; }
  const added = await addRecountDrug(bc.drug, gtin, parsed);
  if (added) reopenScannerAuto();
}

async function addRecountDrug(drug, barcode = '', parsed = {}) {
  const res = await askQty({ title: 'شمارش مجدد', drugName: drug.name, defaultQty: 1, defaultExpiry: parsed?.exp || '', requireExpiry: true });
  if (res.qty < 0 || !res.expiry_gregorian) return false;

  const computedBatch = makeBatchNumber(drug.name, drug.form, res.expiry_gregorian);
  
  // آپدیت در لیست اصلی
  const existing = state.items.find(it => it.drug_id === drug.id && (it.expiry_date || '') === res.expiry_gregorian);
  if (existing) {
    existing.counted_quantity += res.qty;
  } else {
    state.items.push({
      drug_id: drug.id, drug_name: drug.name, drug_form: drug.form || '',
      batch_number: computedBatch, expiry_date: res.expiry_gregorian,
      counted_quantity: res.qty, counted_by_name: getUserName()
    });
  }
  
  const row = state.items.find(it => it.drug_id === drug.id && (it.expiry_date || '') === res.expiry_gregorian);
  await sb.from('inv_count_items').upsert({
    session_id: state.session.id, drug_id: row.drug_id, drug_name: row.drug_name,
    batch_number: row.batch_number || '', expiry_date: row.expiry_date,
    counted_quantity: row.counted_quantity, counted_by_name: row.counted_by_name
  }, { onConflict: 'session_id,drug_id,batch_number,expiry_date' });

  // حذف از لیست مغایرت‌ها (کانتر آپدیت میشه)
  const dIdx = state.pendingDiscrepancies.findIndex(d => d.drug_id === drug.id && d.expiry_date === res.expiry_gregorian);
  if (dIdx !== -1) {
    state.pendingDiscrepancies.splice(dIdx, 1);
    $('recountCounter').textContent = faNum(state.pendingDiscrepancies.length);
    renderRecountList();
  }

  beep();
  return true;
}

// ═══════════════════════════════════════════════════════════
// گام ۸: گزارش نهایی و تصویب
// ═══════════════════════════════════════════════════════════
async function renderStep8_Report() {
  const c = $('stepContent');
  c.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
  
  const admin = isAdmin;
  
  // محاسبه مغایرت‌ها برای گزارش نهایی
  const discrepancies = [];
  for (const item of state.items) {
    let sysQty = 0;
    if (item.batch_number) {
      const { data: batch } = await sb.from('drugs_drugbatch').select('quantity').eq('drug_id', item.drug_id).eq('batch_number', item.batch_number).maybeSingle();
      sysQty = batch?.quantity || 0;
    }
    if (item.counted_quantity !== sysQty) {
      discrepancies.push({ ...item, system_quantity: sysQty });
    }
  }

  c.innerHTML = `
    <div class="alert alert-warning small">
      <i class="bi bi-exclamation-triangle"></i> موارد مغایر باقی‌مانده: <strong>${faNum(discrepancies.length)}</strong> قلم (${faNum(discrepancies.filter(d => d.counted_quantity > d.system_quantity).length)} مازاد / ${faNum(discrepancies.filter(d => d.counted_quantity < d.system_quantity).length)} کسری)
    </div>
    <div class="d-flex gap-2 mb-3">
      <button class="btn btn-outline-primary w-100" id="btnPrintFinal"><i class="bi bi-printer"></i> چاپ A4</button>
      <button class="btn btn-outline-success w-100" id="btnExportFinal"><i class="bi bi-file-earmark-excel"></i> خروجی اکسل</button>
    </div>
    <button class="btn btn-outline-warning w-100 py-2 mb-3" id="btnBackToRecount">بازگشت به شمارش مغایرت‌ها (گام ۷)</button>
    
    ${admin ? `
      <button class="btn btn-danger btn-lg w-100 py-3" id="btnApply"><i class="bi bi-check2-circle"></i> تصویب نهایی و اعمال موجودی</button>
    ` : `
      <div class="alert alert-info text-center">فقط <strong>مدیران</strong> می‌توانند تصویب نهایی کنند.</div>
    `}
  `;

  $('btnBackToRecount').onclick = () => { state.pendingDiscrepancies = discrepancies; saveStep(7); };

  $('btnExportFinal').onclick = () => {
    const csvData = state.items.map(it => ({
      'نام دارو': it.drug_name,
      'بچ': it.batch_number,
      'تاریخ انقضا': it.expiry_date,
      'تعداد شمارش شده': it.counted_quantity,
      'شمارش کننده': it.counted_by_name
    }));
    downloadCSV(csvData, `inventory_${state.session.code}.csv`);
  };

  $('btnPrintFinal').onclick = () => {
    printA4({
      title: 'گزارش جامع انبارگردانی',
      subtitle: `سند: ${state.session.code} | تاریخ: ${gregorianToJalali(new Date().toISOString().slice(0, 10))}`,
      primaryColor: '#0d6efd',
      columns: [
        { label: '#', formatter: (r, i) => faNum(i + 1) },
        { label: 'نام دارو', key: 'drug_name', align: 'right' },
        { label: 'بچ', key: 'batch_number' },
        { label: 'تعداد شمارش', formatter: r => faNum(r.counted_quantity) },
        { label: 'شمارش‌کننده', key: 'counted_by_name' }
      ],
      rows: state.items,
      signatures: ['شمارش‌کننده', 'تأییدکننده', 'مدیر '],
    });
  };

  if (admin) {
    $('btnApply').onclick = async () => {
      if (!confirm('آیا از تصویب نهایی مطمئنید؟')) return;
      const btn = $('btnApply');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال اعمال...';
      
      const { error } = await sb.rpc('apply_inventory_count', { p_session_id: state.session.id });
      if (error) { alert(error.message); btn.disabled = false; return; }
      
      toast('✅ انبارگردانی تصویب شد', 'success');
      localStorage.removeItem('inv_session_id');
      localStorage.removeItem(AUTOSAVE_KEY);
      setTimeout(() => {
        state.session = null; state.items = [];
        document.getElementById('invContent').innerHTML = '';
        import('./inventory-list.js').then(m => m.openInventoryList());
      }, 1500);
    };
  }
}
