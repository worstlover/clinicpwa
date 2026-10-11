import { sb } from '../sb.js';
import { $, faNum, escapeHtml, parseGS1, cleanGTIN, gregorianToJalali, checkExpiry, toast, beep, makeBatchNumber } from '../utils.js';
import { showScreen } from '../ui.js';
import { openScanner } from '../scanner.js';
import { askQty, openDrugSearch } from '../modals.js';

const state = {
  supplierId: null,
  supplierName: '',
  linkedInvoice: null,
  items: []
};

const AUTOSAVE_KEY = 'recv_autosave';

// ───── ذخیره خودکار هر ۱۰ ثانیه ─────
setInterval(() => {
  if (state.items.length > 0) {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
      items: state.items,
      supplierId: state.supplierId,
      supplierName: state.supplierName,
      linkedInvoice: state.linkedInvoice,
      savedAt: Date.now()
    }));
  }
}, 10000);

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
      return true;
    }
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch (e) {}
  return false;
}

export async function openReceive() {
  await restoreReceiveState();
  showScreen('Receive');
  const c = $('recvContent');
  const { data: suppliers } = await sb.from('drugs_supplier').select('id, name').order('name');

  c.innerHTML = `
    <div class="card">
      <div class="card-head warning"><i class="bi bi-truck"></i> دریافت دارو</div>
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
    <button class="btn btn-success btn-lg w-100 py-3 mt-3" id="recvFinalize">
      <i class="bi bi-check-circle-fill"></i> ذخیره نهایی
    </button>`;

  $('recvSupplier').onchange = e => {
    state.supplierId = parseInt(e.target.value) || null;
    state.supplierName = e.target.options[e.target.selectedIndex].text;
  };
  if (state.supplierId) {
    $('recvSupplier').value = state.supplierId;
    state.supplierName = $('recvSupplier').options[$('recvSupplier').selectedIndex]?.text || '';
  }
  $('recvScan').onclick = () => openScanner(handleBarcode);
  $('recvSearch').onclick = () => openDrugSearch('دارو را جستجو کنید', d => addDrug(d));
  $('recvLinkInvoice').onclick = linkInvoice;
  $('recvFinalize').onclick = finalize;
  $('recvUnlinkInvoice')?.addEventListener('click', () => {
    state.linkedInvoice = null;
    $('recvInvoiceBox').classList.add('hidden');
    $('recvLinkInvoice').classList.remove('hidden');
    renderList();
  });

  if (state.linkedInvoice) showInvoiceInfo();
  renderList();
}

function showInvoiceInfo() {
  $('recvInvoiceNum').textContent = state.linkedInvoice.invoice_number;
  $('recvInvoiceBox').classList.remove('hidden');
  $('recvLinkInvoice').classList.add('hidden');
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
  showInvoiceInfo();
  renderList();
  toast(`فاکتور ${chosen.invoice_number} لینک شد`, 'success');
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
            ${it.warnings?.length ? `<div class="meta" style="color:#dc3545;">${it.warnings.map(w => `• ${escapeHtml(w.text)}`).join('<br>')}</div>` : ''}
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
  // ⭐ ذخیره بارکد در دیتابیس
  if (barcode) {
    try {
      await sb.from('drugs_drugbarcode').upsert({
        drug_id: drug.id,
        gtin: barcode
      }, { onConflict: 'gtin' });
    } catch (e) { /* احتمالاً قبلاً ثبت شده */ }
  }

  const { data: stock } = await sb.from('v_drug_stock').select('total_quantity').eq('drug_id', drug.id).maybeSingle();
  const { data: pend } = await sb.from('v_drug_pending').select('pending_qty').eq('drug_id', drug.id).maybeSingle();
  const available = stock?.total_quantity || 0;
  const ordered = pend?.pending_qty || 0;

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

  const res = await askQty({
    title: 'تایید دریافت',
    headerClass: 'bg-warning',
    drugName: drug.name + (drug.form ? ` (${drug.form})` : ''),
    extraInfo,
    defaultQty: 1,
    defaultExpiry: parsed?.exp || '',
    defaultBatch: parsed?.batch || '',
    showExtras: true
  });
  if (res.qty < 1) return;

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

  // ⭐⭐⭐ اگر بچ خالی بود، خودکار از فرمول بساز ⭐⭐⭐
  let finalBatch = res.batch || '';
  if (!finalBatch && res.expiry_gregorian) {
    finalBatch = makeBatchNumber(drug.name, drug.form, res.expiry_gregorian) || '';
  }
  if (!finalBatch) {
    finalBatch = `AUTO-${Date.now()}`;
  }

  const ex = state.items.find(it => it.drug_id === drug.id && (it.batch || '') === finalBatch);
  if (ex && ex.expiry === res.expiry_gregorian) ex.qty += res.qty;
  else state.items.push({
    drug_id: drug.id,
    drug_name: drug.name,
    qty: res.qty,
    batch: finalBatch,
    expiry: res.expiry_gregorian || '',
    expiry_jalali: res.expiry_jalali || '',
    barcode,
    ordered_qty: ordered,
    invoice_qty: invoiceQty,
    warnings
  });

  renderList();
  beep();
}

