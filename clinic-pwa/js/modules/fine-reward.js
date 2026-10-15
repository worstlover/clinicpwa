// js/modules/fine-reward.js
import { sb } from '../sb.js';
import { $, toast, escapeHtml, gregorianToJalali, jalaliToGregorian, todayJalali } from '../utils.js';

// ═══════════════════════════════════════════════════════
// ابزارها
// ═══════════════════════════════════════════════════════
function showScreenDirect(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen' + name);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
}

// تبدیل ارقام فارسی به انگلیسی
const toEnDigits = (s) => String(s || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const toFaDigits = (s) => String(s || '').replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

// ═══════════════════════════════════════════════════════
// ورودی اصلی
// ═══════════════════════════════════════════════════════
export function openFineReward() {
  showScreenDirect('FineReward');
  const wrap = $('fineRewardContent');
  if (!wrap) return;

  wrap.innerHTML = `
    <div class="fr-page">
      <div class="fr-header">
        <div class="fr-title">مدیریت جریمه و تشویقی</div>
        <div class="fr-sub">ثبت و مشاهده سوابق ایمنی پرسنل</div>
      </div>

      <div class="fr-tabs">
        <button class="fr-tab active" data-tab="list">
          <i class="bi bi-list-ul"></i> لیست سوابق
        </button>
        <button class="fr-tab" data-tab="add">
          <i class="bi bi-plus-circle"></i> ثبت جدید
        </button>
      </div>

      <div id="frBody"></div>
    </div>
  `;

  wrap.querySelectorAll('.fr-tab').forEach(btn => {
    btn.onclick = () => {
      wrap.querySelectorAll('.fr-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.tab === 'list') renderList();
      else renderAddForm();
    };
  });

  renderList();
}

// ═══════════════════════════════════════════════════════
// لیست سوابق
// ═══════════════════════════════════════════════════════
async function renderList() {
  const body = $('frBody');
  body.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>';

  try {
    const { data, error } = await sb.from('safety_finereward')
      .select('*, patient:core_patient(first_name, last_name, personnel_number, company_id)')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    if (!data?.length) {
      body.innerHTML = `
        <div class="fr-empty">
          <i class="bi bi-inbox"></i>
          <div class="fr-empty-title">سابقه‌ای ثبت نشده</div>
          <div class="fr-empty-sub">از تب «ثبت جدید» اولین مورد رو اضافه کن</div>
        </div>`;
      return;
    }

    body.innerHTML = `
      <div class="fr-list">
        ${data.map(item => renderListItem(item)).join('')}
      </div>
    `;

    body.querySelectorAll('[data-fr-id]').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.frId;
        const item = data.find(x => String(x.id) === String(id));
        if (item) openDetail(item);
      };
    });
  } catch (e) {
    console.error('[FR] load error:', e);
    body.innerHTML = `<div class="alert alert-danger">خطا در دریافت داده‌ها: ${escapeHtml(e.message)}</div>`;
  }
}

function renderListItem(item) {
  const type = item.record_type;
  const meta = {
    fine:    { label: 'جریمه',   cls: 'danger',  icon: 'bi-exclamation-circle-fill' },
    reward:  { label: 'تشویقی',  cls: 'success', icon: 'bi-award-fill' },
    warning: { label: 'اخطار',   cls: 'warning', icon: 'bi-exclamation-triangle-fill' },
  }[type] || { label: '—', cls: 'gray', icon: 'bi-file-earmark' };

  const name = item.patient
    ? `${item.patient.first_name || ''} ${item.patient.last_name || ''}`.trim()
    : '—';
  const personnel = item.patient?.personnel_number || '';
  const dateStr = item.incident_datetime
    ? gregorianToJalali(item.incident_datetime.split('T')[0])
    : '—';

  return `
    <button class="fr-item ${meta.cls}" data-fr-id="${item.id}">
      <div class="fr-item-icon ${meta.cls}">
        <i class="bi ${meta.icon}"></i>
      </div>
      <div class="fr-item-body">
        <div class="fr-item-head">
          <span class="fr-item-type ${meta.cls}">${meta.label}</span>
          <span class="fr-item-date">${escapeHtml(dateStr)}</span>
        </div>
        <div class="fr-item-name">${escapeHtml(name)}</div>
        ${personnel ? `<div class="fr-item-personnel"><i class="bi bi-hash"></i> ${escapeHtml(personnel)}</div>` : ''}
        <div class="fr-item-reason">${escapeHtml(item.reason || '—')}</div>
        ${item.amount ? `<div class="fr-item-amount">${Number(item.amount).toLocaleString('fa-IR')} ریال</div>` : ''}
      </div>
      <i class="bi bi-chevron-left fr-item-arrow"></i>
    </button>
  `;
}

