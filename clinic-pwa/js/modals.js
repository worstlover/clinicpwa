import { sb } from './sb.js';
import { $, escapeHtml, gregorianToJalali, jalaliToGregorian, checkExpiry, toast } from './utils.js';

let qtyModal = null;
let qtyResolve = null;
let qtyShowExtras = true;
let qtyBatchCheckFn = null;

function ensureQtyModal() {
  if (!qtyModal) qtyModal = new bootstrap.Modal($('qtyModal'));
}

export function askQty(opts) {
  ensureQtyModal();
  return new Promise((resolve) => {
    qtyResolve = resolve;
    qtyShowExtras = opts.showExtras !== false;
    qtyBatchCheckFn = opts.batchCheckFn || null;
    $('qmTitle').textContent = opts.title || 'ثبت تعداد';
    $('qmHeader').className = 'modal-header ' + (opts.headerClass || 'bg-primary text-white');
    $('qmDrugName').textContent = opts.drugName || '';
    $('qmExtraInfo').innerHTML = opts.extraInfo || '';
    $('qmQty').value = opts.defaultQty ?? 1;
    $('qmExpiry').value = opts.defaultExpiry || '';
    $('qmBatch').value = opts.defaultBatch || '';
    $('qmExtraFields').style.display = qtyShowExtras ? '' : 'none';
    $('qmWarnings').innerHTML = opts.warnings || '';
    const batchInfoEl = $('qmBatchInfo');
    if (batchInfoEl) batchInfoEl.innerHTML = '';
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
  hint.style.color = '#64748b';
  badge.innerHTML = '';
  $('qmExpiry').classList.remove('expiry-warn', 'expiry-caution');

  const batchInfoEl = $('qmBatchInfo');

  if (!v) {
    hint.textContent = 'قالب: سال-ماه-روز | مثال: 2027-03-15';
    if (batchInfoEl) batchInfoEl.innerHTML = '';
    return;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const j = gregorianToJalali(v);
    if (j) { hint.textContent = `شمسی معادل: ${j}`; hint.style.color = '#0d6efd'; }
    applyExpiryWarning(v);
    if (qtyBatchCheckFn && batchInfoEl) {
      batchInfoEl.innerHTML = '<div class="text-center py-2"><div class="spinner-border spinner-border-sm text-primary"></div></div>';
      qtyBatchCheckFn(v).then(html => {
        batchInfoEl.innerHTML = html || '';
      }).catch(() => {
        batchInfoEl.innerHTML = '';
      });
    }
    return;
  }

  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(v)) {
    const g = jalaliToGregorian(v);
    if (g) {
      hint.textContent = `میلادی معادل: ${g} (Enter برای ثبت)`;
      hint.style.color = '#d97706';
      applyExpiryWarning(g);
      if (qtyBatchCheckFn && batchInfoEl) {
        batchInfoEl.innerHTML = '<div class="text-center py-2"><div class="spinner-border spinner-border-sm text-primary"></div></div>';
        qtyBatchCheckFn(g).then(html => {
          batchInfoEl.innerHTML = html || '';
        }).catch(() => {
          batchInfoEl.innerHTML = '';
        });
      }
    } else {
      hint.textContent = 'تاریخ شمسی نامعتبر';
      hint.style.color = '#dc3545';
    }
    return;
  }

  hint.textContent = 'قالب صحیح: YYYY-MM-DD | مثال: 2027-03-15';
  hint.style.color = '#dc3545';
  if (batchInfoEl) batchInfoEl.innerHTML = '';
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
      let raw = $('qmExpiry').value.trim();
      let expG = raw;
      if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(raw)) {
        expG = jalaliToGregorian(raw);
        if (!expG) { toast('تاریخ شمسی نامعتبر', 'warning'); return; }
      } else if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        toast('تاریخ نامعتبر. مثال: 2027-03-15', 'warning');
        return;
      }
      res.expiry_gregorian = expG || null;
      res.expiry_jalali = expG ? gregorianToJalali(expG) : '';
      res.batch = $('qmBatch').value.trim();
    }
    const cb = qtyResolve;
    qtyResolve = null;
    qtyBatchCheckFn = null;
    qtyModal.hide();
    cb(res);
  };
}

// ═══════════════════════════════════════════════════════
// جستجوی دارو
// ═══════════════════════════════════════════════════════
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
