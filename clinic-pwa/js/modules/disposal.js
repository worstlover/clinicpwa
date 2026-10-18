// js/modules/disposal.js
import { sb } from '../sb.js';
import { $, faNum, escapeHtml, gregorianToJalali, parseGS1, cleanGTIN, toast, beep } from '../utils.js';
import { showScreen } from '../ui.js';
import { openScanner } from '../scanner.js';
import { askQty, openDrugSearch, promptExpirySelection } from '../modals.js'; // ⭐ ایمپورت شد
import { currentUser } from '../auth.js';

const state = { items: [] };

export function openDisposal() {
  showScreen('Disposal');
  $('disp2Content').innerHTML = `
    <div class="card">
      <div class="card-head danger"><i class="bi bi-trash3"></i> خروج داروهای منقضی</div>
      <div class="card-body">
        <div class="alert alert-warning small mb-0">
          <i class="bi bi-exclamation-triangle"></i>
          این ماژول برای دور ریختن داروهای تاریخ‌گذشته است.
        </div>
      </div>
    </div>
    <div class="row g-2 mb-3">
      <div class="col-6"><button class="btn btn-danger w-100 py-3" id="dsp2Scan"><i class="bi bi-upc-scan"></i> اسکن</button></div>
      <div class="col-6"><button class="btn btn-outline-danger w-100 py-3" id="dsp2Search"><i class="bi bi-search"></i> جستجو</button></div>
    </div>
    <div class="section-title"><span>اقلام برای دور ریختن</span><span class="badge-soft danger" id="dsp2Count">۰</span></div>
    <div id="dsp2List"></div>
    <button class="btn btn-danger btn-lg w-100 py-3 mt-3" id="dsp2Finalize">
      <i class="bi bi-check-circle-fill"></i> ثبت نهایی خروج
    </button>`;
  $('dsp2Scan').onclick = () => openScanner(handleBarcode);
  $('dsp2Search').onclick = () => openDrugSearch('دارو را جستجو کنید', d => addDrug(d));
  $('dsp2Finalize').onclick = finalize;
  renderList();
}