function openDetail(item) {
  const type = item.record_type;
  const typeFa = { fine: 'جریمه', reward: 'تشویقی', warning: 'اخطار' }[type] || '—';
  const name = item.patient
    ? `${item.patient.first_name || ''} ${item.patient.last_name || ''}`.trim()
    : '—';

  const sheet = document.createElement('div');
  sheet.className = 'fr-sheet';
  sheet.innerHTML = `
    <div class="fr-sheet-handle"></div>
    <div class="fr-sheet-title">${typeFa}</div>
    <div class="fr-detail-row"><span>نام کارگر:</span><b>${escapeHtml(name)}</b></div>
    <div class="fr-detail-row"><span>کد پرسنلی:</span><b dir="ltr">${escapeHtml(item.patient?.personnel_number || '—')}</b></div>
    <div class="fr-detail-row"><span>تاریخ رویداد:</span><b>${escapeHtml(item.incident_datetime ? gregorianToJalali(item.incident_datetime.split('T')[0]) : '—')}</b></div>
    <div class="fr-detail-row"><span>محل ثبت:</span><b>${escapeHtml(item.location || '—')}</b></div>
    <div class="fr-detail-row"><span>محل جریمه:</span><b>${escapeHtml(item.incident_location || '—')}</b></div>
    <div class="fr-detail-row"><span>علت:</span><b>${escapeHtml(item.reason || '—')}</b></div>
    ${item.amount ? `<div class="fr-detail-row"><span>مبلغ:</span><b>${Number(item.amount).toLocaleString('fa-IR')} ریال</b></div>` : ''}
    <button class="btn btn-light w-100 mt-3" id="frCloseSheet">بستن</button>
  `;

  const backdrop = document.createElement('div');
  backdrop.className = 'fr-backdrop';
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);

  const close = () => {
    backdrop.classList.add('closing');
    setTimeout(() => backdrop.remove(), 200);
  };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  sheet.querySelector('#frCloseSheet').onclick = close;
}

// ═══════════════════════════════════════════════════════
// فرم ثبت جدید
// ═══════════════════════════════════════════════════════
function renderAddForm() {
  const body = $('frBody');
  body.innerHTML = `
    <div class="fr-form">
      <div class="fr-field">
        <label>نوع</label>
        <div class="fr-type-grid">
          <button class="fr-type-btn danger" data-type="fine"><i class="bi bi-exclamation-circle-fill"></i> جریمه</button>
          <button class="fr-type-btn success" data-type="reward"><i class="bi bi-award-fill"></i> تشویقی</button>
          <button class="fr-type-btn warning" data-type="warning"><i class="bi bi-exclamation-triangle-fill"></i> اخطار</button>
        </div>
        <input type="hidden" id="frType" value="fine">
      </div>

      <div class="fr-field">
        <label>جستجوی کارگر</label>
        <div class="fr-search-wrap">
          <i class="bi bi-search"></i>
          <input type="text" id="frWorkerSearch" placeholder="نام، کد ملی یا کد پرسنلی..." autocomplete="off" inputmode="text">
        </div>
        <div id="frWorkerResults" class="fr-worker-results"></div>
        <div id="frSelectedWorker" class="fr-selected-worker" style="display:none;"></div>
      </div>

      <div class="fr-field">
        <label>محل ثبت</label>
        <input type="text" class="form-control" id="frLocation" placeholder="مثال: واحد HSE / دفتر مدیریت">
      </div>

      <div class="fr-field">
        <label>محل جریمه / حادثه</label>
        <input type="text" class="form-control" id="frIncidentLocation" placeholder="مثال: خط تولید / انبار">
      </div>

      <div class="fr-field">
        <label>تاریخ و ساعت رویداد</label>
        <input type="text" class="form-control" id="frDate" value="${todayJalali()}" placeholder="1404/01/01" dir="ltr">
        <input type="text" class="form-control mt-2" id="frTime" value="12:00" placeholder="12:00" dir="ltr">
      </div>

      <div class="fr-field">
        <label>علت</label>
        <textarea class="form-control" id="frReason" rows="3" placeholder="توضیح علت..."></textarea>
      </div>

      <div class="fr-field">
        <label>مبلغ (ریال)</label>
        <input type="text" class="form-control" id="frAmount" value="0" dir="ltr" inputmode="numeric">
      </div>

      <button class="btn btn-primary w-100 fr-save-btn" id="frSave">
        <i class="bi bi-check-circle"></i> ثبت
      </button>
    </div>
  `;

  bindTypeButtons();
  bindWorkerSearch();
  $('frSave').onclick = saveRecord;
}

