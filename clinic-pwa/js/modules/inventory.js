import { sb } from '../sb.js';
import { $, faNum, escapeHtml, gregorianToJalali, parseGS1, cleanGTIN, toast, beep, makeBatchNumber } from '../utils.js';
import { showScreen } from '../ui.js';
import { openScanner } from '../scanner.js';
import { askQty, openDrugSearch } from '../modals.js';
import { isAdmin } from '../auth.js';

const state = { session: null, items: [] };

export function openInventory() {
  showScreen('Inventory');
  if (state.session) { renderScan(); return; }
  renderStart();
}

function renderStart() {
  $('invContent').innerHTML = `
    <div class="card">
      <div class="card-head"><i class="bi bi-clipboard-check"></i> شروع انبارگردانی</div>
      <div class="card-body">
        <div class="mb-3">
          <label class="form-label">عنوان (اختیاری)</label>
          <input type="text" class="form-control" id="invTitle" placeholder="انبارگردانی پایان ماه">
        </div>
        <button class="btn btn-primary w-100 btn-lg" id="btnInvStart">
          <i class="bi bi-play-circle"></i> شروع جلسه
        </button>
        <button class="btn btn-outline-secondary w-100 mt-2" id="btnInvContinue">
          <i class="bi bi-arrow-clockwise"></i> ادامه جلسه قبلی
        </button>
      </div>
    </div>`;
  $('btnInvStart').onclick = startSession;
  $('btnInvContinue').onclick = continueSession;
}

async function startSession() {
  const title = $('invTitle').value.trim() || 'انبارگردانی';
  const { data: code } = await sb.rpc('gen_inv_code');
  const { data, error } = await sb.from('inv_sessions').insert({ code, title, status: 'in_progress' }).select().single();
  if (error) { toast(error.message, 'danger'); return; }
  state.session = data;
  state.items = [];
  localStorage.setItem('inv_session_id', data.id);
  renderScan();
}

async function continueSession() {
  const id = localStorage.getItem('inv_session_id');
  if (!id) { toast('جلسه‌ای نیست', 'warning'); return; }
  const { data } = await sb.from('inv_sessions').select('*').eq('id', id).maybeSingle();
  if (!data) { toast('یافت نشد', 'danger'); return; }
  if (['completed', 'applied'].includes(data.status)) { toast('بسته شده', 'warning'); return; }
  state.session = data;
  const { data: items } = await sb.from('inv_count_items').select('*').eq('session_id', id);
  state.items = (items || []).map(i => ({
    drug_id: i.drug_id, drug_name: i.drug_name,
    batch_number: i.batch_number, expiry_date: i.expiry_date,
    counted_quantity: i.counted_quantity, barcode: i.barcode
  }));
  renderScan();
}

function renderScan() {
  $('invContent').innerHTML = `
    <div class="card">
      <div class="card-body py-3 d-flex justify-content-between align-items-center">
        <div>
          <span class="badge-soft primary">${state.session.code}</span>
          <div class="muted small mt-1">${escapeHtml(state.session.title || '')}</div>
        </div>
        <div class="badge-soft success">${faNum(state.items.length)} قلم</div>
      </div>
    </div>
    <div class="row g-2 mb-3">
      <div class="col-6"><button class="btn btn-primary w-100 py-3" id="btnInvScan"><i class="bi bi-upc-scan"></i> اسکن</button></div>
      <div class="col-6"><button class="btn btn-outline-primary w-100 py-3" id="btnInvSearch"><i class="bi bi-search"></i> جستجو</button></div>
    </div>
    <div class="section-title"><span>اقلام شمارش‌شده</span></div>
    <div id="invList"></div>
    <div class="d-grid gap-2 mt-3">
      <button class="btn btn-warning btn-lg py-3" id="btnInvFinish"><i class="bi bi-flag-fill"></i> پایان و بررسی مغایرت</button>
      <button class="btn btn-outline-danger btn-sm" id="btnInvCancel">لغو جلسه</button>
    </div>
  `;
  $('btnInvScan').onclick = () => openScanner(handleBarcode);
  $('btnInvSearch').onclick = () => openDrugSearch('دارو را جستجو کنید', d => addDrug(d));
  $('btnInvFinish').onclick = finish;
  $('btnInvCancel').onclick = cancelSession;
  renderList();
}