function renderList() {
  const cnt = $('dsp2Count');
  if (cnt) cnt.textContent = faNum(state.items.length);
  const list = $('dsp2List');
  if (!list) return;
  if (!state.items.length) {
    list.innerHTML = '<div class="card text-center py-4 muted">هنوز قلمی اضافه نشده</div>';
    return;
  }
  list.innerHTML = state.items.map((it, i) => `
    <div class="item-card danger">
      <div class="d-flex justify-content-between align-items-center">
        <div class="flex-grow-1">
          <div class="name">${escapeHtml(it.drug_name)}</div>
          <div class="meta">
            بچ: ${escapeHtml(it.batch_number || '—')} |
            انقضا: ${escapeHtml(it.expiry_date)} (${gregorianToJalali(it.expiry_date)})
          </div>
        </div>
        <div class="d-flex align-items-center gap-2">
          <button class="num-btn" style="width:38px;height:38px;" data-act="dec" data-i="${i}">−</button>
          <div class="qty-display" style="color:#dc3545;">${faNum(it.quantity)}</div>
          <button class="num-btn" style="width:38px;height:38px;" data-act="inc" data-i="${i}">+</button>
          <button class="num-btn" style="width:38px;height:38px;" data-act="del" data-i="${i}"><i class="bi bi-trash text-danger"></i></button>
        </div>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-act]').forEach(b => {
    const i = +b.dataset.i;
    b.onclick = () => {
      if (b.dataset.act === 'inc') state.items[i].quantity++;
      else if (b.dataset.act === 'dec' && state.items[i].quantity > 1) state.items[i].quantity--;
      else if (b.dataset.act === 'del' && confirm('حذف شود؟')) state.items.splice(i, 1);
      renderList();
    };
  });
}

// ═══════════════════════════════════════════════════════════
// پردازش بارکد — با بررسی چند تاریخ انقضا ⭐
// ═══════════════════════════════════════════════════════════
async function handleBarcode(raw) {
  const parsed = parseGS1(raw);

  // ⭐ اگر بیش از یک تاریخ معتبر وجود دارد، از کاربر بپرس
  if (parsed.exps && parsed.exps.length > 1) {
    const selectedDate = await promptExpirySelection(parsed.exps);
    if (!selectedDate) {
      return; // کاربر انصراف داد
    }
    parsed.exp = selectedDate; 
  }

  const gtin = cleanGTIN(parsed.gtin);
  const padded = gtin.padStart(14, '0');
  const { data: bc } = await sb.from('drugs_drugbarcode')
    .select('drug:drugs_drug(id, name, form)')
    .or(`gtin.eq.${gtin},gtin.eq.${padded}`).maybeSingle();
  if (!bc?.drug) {
    toast('بارکد ناشناس', 'warning');
    openDrugSearch('جستجو کنید', d => addDrug(d, gtin, parsed));
    return;
  }
  await addDrug(bc.drug, gtin, parsed);
}

async function addDrug(drug, barcode = '', parsed = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: expiredBatches } = await sb.from('drugs_drugbatch')
    .select('id, batch_number, expiry_date, quantity')
    .eq('drug_id', drug.id).lt('expiry_date', today).gt('quantity', 0)
    .order('expiry_date');

  if (!expiredBatches?.length) {
    toast(`«${drug.name}» بچ منقضی ندارد`, 'warning');
    beep(300);
    return;
  }

  let chosenBatch;
  if (expiredBatches.length === 1) {
    chosenBatch = expiredBatches[0];
  } else {
    const list = expiredBatches.map((b, i) =>
      `${i + 1}) بچ ${b.batch_number} - ${b.quantity} عدد - ${gregorianToJalali(b.expiry_date)}`
    ).join('\n');
    const idx = parseInt(prompt('کدام بچ؟\n' + list)) - 1;
    if (isNaN(idx) || !expiredBatches[idx]) return;
    chosenBatch = expiredBatches[idx];
  }

  const res = await askQty({
    title: 'خروج دارو منقضی',
    headerClass: 'bg-danger text-white',
    drugName: drug.name + (drug.form ? ` (${drug.form})` : ''),
    extraInfo: `بچ: ${escapeHtml(chosenBatch.batch_number)} | موجودی: <strong>${faNum(chosenBatch.quantity)}</strong> | انقضا: ${gregorianToJalali(chosenBatch.expiry_date)}`,
    showExtras: false,
    defaultQty: 1
  });
  if (res.qty < 1) return;
  if (res.qty > chosenBatch.quantity) {
    toast(`حداکثر ${faNum(chosenBatch.quantity)} عدد`, 'warning');
    return;
  }

  const ex = state.items.find(it =>
    it.drug_id === drug.id && it.batch_number === chosenBatch.batch_number);
  if (ex) ex.quantity += res.qty;
  else state.items.push({
    drug_id: drug.id, drug_name: drug.name,
    batch_number: chosenBatch.batch_number,
    expiry_date: chosenBatch.expiry_date,
    quantity: res.qty,
    barcode
  });
  renderList();
  beep();
}

async function finalize() {
  if (!state.items.length) { toast('قلمی اضافه نشده', 'warning'); return; }
  const total = state.items.reduce((s, it) => s + it.quantity, 0);
  if (!confirm(`${faNum(state.items.length)} قلم (${faNum(total)} عدد) خروج داده شود؟`)) return;

  const btn = $('dsp2Finalize');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ثبت...';

  try {
    const { data: code } = await sb.rpc('gen_disposal_code');
    const { data: order, error: e1 } = await sb.from('disposal_orders').insert({
      code, created_by_email: currentUser?.email || null
    }).select().single();
    if (e1) throw e1;

    const errors = [];
    for (const it of state.items) {
      const { error: e2 } = await sb.from('disposal_items').insert({
        order_id: order.id, drug_id: it.drug_id, drug_name: it.drug_name,
        batch_number: it.batch_number, expiry_date: it.expiry_date,
        quantity: it.quantity, barcode: it.barcode
      });
      if (e2) { errors.push(`${it.drug_name}: ${e2.message}`); continue; }

      const { error: e3 } = await sb.rpc('deduct_expired_batch', {
        p_drug_id: it.drug_id,
        p_batch_number: it.batch_number,
        p_quantity: it.quantity
      });
      if (e3) errors.push(`${it.drug_name} (${it.batch_number}): ${e3.message}`);
    }

    if (errors.length) alert('⚠ خطاها:\n' + errors.join('\n'));
    else toast(`✅ ${code} ثبت شد`, 'success');

    state.items = [];
    openDisposal();
  } catch (e) {
    alert('❌ ' + e.message);
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> ثبت نهایی خروج';
  }
}