function bindTypeButtons() {
  document.querySelectorAll('.fr-type-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.fr-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('frType').value = btn.dataset.type;
    };
  });
  // فعال کردن پیش‌فرض
  document.querySelector('.fr-type-btn[data-type="fine"]')?.classList.add('active');
}

// ═══════════════════════════════════════════════════════
// جستجوی کارگر — با پشتیبانی از ارقام فارسی
// ═══════════════════════════════════════════════════════
let searchTimer = null;
function bindWorkerSearch() {
  const input = $('frWorkerSearch');
  const resultsEl = $('frWorkerResults');
  const selectedEl = $('frSelectedWorker');

  input.addEventListener('input', () => {
    // پاک کردن انتخاب قبلی وقتی کاربر دوباره تایپ می‌کنه
    if (selectedEl.style.display !== 'none') {
      selectedEl.style.display = 'none';
      selectedEl.innerHTML = '';
      delete input.dataset.workerId;
    }

    clearTimeout(searchTimer);
    const raw = input.value.trim();
    if (raw.length < 2) { resultsEl.innerHTML = ''; return; }

    // تبدیل ارقام فارسی به انگلیسی برای جستجو
    const q = toEnDigits(raw);
    resultsEl.innerHTML = '<div class="fr-loading"><div class="spinner-border spinner-border-sm text-primary"></div> در حال جستجو...</div>';

    searchTimer = setTimeout(async () => {
      try {
        const { data, error } = await sb.from('core_patient')
          .select('id, first_name, last_name, personnel_number, national_code, phone_number, company:core_company(name)')
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,personnel_number.ilike.%${q}%,national_code.ilike.%${q}%`)
          .limit(10);

        if (error) throw error;

        if (!data?.length) {
          resultsEl.innerHTML = '<div class="fr-no-result">کارگری یافت نشد</div>';
          return;
        }

        resultsEl.innerHTML = data.map(p => `
          <button class="fr-worker-card" data-id="${p.id}"
            data-name="${escapeHtml((p.first_name || '') + ' ' + (p.last_name || ''))}"
            data-personnel="${escapeHtml(p.personnel_number || '')}"
            data-national="${escapeHtml(p.national_code || '')}"
            data-phone="${escapeHtml(p.phone_number || '')}">
            <div class="fr-worker-avatar">${escapeHtml((p.first_name || '?')[0] || '?')}</div>
            <div class="fr-worker-info">
              <div class="fr-worker-name">${escapeHtml((p.first_name || '') + ' ' + (p.last_name || ''))}</div>
              <div class="fr-worker-meta">
                ${p.personnel_number ? `<span><i class="bi bi-hash"></i> ${escapeHtml(p.personnel_number)}</span>` : ''}
                ${p.company?.name ? `<span><i class="bi bi-building"></i> ${escapeHtml(p.company.name)}</span>` : ''}
              </div>
            </div>
            <i class="bi bi-chevron-left"></i>
          </button>
        `).join('');

        resultsEl.querySelectorAll('.fr-worker-card').forEach(card => {
          card.onclick = () => selectWorker(card, input, resultsEl, selectedEl);
        });
      } catch (err) {
        console.error('[FR] search error:', err);
        resultsEl.innerHTML = `<div class="alert alert-danger py-2 small">${escapeHtml(err.message)}</div>`;
      }
    }, 300);
  });
}

async function selectWorker(card, input, resultsEl, selectedEl) {
  const id = card.dataset.id;
  let name = card.dataset.name;
  let personnel = card.dataset.personnel;
  const national = card.dataset.national;
  const phone = card.dataset.phone;

  // اگه کد ملی یا تلفن ثبت نشده، از کاربر بخواه وارد کنه
  if (!national || !phone) {
    openMissingInfoModal({
      patientId: id,
      name,
      missingFields: {
        national_code: !national,
        phone_number: !phone,
      },
      onSave: async (updated) => {
        // ذخیره در دیتابیس
        const update = {};
        if (updated.national_code) update.national_code = updated.national_code;
        if (updated.phone_number) update.phone_number = updated.phone_number;
        if (Object.keys(update).length) {
          await sb.from('core_patient').update(update).eq('id', id);
        }
        // ذخیره‌ی انتخاب
        input.value = name;
        input.dataset.workerId = id;
        resultsEl.innerHTML = '';
        selectedEl.style.display = 'block';
        selectedEl.innerHTML = `
          <div class="fr-selected-inner">
            <i class="bi bi-check-circle-fill"></i>
            <div>
              <div class="fr-selected-name">${escapeHtml(name)}</div>
              <div class="fr-selected-meta">${personnel ? 'کد پرسنلی: ' + escapeHtml(personnel) : ''}</div>
            </div>
          </div>
        `;
      }
    });
    return;
  }

  // اطلاعات کامله — مستقیم انتخاب کن
  input.value = name;
  input.dataset.workerId = id;
  resultsEl.innerHTML = '';
  selectedEl.style.display = 'block';
  selectedEl.innerHTML = `
    <div class="fr-selected-inner">
      <i class="bi bi-check-circle-fill"></i>
      <div>
        <div class="fr-selected-name">${escapeHtml(name)}</div>
        <div class="fr-selected-meta">${personnel ? 'کد پرسنلی: ' + escapeHtml(personnel) : ''}</div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
// مودال ورود اطلاعات ناقص
// ═══════════════════════════════════════════════════════
function openMissingInfoModal({ patientId, name, missingFields, onSave }) {
  const modal = document.createElement('div');
  modal.className = 'fr-modal-backdrop';
  modal.innerHTML = `
    <div class="fr-modal">
      <div class="fr-modal-title">تکمیل اطلاعات کارگر</div>
      <div class="fr-modal-sub">اطلاعات زیر برای <b>${escapeHtml(name)}</b> ثبت نشده است. لطفاً وارد کنید:</div>

      ${missingFields.national_code ? `
        <div class="fr-field">
          <label>کد ملی</label>
          <input type="text" class="form-control" id="frMissingNational" dir="ltr" inputmode="numeric" maxlength="10">
        </div>` : ''}

      ${missingFields.phone_number ? `
        <div class="fr-field">
          <label>شماره تلفن</label>
          <input type="text" class="form-control" id="frMissingPhone" dir="ltr" inputmode="numeric" maxlength="11">
        </div>` : ''}

      <div class="fr-modal-actions">
        <button class="btn btn-light" id="frMissingCancel">انصراف</button>
        <button class="btn btn-primary" id="frMissingSave">ذخیره</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#frMissingCancel').onclick = () => modal.remove();
  modal.querySelector('#frMissingSave').onclick = async () => {
    const updated = {};
    const natEl = modal.querySelector('#frMissingNational');
    const phEl = modal.querySelector('#frMissingPhone');
    if (natEl) updated.national_code = toEnDigits(natEl.value.trim());
    if (phEl) updated.phone_number = toEnDigits(phEl.value.trim());
    await onSave(updated);
    modal.remove();
  };
}

// ═══════════════════════════════════════════════════════
// ذخیره‌ی رکورد
// ═══════════════════════════════════════════════════════
async function saveRecord() {
  const input = $('frWorkerSearch');
  const workerId = input.dataset.workerId;
  if (!workerId) { toast('ابتدا کارگر را از لیست انتخاب کنید', 'warning'); return; }

  const reason = $('frReason').value.trim();
  if (!reason) { toast('علت را وارد کنید', 'warning'); return; }

  const dateStr = $('frDate').value.trim();
  const timeStr = $('frTime').value.trim() || '12:00';
  const gregDate = jalaliToGregorian(dateStr);
  if (!gregDate) { toast('تاریخ نامعتبر است', 'warning'); return; }

  // ترکیب تاریخ و ساعت به ISO
  const isoDT = new Date(`${gregDate}T${timeStr}:00`).toISOString();

  const amount = parseInt(toEnDigits($('frAmount').value), 10) || 0;

  const { data: { user } } = await sb.auth.getUser();

  const record = {
    worker_id: parseInt(workerId, 10),
    record_type: $('frType').value,
    location: $('frLocation').value.trim(),
    incident_location: $('frIncidentLocation').value.trim(),
    incident_datetime: isoDT,
    reason,
    amount,
    recorded_by: user?.id || null,
  };

  try {
    const { error } = await sb.from('safety_finereward').insert(record);
    if (error) throw error;
    toast('✅ با موفقیت ثبت شد', 'success');
    // پاک کردن فرم
    $('frBody').innerHTML = '';
    // رفتن به تب لیست
    document.querySelector('.fr-tab[data-tab="list"]').click();
  } catch (e) {
    console.error('[FR] save error:', e);
    toast('خطا در ثبت: ' + e.message, 'danger');
  }
}