function renderList() {
  const list = $('invList');
  if (!list) return;
  if (!state.items.length) {
    list.innerHTML = '<div class="card text-center py-4 muted">هنوز قلمی ثبت نشده</div>';
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
              ${it.expiry_date ? `انقضا: ${escapeHtml(it.expiry_date)} (${gregorianToJalali(it.expiry_date)})` : ''}
            </div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <div class="qty-display" data-edit="${realIdx}" style="cursor:pointer;">${faNum(it.counted_quantity)}</div>
            <button class="num-btn" style="width:38px;height:38px;" data-remove="${realIdx}"><i class="bi bi-trash text-danger"></i></button>
          </div>
        </div>
      </div>`;
  }).join('');
  list.querySelectorAll('[data-remove]').forEach(b => {
    b.onclick = (e) => { e.stopPropagation(); removeItem(+b.dataset.remove); };
  });
  list.querySelectorAll('[data-edit]').forEach(b => {
    b.onclick = () => editItem(+b.dataset.edit);
  });
}
async function removeItem(idx) {
  if (!confirm('حذف شود؟')) return;
  const it = state.items[idx];
  await sb.from('inv_count_items').delete()
    .eq('session_id', state.session.id)
    .eq('drug_id', it.drug_id)
    .eq('batch_number', it.batch_number || '')
    .eq('expiry_date', it.expiry_date || '');
  state.items.splice(idx, 1);
  renderScan();
}

async function cancelSession() {
  if (!confirm('کل جلسه حذف شود؟')) return;
  await sb.from('inv_sessions').delete().eq('id', state.session.id);
  localStorage.removeItem('inv_session_id');
  state.session = null;
  state.items = [];
  openInventory();
}

// ═══════════════════════════════════════════════════════
// ساخت بچ + بررسی هشدار
// ═══════════════════════════════════════════════════════
async function buildBatchAndWarnings(drug, expiryGreg) {
  if (!expiryGreg) return '';

  const computedBatch = makeBatchNumber(drug.name, drug.form, expiryGreg);

  const { data: exactBatch } = await sb.from('drugs_drugbatch')
    .select('id, quantity, expiry_date')
    .eq('drug_id', drug.id)
    .eq('batch_number', computedBatch)
    .maybeSingle();

  const { data: allBatches } = await sb.from('drugs_drugbatch')
    .select('batch_number, expiry_date, quantity')
    .eq('drug_id', drug.id)
    .gt('quantity', 0);

  const otherBatches = (allBatches || []).filter(b => b.batch_number !== computedBatch);

  let html = '';

  html += `<div style="background:#f1f5f9;border-radius:10px;padding:10px;margin-bottom:10px;">
    <div style="font-size:0.8rem;color:#64748b;margin-bottom:4px;">شماره بچ ساخته شده:</div>
    <code style="font-size:0.95rem;font-weight:700;color:#0d6efd;direction:ltr;display:block;word-break:break-all;">
      ${escapeHtml(computedBatch)}
    </code>
  </div>`;

  if (exactBatch) {
    const expJ = gregorianToJalali(exactBatch.expiry_date);
    html += `<div class="alert alert-info py-2 small mb-2">
      <i class="bi bi-check-circle"></i>
      <strong>این بچ قبلاً در سیستم موجود است.</strong>
      موجودی فعلی: <strong>${faNum(exactBatch.quantity)} عدد</strong>
      <br><small>انقضا: ${expJ}</small>
    </div>`;
  } else {
    html += `<div class="alert alert-secondary py-2 small mb-2">
      <i class="bi bi-info-circle"></i>
      این بچ در سیستم ثبت نشده است. با ذخیره، بچ جدید ساخته می‌شود.
    </div>`;
  }

  if (otherBatches.length > 0) {
    const listHtml = otherBatches.slice(0, 5).map(b => {
      const expJ = gregorianToJalali(b.expiry_date);
      return `<li style="font-size:0.8rem;">
        <code dir="ltr">${escapeHtml(b.batch_number)}</code>
        — ${expJ} — <strong>${faNum(b.quantity)} عدد</strong>
      </li>`;
    }).join('');

    html += `<div class="alert alert-warning py-2 small mb-0">
      <i class="bi bi-exclamation-triangle"></i>
      <strong>هشدار:</strong> این دارو <strong>${faNum(otherBatches.length)} بچ دیگر</strong> با تاریخ‌های متفاوت دارد:
      <ul style="margin:8px 0 0 0;padding-right:20px;">${listHtml}</ul>
      ${otherBatches.length > 5 ? `<div style="margin-top:6px;font-size:0.75rem;">و ${faNum(otherBatches.length - 5)} بچ دیگر...</div>` : ''}
      <div style="margin-top:8px;font-size:0.8rem;color:#78350f;">
        توجه: داروهایی با تاریخ انقضای متفاوت باید جداگانه شمارش شوند.
      </div>
    </div>`;
  }

  return html;
}

// ═══════════════════════════════════════════════════════
// پردازش بارکد
// ═══════════════════════════════════════════════════════
async function handleBarcode(raw) {
  const parsed = parseGS1(raw);
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
  await addDrug(bc.drug, gtin, parsed);
}

async function addDrug(drug, barcode = '', parsed = {}) {
  // ⭐ ذخیره بارکد در دیتابیس (رفع مشکل ۱)
  if (barcode) {
    try {
      await sb.from('drugs_drugbarcode').upsert({
        drug_id: drug.id,
        gtin: barcode
      }, { onConflict: 'gtin' });
    } catch (e) { /* احتمالاً قبلاً ثبت شده */ }
  }

  const res = await askQty({
    title: 'شمارش دارو',
    drugName: drug.name + (drug.form ? ` (${drug.form})` : ''),
    extraInfo: barcode ? `بارکد: <span dir="ltr">${escapeHtml(barcode)}</span>` : '',
    defaultQty: 1,
    defaultExpiry: parsed?.exp || '',
    showExtras: true,
    batchCheckFn: (expiryGreg) => buildBatchAndWarnings(drug, expiryGreg)
  });
  if (res.qty < 0) return;

  const computedBatch = makeBatchNumber(drug.name, drug.form, res.expiry_gregorian);

  const existing = state.items.find(it =>
    it.drug_id === drug.id &&
    (it.batch_number || '') === (computedBatch || '') &&
    (it.expiry_date || '') === (res.expiry_gregorian || '')
  );
  if (existing) {
    existing.counted_quantity += res.qty;
  } else {
    state.items.push({
      drug_id: drug.id,
      drug_name: drug.name,
      batch_number: computedBatch,
      expiry_date: res.expiry_gregorian,
      counted_quantity: res.qty,
      barcode: barcode || null
    });
  }

  const row = state.items.find(it =>
    it.drug_id === drug.id &&
    (it.batch_number || '') === (computedBatch || '') &&
    (it.expiry_date || '') === (res.expiry_gregorian || '')
  );

  await sb.from('inv_count_items').upsert({
    session_id: state.session.id,
    drug_id: row.drug_id,
    drug_name: row.drug_name,
    batch_number: row.batch_number,
    expiry_date: row.expiry_date,
    counted_quantity: row.counted_quantity,
    barcode: row.barcode
  }, { onConflict: 'session_id,drug_id,batch_number,expiry_date' });

  renderScan();
  beep();
}

// ═══════════════════════════════════════════════════════
// پایان و بررسی مغایرت
// ═══════════════════════════════════════════════════════
async function finish() {
  if (!state.items.length) { toast('هنوز قلمی ثبت نشده', 'warning'); return; }
  if (!confirm('پایان شمارش و بررسی مغایرت؟')) return;

  $('invContent').innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

  // ⭐ مقایسه در سطح بچ، نه در سطح دارو (رفع مشکل ۲)
  const discrepancies = [];

  for (const item of state.items) {
    // موجودی سیستم برای این بچ خاص
    let sysQty = 0;
    if (item.batch_number) {
      const { data: batch } = await sb.from('drugs_drugbatch')
        .select('quantity')
        .eq('drug_id', item.drug_id)
        .eq('batch_number', item.batch_number)
        .maybeSingle();
      sysQty = batch?.quantity || 0;
    }

    if (item.counted_quantity !== sysQty) {
      discrepancies.push({
        session_id: state.session.id,
        drug_id: item.drug_id,
        drug_name: item.drug_name,
        batch_number: item.batch_number,
        expiry_date: item.expiry_date,
        system_quantity: sysQty,
        counted_quantity: item.counted_quantity,
        status: 'pending'
      });
    }
  }

  if (discrepancies.length) {
    await sb.from('inv_discrepancies').delete().eq('session_id', state.session.id);
    // جدول اختلافات باید ستون batch_number و expiry_date داشته باشد
    await sb.from('inv_discrepancies').insert(discrepancies);
  }

  renderReport(discrepancies);
}

function renderReport(discrepancies) {
  const c = $('invContent');
  if (!discrepancies.length) {
    c.innerHTML = `
      <div class="card text-center" style="padding:40px 20px;">
        <div style="font-size:4rem;">✅</div>
        <h5 class="mt-3">بدون مغایرت!</h5>
        <p class="muted">موجودی سیستم با شمارش مطابقت دارد.</p>
      </div>
      <button class="btn btn-primary w-100 btn-lg" id="btnNewSession">جلسه جدید</button>`;
    $('btnNewSession').onclick = () => {
      state.session = null; state.items = [];
      localStorage.removeItem('inv_session_id');
      openInventory();
    };
    return;
  }

  c.innerHTML = `
    <div class="card text-center" style="padding:24px;">
      <div style="font-size:3rem;">⚠️</div>
      <h5 class="mt-2">${faNum(discrepancies.length)} قلم مغایرت</h5>
    </div>
    <div class="section-title">لیست مغایرت‌ها</div>
    ${discrepancies.map(d => {
      const diff = d.counted_quantity - d.system_quantity;
      const isExtra = diff > 0;
      return `
        <div class="item-card ${isExtra ? 'warn' : 'danger'}">
          <div class="d-flex justify-content-between align-items-center">
            <div class="flex-grow-1">
              <div class="name">${escapeHtml(d.drug_name)}</div>
              <div class="meta">
                ${d.batch_number ? `بچ: <code dir="ltr">${escapeHtml(d.batch_number)}</code><br>` : ''}
                سیستم: <strong>${faNum(d.system_quantity)}</strong> | شمارش: <strong>${faNum(d.counted_quantity)}</strong>
              </div>
            </div>
            <span class="badge-soft ${isExtra ? 'warning' : 'danger'}">${isExtra ? 'مازاد' : 'کسری'} ${faNum(Math.abs(diff))}</span>
          </div>
        </div>`;
    }).join('')}
    <div class="d-grid gap-2 mt-3">
      <button class="btn btn-primary btn-lg py-3" id="btnRecount"><i class="bi bi-arrow-repeat"></i> شمارش مجدد</button>
      <button class="btn btn-outline-success btn-lg py-3" id="btnAcceptReport"><i class="bi bi-file-earmark-check"></i> تایید گزارش</button>
    </div>`;

  $('btnRecount').onclick = async () => {
    const ids = discrepancies.map(d => d.drug_id);
    const batches = discrepancies.map(d => d.batch_number);
    state.items = state.items.filter(it =>
      !(ids.includes(it.drug_id) && batches.includes(it.batch_number))
    );
    await sb.from('inv_count_items').delete()
      .eq('session_id', state.session.id)
      .in('drug_id', ids);
    await sb.from('inv_discrepancies').delete().eq('session_id', state.session.id);
    renderScan();
  };
  $('btnAcceptReport').onclick = () => renderApplyScreen(discrepancies);
}

function renderApplyScreen(discrepancies) {
  const c = $('invContent');
  const admin = isAdmin;
  c.innerHTML = `
    <div class="card text-center" style="padding:24px;">
      <div style="font-size:3rem;">📋</div>
      <h5 class="mt-2">گزارش انبارگردانی</h5>
      <p class="muted small">${faNum(discrepancies.length)} قلم مغایرت</p>
    </div>
    <div class="card">
      <div class="card-head ${admin ? 'warning' : ''}">
        <i class="bi bi-shield-lock"></i> اعمال روی موجودی
      </div>
      <div class="card-body">
        ${admin ? `
          <div class="alert alert-warning small mb-3">
            با زدن دکمه زیر موجودی سیستم با شمارش شما تطبیق می‌یابد. قابل بازگشت نیست.
          </div>
          <button class="btn btn-danger w-100 btn-lg py-3" id="btnApply">
            <i class="bi bi-check2-circle"></i> تایید نهایی
          </button>
        ` : `
          <div class="alert alert-info small mb-0">
            <i class="bi bi-info-circle"></i> فقط <strong>مدیران</strong> می‌توانند اعمال کنند. گزارش ثبت شد.
          </div>
          <button class="btn btn-outline-secondary w-100 mt-3" id="btnClose">فقط ثبت گزارش</button>
        `}
      </div>
    </div>
    <div class="section-title">خلاصه تغییرات</div>
    ${discrepancies.map(d => {
      const diff = d.counted_quantity - d.system_quantity;
      return `
        <div class="item-card">
          <div class="d-flex justify-content-between">
            <div>
              <div class="name">${escapeHtml(d.drug_name)}</div>
              <div class="meta">${d.batch_number ? `بچ: ${escapeHtml(d.batch_number)}` : ''} ${faNum(d.system_quantity)} ← ${faNum(d.counted_quantity)}</div>
            </div>
            <span class="badge-soft ${diff > 0 ? 'warning' : 'danger'}">${diff > 0 ? '+' : ''}${faNum(diff)}</span>
          </div>
        </div>`;
    }).join('')}
  `;

  if (admin) {
    $('btnApply').onclick = async () => {
      if (!confirm('آیا مطمئنید؟') || !confirm('قابل بازگشت نیست. ادامه؟')) return;
      const btn = $('btnApply');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال اعمال...';
      const { error } = await sb.rpc('apply_inventory_count', { p_session_id: state.session.id });
      if (error) { alert(error.message); btn.disabled = false; return; }
      toast('✅ اعمال شد', 'success');
      setTimeout(() => {
        state.session = null; state.items = [];
        localStorage.removeItem('inv_session_id');
        openInventory();
      }, 1200);
    };
  } else {
    $('btnClose').onclick = async () => {
      await sb.from('inv_sessions').update({ status: 'completed', finished_at: new Date().toISOString() }).eq('id', state.session.id);
      state.session = null; state.items = [];
      localStorage.removeItem('inv_session_id');
      toast('گزارش ثبت شد', 'success');
      openInventory();
    };
  }
}
