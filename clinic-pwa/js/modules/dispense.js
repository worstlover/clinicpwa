import { sb } from '../sb.js';
import { $, faNum, escapeHtml, parseGS1, cleanGTIN, toast, beep } from '../utils.js';
import { showScreen } from '../ui.js';
import { openScanner } from '../scanner.js';
import { askQty, openDrugSearch } from '../modals.js';

const state = { patient: { name:'', national:'', presc:'', doctor:'' }, items: [] };

export function openDispense() {
  showScreen('Dispense');
  $('dispContent').innerHTML = `
    <div class="card">
      <div class="card-head success"><i class="bi bi-person-vcard"></i> اطلاعات بیمار</div>
      <div class="card-body">
        <div class="mb-3">
          <label class="form-label">نام بیمار *</label>
          <input type="text" class="form-control" id="dispName" value="${escapeHtml(state.patient.name)}">
        </div>
        <div class="row g-2">
          <div class="col-6">
            <label class="form-label">کد ملی</label>
            <input type="text" class="form-control" id="dispNat" value="${escapeHtml(state.patient.national)}" dir="ltr">
          </div>
          <div class="col-6">
            <label class="form-label">شماره نسخه</label>
            <input type="text" class="form-control" id="dispPresc" value="${escapeHtml(state.patient.presc)}" dir="ltr">
          </div>
        </div>
      </div>
    </div>
    <div class="row g-2 mb-3">
      <div class="col-6"><button class="btn btn-success w-100 py-3" id="dispScan"><i class="bi bi-upc-scan"></i> اسکن</button></div>
      <div class="col-6"><button class="btn btn-outline-success w-100 py-3" id="dispSearch"><i class="bi bi-search"></i> جستجو</button></div>
    </div>
    <div class="section-title"><span>اقلام نسخه</span><span class="badge-soft success" id="dispCount">۰</span></div>
    <div id="dispList"></div>
    <button class="btn btn-success btn-lg w-100 py-3 mt-3" id="dispFinalize">
      <i class="bi bi-check-circle-fill"></i> تحویل نهایی
    </button>`;
  $('dispName').oninput = e => state.patient.name = e.target.value;
  $('dispNat').oninput = e => state.patient.national = e.target.value;
  $('dispPresc').oninput = e => state.patient.presc = e.target.value;
  $('dispScan').onclick = () => openScanner(handleBarcode);
  $('dispSearch').onclick = () => openDrugSearch('دارو را جستجو کنید', d => addDrug(d));
  $('dispFinalize').onclick = finalize;
  renderList();
}

