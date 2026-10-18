// js/modals.js
import { sb } from './sb.js';
import { $, escapeHtml, gregorianToJalali, jalaliToGregorian, checkExpiry, toast } from './utils.js';

// ═══════════════════════════════════════════════════════
// ۱. مودال تعداد (askQty)
// ═══════════════════════════════════════════════════════
let qtyModal = null;
let qtyResolve = null;
let qtyShowExtras = true;
let qtyBatchCheckFn = null;
let qtyHideBatchInput = false;
let qtyRequireExpiry = false;

function ensureQtyModal() {
  if (!qtyModal) qtyModal = new bootstrap.Modal($('qtyModal'));
}

export function askQty(opts = {}) {
  ensureQtyModal();
  return new Promise((resolve) => {
    qtyResolve = resolve;
    qtyShowExtras = opts.showExtras !== false;
    qtyBatchCheckFn = opts.batchCheckFn || null;
    qtyHideBatchInput = !!opts.hideBatchInput;
    qtyRequireExpiry = !!opts.requireExpiry;

    $('qmTitle').textContent = opts.title || 'ثبت تعداد';
    $('qmHeader').className = 'modal-header ' + (opts.headerClass || 'bg-primary text-white');
    $('qmDrugName').textContent = opts.drugName || '';
    $('qmExtraInfo').innerHTML = opts.extraInfo || '';
    $('qmQty').value = opts.defaultQty ?? 1;
    $('qmExpiry').value = opts.defaultExpiry || '';
    $('qmBatch').value = '';
    $('qmExtraFields').style.display = qtyShowExtras ? '' : 'none';

    setBatchVisibility(!qtyHideBatchInput && qtyShowExtras);
    markExpiryRequired(qtyRequireExpiry && qtyShowExtras);

    $('qmWarnings').innerHTML = opts.warnings || '';
    const batchInfoEl = $('qmBatchInfo');
    if (batchInfoEl) batchInfoEl.innerHTML = '';
    
    updateQmExpiryHint();
    qtyModal.show();
    setTimeout(() => { $('qmQty').focus(); $('qmQty').select(); }, 300);
  });
}

function setBatchVisibility(visible) {
  const input = $('qmBatch');
  if (!input) return;
  const wrapper = input.closest('.qm-field, .form-group, .mb-3, .mb-2') || input.parentElement;
  if (wrapper && wrapper.id !== 'qmExtraFields' && wrapper.id !== 'qtyModal') {
    wrapper.style.display = visible ? '' : 'none';
  } else {
    input.style.display = visible ? '' : 'none';
    document.querySelectorAll('label[for="qmBatch"]').forEach(l => {
      l.style.display = visible ? '' : 'none';
    });
  }
}

function markExpiryRequired(required) {
  const label = document.querySelector('label[for="qmExpiry"]');
  if (!label) return;
  label.innerHTML = label.innerHTML.replace(/\s*<span class="req-star".*?<\/span>\s*$/, '').trim();
  if (required) {
    label.innerHTML += ' <span class="req-star" style="color:#dc3545;">*</span>';
  }
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

// ⭐ این تابع بود که خطا می‌داد. حالا به درستی export شده است.
export function initQtyModal() {
  ensureQtyModal();
  $('qmExpiry').addEventListener('input', updateQmExpiryHint);
  $('qmMinus').onclick = () => $('qmQty').value = Math.max(0, (+$('qmQty').value || 0) - 1);
  $('qmPlus').onclick  = () => $('qmQty').value = (+$('qmQty').value || 0) + 1;
  
  document.querySelectorAll('.qm-quick').forEach(b => b.onclick = () => $('qmQty').value = b.dataset.n);
  
  ['qmQty', 'qmExpiry', 'qmBatch'].forEach(id => {
    const el = $(id);
    if (el) {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') $('qmSave').click(); });
    }
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

      if (qtyRequireExpiry && !expG) {
        toast('تاریخ انقضا الزامی است', 'warning');
        $('qmExpiry').focus();
        $('qmExpiry').classList.add('expiry-warn');
        return;
      }

      res.expiry_gregorian = expG || null;
      res.expiry_jalali = expG ? gregorianToJalali(expG) : '';
      res.batch = null; // بچ همیشه از سمت فرم نادیده گرفته می‌شود
    }

    const cb = qtyResolve;
    qtyResolve = null;
    qtyBatchCheckFn = null;
    qtyHideBatchInput = false;
    qtyRequireExpiry = false;
    qtyModal.hide();
    cb(res);
  };
}


// ═══════════════════════════════════════════════════════
// ۲. مودال جستجوی دارو (openDrugSearch)
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
  ensureAddNewButton();
  searchModal.show();
  setTimeout(() => $('smQuery').focus(), 300);
}