async function finalize() {
  if (!state.supplierId) { toast('تامین‌کننده را انتخاب کنید', 'warning'); return; }
  if (!state.items.length) { toast('حداقل یک قلم', 'warning'); return; }
  for (const it of state.items) {
    if (!it.expiry) { toast(`تاریخ انقضای «${it.drug_name}» الزامی است`, 'warning'); return; }
  }
  if (!confirm(`ذخیره ${faNum(state.items.length)} قلم؟`)) return;

  const btn = $('recvFinalize');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> ذخیره...';

  try {
    const today = new Date();
    const code = `RCV-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;

    // ═══════ ۱. درج سربرگ رسید ═══════
    const { data: receipt, error: e1 } = await sb.from('drugs_receipt').insert({
      receipt_number: code,
      supplier_name: state.supplierName || 'نامشخص',
      status: 'final',
      receipt_type: state.linkedInvoice ? 'with_invoice' : 'without_invoice',
      invoice_id: state.linkedInvoice?.id || null,
      date_received: today.toISOString().slice(0, 10)
    }).select().single();
    if (e1) throw new Error('سربرگ: ' + e1.message);

    const errors = [];
    const successes = [];

    // ═══════ ۲. پردازش هر قلم ═══════
    for (const it of state.items) {
      let batchForDb = it.batch || '';
      if (!batchForDb && it.expiry) {
        batchForDb = makeBatchNumber(it.drug_name, '', it.expiry) || '';
      }
      if (!batchForDb) {
        batchForDb = `AUTO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      }

      // ۲.۱. درج آیتم رسید
      const { error: e2 } = await sb.from('drugs_receiptitem').insert({
        receipt_id: receipt.id,
        drug_id: it.drug_id,
        received_quantity: it.qty,
        batch_number: batchForDb,
        expiry_date: it.expiry,
        force_close_shortage: false
      });
      if (e2) {
        errors.push(`${it.drug_name} (آیتم رسید): ${e2.message}`);
        continue;
      }

      // ═══════ ۲.۲. آپدیت یا درج در drugs_drugbatch ═══════
      try {
        const { data: existing, error: eFind } = await sb.from('drugs_drugbatch')
          .select('id, quantity')
          .eq('drug_id', it.drug_id)
          .eq('batch_number', batchForDb)
          .maybeSingle();

        if (eFind) {
          errors.push(`${it.drug_name} (جستجوی بچ): ${eFind.message}`);
          continue;
        }

        if (existing) {
          // ⭐ آپدیت بچ موجود
          const newQty = (existing.quantity || 0) + it.qty;
          const { error: eUpd, data: updData } = await sb.from('drugs_drugbatch')
            .update({
              quantity: newQty,
              expiry_date: it.expiry
            })
            .eq('id', existing.id)
            .select();

          if (eUpd) {
            errors.push(`${it.drug_name} (آپدیت بچ): ${eUpd.message}`);
            continue;
          }
          if (!updData || !updData.length) {
            errors.push(`${it.drug_name} (آپدیت بچ): دسترسی ندارید یا سطر پیدا نشد`);
            continue;
          }
          successes.push(`${it.drug_name}: بچ ${batchForDb} از ${existing.quantity} → ${newQty}`);
        } else {
          // ⭐ درج بچ جدید
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
            })
            .select();

          if (eIns) {
            errors.push(`${it.drug_name} (درج بچ): ${eIns.message}`);
            continue;
          }
          if (!insData || !insData.length) {
            errors.push(`${it.drug_name} (درج بچ): دسترسی ندارید`);
            continue;
          }
          successes.push(`${it.drug_name}: بچ جدید ${batchForDb} با ${it.qty} عدد`);
        }
      } catch (e) {
        errors.push(`${it.drug_name} (خطای شبکه بچ): ${e.message}`);
        continue;
      }

      // ═══════ ۲.۳. تخصیص FIFO ═══════
      try {
        const { error: e3 } = await sb.rpc('allocate_to_requests', {
          p_drug_id: it.drug_id,
          p_quantity: it.qty,
          p_force_close: false
        });
        if (e3) errors.push(`FIFO ${it.drug_name}: ${e3.message}`);
      } catch (errRpc) {
        errors.push(`FIFO ${it.drug_name}: ${errRpc.message || 'خطای شبکه'}`);
      }
    }

    // ═══════ ۳. گزارش نهایی ═══════
    console.log('✅ موفق:', successes);
    console.log('❌ خطاها:', errors);

    if (errors.length) {
      alert(
        '⚠ برخی قلم‌ها ذخیره نشدند:\n\n' +
        '❌ خطاها:\n' + errors.join('\n\n') +
        (successes.length ? '\n\n✅ موفق:\n' + successes.join('\n') : '')
      );
    } else {
      toast('✅ رسید ' + code + ' با ' + faNum(successes.length) + ' قلم ثبت شد', 'success');
    }

    localStorage.removeItem(AUTOSAVE_KEY);

    state.items = [];
    state.supplierId = null;
    state.supplierName = '';
    state.linkedInvoice = null;
    openReceive();
  } catch (e) {
    alert('❌ ' + (e.message || e));
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> ذخیره نهایی';
  }
}