function renderList() {
  const c = $('dispContent');
  const cnt = c.querySelector('#dispCount');
  if (cnt) cnt.textContent = faNum(state.items.length);
  const list = c.querySelector('#dispList');
  if (!list) return;
  if (!state.items.length) {
    list.innerHTML = '<div class="card text-center py-4 muted">هنوز قلمی اضافه نشده</div>';
    return;
  }
  list.innerHTML = state.items.map((it, i) => `
    <div class="item-card">
      <div class="d-flex justify-content-between align-items-center">
        <div class="flex-grow-1">
          <div class="name">${escapeHtml(it.drug_name)}</div>
          <div class="meta">موجودی: ${faNum(it.available)}</div>
        </div>
        <div class="d-flex align-items-center gap-2">
          <button class="num-btn" style="width:38px;height:38px;font-size:1.2rem;" data-act="dec" data-i="${i}">−</button>
          <div class="qty-display">${faNum(it.requested_quantity)}</div>
          <button class="num-btn" style="width:38px;height:38px;font-size:1.2rem;" data-act="inc" data-i="${i}">+</button>
          <button class="num-btn" style="width:38px;height:38px;font-size:1rem;" data-act="del" data-i="${i}"><i class="bi bi-trash text-danger"></i></button>
        </div>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-act]').forEach(b => {
    const i = +b.dataset.i;
    b.onclick = () => {
      if (b.dataset.act === 'inc') state.items[i].requested_quantity++;
      else if (b.dataset.act === 'dec' && state.items[i].requested_quantity > 1) state.items[i].requested_quantity--;
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
  if (!bc?.drug) { toast('بارکد ناشناس', 'warning'); openDrugSearch('جستجو کنید', d => addDrug(d)); return; }
  await addDrug(bc.drug, gtin);
}

async function addDrug(drug, barcode = '') {
  const { data: stock } = await sb.from('v_drug_stock').select('total_quantity').eq('drug_id', drug.id).maybeSingle();
  const available = stock?.total_quantity || 0;
  if (available <= 0) { toast(`موجودی «${drug.name}» صفر است!`, 'danger'); beep(300); return; }

  const res = await askQty({
    title: 'تحویل دارو',
    headerClass: 'bg-success text-white',
    drugName: drug.name + (drug.form ? ` (${drug.form})` : ''),
    extraInfo: `موجودی قابل تحویل: <strong>${faNum(available)}</strong>`,
    showExtras: false,
    defaultQty: 1
  });
  if (res.qty < 1) return;
  if (res.qty > available) { toast(`حداکثر ${faNum(available)} عدد`, 'warning'); return; }

  const ex = state.items.find(it => it.drug_id === drug.id);
  if (ex) ex.requested_quantity += res.qty;
  else state.items.push({ drug_id: drug.id, drug_name: drug.name, requested_quantity: res.qty, available, barcode });
  renderList();
  beep();
}

async function finalize() {
  const name = state.patient.name.trim();
  if (!name) { toast('نام بیمار الزامی است', 'warning'); return; }
  if (!state.items.length) { toast('حداقل یک دارو', 'warning'); return; }
  if (!confirm(`تحویل ${faNum(state.items.length)} قلم به «${name}»؟`)) return;

  const btn = $('dispFinalize');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال پردازش...';

  try {
    const { data: code } = await sb.rpc('gen_disp_code');
    const { data: order, error: e1 } = await sb.from('disp_orders').insert({
      code, patient_name: name,
      patient_national: state.patient.national || null,
      prescription_code: state.patient.presc || null,
      doctor_name: state.patient.doctor || null,
      status: 'draft'
    }).select().single();
    if (e1) throw e1;

    const errors = [];
    for (const it of state.items) {
      const { data: item, error: e2 } = await sb.from('disp_items').insert({
        order_id: order.id, drug_id: it.drug_id, drug_name: it.drug_name,
        requested_quantity: it.requested_quantity, dispensed_quantity: 0, barcode: it.barcode
      }).select().single();
      if (e2) { errors.push(`${it.drug_name}: ${e2.message}`); continue; }

      const { data: alloc, error: e3 } = await sb.rpc('deduct_stock_fifo', {
        p_drug_id: it.drug_id, p_quantity: it.requested_quantity
      });
      if (e3) { errors.push(`${it.drug_name}: ${e3.message}`); continue; }

      if (alloc?.length) {
        await sb.from('disp_batch_allocations').insert(alloc.map(a => ({
          dispense_item_id: item.id, batch_id: a.batch_id,
          batch_number: a.batch_number, expiry_date: a.expiry_date, quantity: a.deducted
        })));
      }
      await sb.from('disp_items').update({ dispensed_quantity: it.requested_quantity }).eq('id', item.id);
    }

    await sb.from('disp_orders').update({ status: 'finalized', finalized_at: new Date().toISOString() }).eq('id', order.id);

    if (errors.length) alert('⚠ خطاها:\n' + errors.join('\n'));
    else toast('✅ تحویل انجام شد', 'success');

    state.items = [];
    state.patient = { name:'', national:'', presc:'', doctor:'' };
    openDispense();
  } catch (e) {
    alert('❌ ' + e.message);
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> تحویل نهایی';
  }
}