// ⭐ دکمه ثبت داروی جدید
function ensureAddNewButton() {
  if (document.getElementById('smAddNewBtn')) return;
  const results = $('smResults');
  if (!results || !results.parentElement) return;
  const btn = document.createElement('button');
  btn.id = 'smAddNewBtn';
  btn.type = 'button';
  btn.className = 'btn btn-outline-success w-100 mt-2';
  btn.innerHTML = '<i class="bi bi-plus-circle"></i> ثبت دارو جدید';
  btn.onclick = () => {
    const prefill = $('smQuery').value.trim();
    const cb = searchCallback;
    searchModal.hide();
    setTimeout(() => openNewDrugModal(prefill, (drug) => {
      if (cb) cb(drug);
    }), 250);
  };
  results.parentElement.appendChild(btn);
}

// ⭐ این تابع هم خطا می‌داد که حالا export شده است.
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

  const { data, error } = await sb.from('drugs_drug')
    .select('id, name, form')
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(20);

  if (error) {
    $('smResults').innerHTML = `<div class="alert alert-danger small py-2">${escapeHtml(error.message)}</div>`;
    return;
  }
  if (!data?.length) {
    $('smResults').innerHTML = `
      <div class="text-center muted small py-3">
        یافت نشد — می‌توانید داروی جدید ثبت کنید
      </div>`;
    return;
  }
  $('smResults').innerHTML = data.map(d => `
    <button class="w-100 text-end mb-2 p-3"
            style="background:#f8fafc;border:1.5px solid var(--border);border-radius:12px;"
            onclick='window._pickDrug(${JSON.stringify(d).replace(/'/g, "&#39;")})'>
      <div style="font-weight:700;">${escapeHtml(d.name)}</div>
      <div class="muted small">${escapeHtml(d.form || '')}</div>
    </button>
  `).join('');
}


// ═══════════════════════════════════════════════════════
// ۳. مودال ثبت دارو جدید (openNewDrugModal)
// ═══════════════════════════════════════════════════════
let newDrugModal = null;

function ensureNewDrugModal() {
  if (newDrugModal) return;

  if (!document.getElementById('newDrugModal')) {
    const el = document.createElement('div');
    el.className = 'modal fade';
    el.id = 'newDrugModal';
    el.tabIndex = -1;
    el.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header bg-success text-white">
            <h5 class="modal-title"><i class="bi bi-plus-circle"></i> ثبت دارو جدید</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label" for="ndmName">نام دارو <span style="color:#dc3545;">*</span></label>
              <input type="text" class="form-control" id="ndmName" autocomplete="off" dir="rtl" placeholder="مثال: بروفن">
              <small class="text-muted">نام باید یکتا باشد. شکل دارو را جدا انتخاب کنید.</small>
              <div id="ndmNameError" class="small mt-1" style="color:#dc3545;"></div>
            </div>

            <div class="mb-3">
              <label class="form-label" for="ndmForm">شکل دارویی <span style="color:#dc3545;">*</span></label>
              <div class="d-flex gap-2">
                <select class="form-select" id="ndmForm">
                  <option value="">در حال بارگذاری...</option>
                </select>
                <button type="button" class="btn btn-outline-secondary" id="ndmReloadForms" title="بارگذاری مجدد"><i class="bi bi-arrow-clockwise"></i></button>
              </div>
              <div class="mt-2">
                <input type="text" class="form-control form-control-sm" id="ndmNewForm" placeholder="یا شکل جدید وارد کنید..." dir="rtl">
                <small class="text-muted">اگر شکل موردنظر در لیست نیست، اینجا وارد کنید.</small>
              </div>
            </div>

            <div class="mb-2">
              <label class="form-label">پیش‌نمایش:</label>
              <div class="badge-soft primary w-100 text-center py-2" id="ndmPreview" style="justify-content:center;font-size:0.95rem;">—</div>
            </div>

            <div id="ndmError" class="alert alert-danger py-2 small d-none"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">انصراف</button>
            <button type="button" class="btn btn-success" id="ndmSave"><i class="bi bi-check2"></i> ذخیره</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(el);
  }

  newDrugModal = new bootstrap.Modal($('newDrugModal'));

  $('ndmName').addEventListener('input', updateNewDrugPreview);
  $('ndmForm').addEventListener('change', updateNewDrugPreview);
  $('ndmNewForm').addEventListener('input', updateNewDrugPreview);
  $('ndmReloadForms').onclick = () => loadFormOptions(true);
  $('ndmSave').onclick = saveNewDrug;
}

