import { sb } from './sb.js';
import { $, escapeHtml, todayJalali, jalaliToGregorian, gregorianToJalali, checkExpiry, toast } from './utils.js';

// ═══ مودال تعداد ═══
let qtyModal = null;
let qtyResolve = null;
let qtyShowExtras = true;

function ensureQtyModal() {
  if (!qtyModal) qtyModal = new bootstrap.Modal($('qtyModal'));
}

export function askQty(opts) {
  ensureQtyModal();
  return new Promise((resolve) => {
    qtyResolve = resolve;
    qtyShowExtras = opts.showExtras !== false;
    $('qmTitle').textContent = opts.title || 'ثبت تعداد';
    $('qmHeader').className = 'modal-header ' + (opts.headerClass || 'bg-primary text-white');
    $('qmDrugName').textContent = opts.drugName || '';
    $('qmExtraInfo').innerHTML = opts.extraInfo || '';
    $('qmQty').value = opts.defaultQty ?? 1;
    $('qmExpiry').value = opts.defaultExpiry || todayJalali();
    $('qmBatch').value = opts.defaultBatch || '';
    $('qmExtraFields').style.display = qtyShowExtras ? '' : 'none';
    $('qmWarnings').innerHTML = opts.warnings || '';
    updateQmExpiryHint();
    qtyModal.show();
    setTimeout(() => { $('qmQty').focus(); $('qmQty').select(); }, 300);
  });
}

function updateQmExpiryHint() {
  const v = $('qmExpiry').value.trim();
  const hint = $('qmShamsi');
  const badge = $('qmExpiryBadge');
  hint.textContent = '';
  badge.innerHTML = '';
  $('qmExpiry').classList.remove('expiry-warn', 'expiry-caution');
  if (!v) return;

  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(v)) {
    const g = jalaliToGregorian(v);
    if (g) { hint.textContent = 'میلادی: ' + g; applyExpiryWarning(g); }
    else hint.textContent = '⚠️ تاریخ نامعتبر';
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const j = gregorianToJalali(v);
    if (j) hint.textContent = 'شمسی: ' + j;
    applyExpiryWarning(v);
  } else {
    hint.textContent = 'فرمت: YYYY-MM-DD';
  }
}

function applyExpiryWarning(greg) {
  const chk = checkExpiry(greg);
  const badge = $('qmExpiryBadge');
  if (!chk || chk.level === 'ok') {
    badge.innerHTML = chk ? `<span class="badge-soft success">${chk.msg}</span>` : '';
    return;
  }
  if (chk.level === 'expired' || chk.level === 'danger') {
    $('qmExpiry').classList.add('expiry-warn');
    badge.innerHTML = `<span class="badge-soft danger">${chk.msg}</span>`;
  } else {
    $('qmExpiry').classList.add('expiry-caution');
    badge.innerHTML = `<span class="badge-soft warning">${chk.msg}</span>`;
  }
}

export function initQtyModal() {
  ensureQtyModal();
  $('qmExpiry').addEventListener('input', updateQmExpiryHint);
  $('qmMinus').onclick = () => $('qmQty').value = Math.max(0, (+$('qmQty').value || 0) - 1);
  $('qmPlus').onclick  = () => $('qmQty').value = (+$('qmQty').value || 0) + 1;
  document.querySelectorAll('.qm-quick').forEach(b => b.onclick = () => $('qmQty').value = b.dataset.n);
  ['qmQty', 'qmExpiry', 'qmBatch'].forEach(id => {
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('qmSave').click(); });
  });
  $('qmSave').onclick = () => {
    if (!qtyResolve) return;
    const qty = parseInt($('qmQty').value, 10);
    if (isNaN(qty) || qty < 0) { toast('تعداد نامعتبر', 'warning'); return; }
    const res = { qty };
    if (qtyShowExtras) {
      let expG = $('qmExpiry').value.trim();
      if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(expG)) {
        expG = jalaliToGregorian(expG);
        if (!expG) { toast('تاریخ نامعتبر', 'warning'); return; }
      } else if (expG && !/^\d{4}-\d{2}-\d{2}$/.test(expG)) {
        toast('تاریخ نامعتبر. مثال: 2027-03-15', 'warning');
        return;
      }
      res.expiry_gregorian = expG || null;
      res.expiry_jalali = expG ? gregorianToJalali(expG) : '';
      res.batch = $('qmBatch').value.trim();
    }
    const cb = qtyResolve;
    qtyResolve = null;
    qtyModal.hide();
    cb(res);
  };
}

// ═══ مودال جستجوی دارو ═══
let searchModal = null;
let searchCallback = null;
let searchTimer = null;

function ensureSearchModal() {
  if (!searchModal) searchModal = new bootstrap.Modal($('searchModal'));
}

export function openDrugSearch(info, cb) {
  ensureSearchModal();
  searchCallback = cb;
  $('smInfo').innerHTML = info || '';
  $('smQuery').value = '';
  $('smResults').innerHTML = '<div class="text-center muted small py-3">حداقل ۲ حرف تایپ کنید</div>';
  searchModal.show();
  setTimeout(() => $('smQuery').focus(), 300);
}

export function initSearchModal() {
  ensureSearchModal();
  $('smQuery').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => doSearch(e.target.value.trim()), 300);
  });
  window._pickDrug = (drug) => {
    searchModal.hide();
    if (searchCallback) searchCallback(drug);
  };
}

async function doSearch(q) {
  if (q.length < 2) {
    $('smResults').innerHTML = '<div class="text-center muted small py-3">حداقل ۲ حرف</div>';
    return;
  }
  $('smResults').innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></div>';
  const { data } = await sb.from('drugs_drug').select('id, name, form').ilike('name', `%${q}%`).limit(20);
  if (!data?.length) {
    $('smResults').innerHTML = '<div class="text-center muted small py-3">یافت نشد</div>';
    return;
  }
  $('smResults').innerHTML = data.map(d => `
    <button class="w-100 text-end mb-2 p-3"
            style="background:#f8fafc;border:1.5px solid var(--border);border-radius:12px;"
            onclick='window._pickDrug(${JSON.stringify(d).replace(/'/g,"&#39;")})'>
      <div style="font-weight:700;">${escapeHtml(d.name)}</div>
      <div class="muted small">${escapeHtml(d.form || '')}</div>
    </button>
  `).join('');
}