function updateNewDrugPreview() {
  const name = $('ndmName').value.trim();
  const formSel = $('ndmForm').value.trim();
  const formNew = $('ndmNewForm').value.trim();
  const form = formNew || formSel;
  const preview = $('ndmPreview');
  const nameErr = $('ndmNameError');

  preview.textContent = (name && form) ? `${name} ${form}` : (name || form || '—');

  if (name.length >= 2) {
    sb.from('drugs_drug').select('id, name, form').eq('name', name).then(({ data }) => {
      if (data && data.length) {
        const sameForm = data.some(d => (d.form || '').trim() === form);
        if (sameForm && form) {
          nameErr.textContent = `⚠️ «${name} ${form}» قبلاً ثبت شده است.`;
        } else if (data.length && !form) {
          nameErr.textContent = `نام «${name}» قبلاً ثبت شده (${data.map(d => d.form || 'بدون شکل').join('، ')})`;
        } else {
          nameErr.textContent = '';
        }
      } else {
        nameErr.textContent = '';
      }
    });
  } else {
    nameErr.textContent = '';
  }
}

export async function openNewDrugModal(prefillName = '', cb) {
  ensureNewDrugModal();
  $('ndmName').value = prefillName || '';
  $('ndmForm').value = '';
  $('ndmNewForm').value = '';
  $('ndmError').classList.add('d-none');
  $('ndmError').textContent = '';
  $('ndmNameError').textContent = '';
  $('ndmPreview').textContent = prefillName || '—';
  newDrugModal._cb = cb;

  $('ndmForm').dataset.loaded = '';
  await loadFormOptions(true);

  newDrugModal.show();
  setTimeout(() => $('ndmName').focus(), 300);
}

async function loadFormOptions(force) {
  const sel = $('ndmForm');
  if (!force && sel.dataset.loaded === '1') return;
  sel.innerHTML = '<option value="">در حال بارگذاری...</option>';
  try {
    const { data, error } = await sb.from('drugs_drug').select('form').not('form', 'is', null).neq('form', '');
    if (error) throw error;

    const formsSet = new Set();
    (data || []).forEach(f => {
      const raw = (f.form || '').trim();
      if (!raw) return;
      const persian = extractPersianForm(raw);
      if (persian) formsSet.add(persian);
    });

    const forms = [...formsSet].sort();

    if (!forms.length) {
      sel.innerHTML = '<option value="">— شکل جدید وارد کنید —</option>';
    } else {
      sel.innerHTML = '<option value="">-- انتخاب کنید --</option>' +
        forms.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');
    }
    sel.dataset.loaded = '1';
  } catch (e) {
    console.error('[NEW-DRUG] loadFormOptions error:', e);
    sel.innerHTML = '<option value="">— خطا — شکل جدید وارد کنید —</option>';
  }
}

function extractPersianForm(raw) {
  if (!raw) return '';
  const parts = String(raw).split(/__|::|\||؛|;/).map(p => p.trim()).filter(Boolean);
  for (const p of parts) {
    if (/[\u0600-\u06FF]/.test(p)) {
      return p;
    }
  }
  if (/[\u0600-\u06FF]/.test(raw)) return raw;
  return '';
}

async function saveNewDrug() {
  const name = $('ndmName').value.trim();
  const formSel = $('ndmForm').value.trim();
  const formNew = $('ndmNewForm').value.trim();
  const form = formNew || formSel;

  const errEl = $('ndmError');
  errEl.classList.add('d-none');
  errEl.textContent = '';

  if (!name || name.length < 2) {
    errEl.textContent = 'نام دارو باید حداقل ۲ حرف باشد';
    errEl.classList.remove('d-none');
    return;
  }
  if (!form) {
    errEl.textContent = 'شکل دارویی را انتخاب یا وارد کنید';
    errEl.classList.remove('d-none');
    return;
  }

  const saveBtn = $('ndmSave');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> ذخیره...';

  try {
    const { data: existing, error: eChk } = await sb.from('drugs_drug').select('id, name, form').eq('name', name);
    if (eChk) throw eChk;

    const dup = (existing || []).find(d => (d.form || '').trim() === form);
    if (dup) {
      errEl.textContent = `⚠️ «${name} ${form}» قبلاً ثبت شده است (کد ${dup.id})`;
      errEl.classList.remove('d-none');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="bi bi-check2"></i> ذخیره';
      return;
    }

    const { data: inserted, error: eIns } = await sb.from('drugs_drug')
      .insert({ name, form }).select('id, name, form').single();
    if (eIns) throw eIns;

    toast(`✅ «${name} ${form}» ثبت شد`, 'success');

    const cb = newDrugModal._cb;
    newDrugModal.hide();
    newDrugModal._cb = null;
    if (cb) setTimeout(() => cb(inserted), 250);
  } catch (e) {
    console.error('[NEW-DRUG] save error:', e);
    errEl.textContent = 'خطا در ذخیره: ' + (e.message || 'نامشخص');
    errEl.classList.remove('d-none');
  }

  saveBtn.disabled = false;
  saveBtn.innerHTML = '<i class="bi bi-check2"></i> ذخیره';
}
// js/modals.js
// ⭐ تابع جدید برای انتخاب تاریخ از بین چند تاریخ
export function promptExpirySelection(dates) {
  return new Promise((resolve) => {
    const modalId = 'expirySelectionModal';
    document.getElementById(modalId)?.remove();

    const html = `
      <div class="modal fade" id="${modalId}" tabindex="-1" data-bs-backdrop="static">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header bg-warning text-dark">
              <h5 class="modal-title"><i class="bi bi-exclamation-triangle-fill"></i> چند تاریخ انقضا معتبر یافت شد</h5>
            </div>
            <div class="modal-body">
              <p class="small text-muted mb-3">
                در بارکد اسکن شده، بیش از یک تاریخ انقضا وجود دارد. لطفاً تاریخ صحیح را انتخاب کنید (تاریخ اصلی به میلادی است):
              </p>
              <div class="d-flex flex-column gap-2" id="expiryOptionsList">
                ${dates.map((d, i) => `
                  <button type="button" class="btn btn-outline-primary text-start p-3 w-100" data-date="${d}">
                    <div class="fw-bold" style="direction: ltr; text-align: left; font-size: 1.2rem; letter-spacing: 1px;">${d}</div>
                    <div class="small text-muted mt-1" style="direction: rtl; text-align: right; font-size: 0.9rem;">
                      <i class="bi bi-calendar3"></i> معادل شمسی: <strong>${gregorianToJalali(d)}</strong>
                    </div>
                  </button>
                `).join('')}
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-light w-100" id="expiryCancelBtn">انصراف از اسکن</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const modalEl = document.getElementById(modalId);
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    modalEl.querySelectorAll('[data-date]').forEach(btn => {
      btn.onclick = () => {
        const selected = btn.dataset.date;
        modal.hide();
        setTimeout(() => modalEl.remove(), 300);
        resolve(selected);
      };
    });

    modalEl.querySelector('#expiryCancelBtn').onclick = () => {
      modal.hide();
      setTimeout(() => modalEl.remove(), 300);
      resolve(null); 
    };
  });
}
