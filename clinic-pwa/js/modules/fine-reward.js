// js/modules/fine-reward.js
import { sb } from '../sb.js';
import { $, toast, escapeHtml, gregorianToJalali, jalaliToGregorian, todayJalali } from '../utils.js';

function showScreenDirect(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen' + name);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
}

const toEnDigits = (s) => String(s || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const fmtMoney = (n) => Number(n || 0).toLocaleString('fa-IR');
const nowTime = () => {
  const d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
};
const toISOWithTime = (jalaliDate, timeStr) => {
  const g = jalaliToGregorian(jalaliDate);
  if (!g) return null;
  const [h, m] = (timeStr || '12:00').split(':');
  return new Date(`${g}T${(h||'12').padStart(2,'0')}:${(m||'00').padStart(2,'0')}:00`).toISOString();
};

// دکمه‌های سریع
const QUICK_AMOUNTS = [500000, 1000000, 2000000, 5000000];
const QUICK_REASONS = [
  'عدم استفاده از PPE', 'بی‌احتیاطی در کار', 'عدم رعایت دستورالعمل',
  'ورود به منطقه ممنوعه', 'عدم گزارش حادثه', 'انجام کار بدون مجوز',
];
const QUICK_LOCATIONS = ['خط تولید', 'انبار', 'کارگاه', 'محوطه', 'آزمایشگاه', 'دفتر اداری'];

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
        <button class="fr-tab active" data-tab="list"><i class="bi bi-list-ul"></i> لیست</button>
        <button class="fr-tab" data-tab="add"><i class="bi bi-plus-circle"></i> ثبت جدید</button>
        <button class="fr-tab" data-tab="finance"><i class="bi bi-file-earmark-excel"></i> مالی</button>
      </div>
      <div id="frBody"></div>
    </div>
  `;

  wrap.querySelectorAll('.fr-tab').forEach(btn => {
    btn.onclick = () => {
      wrap.querySelectorAll('.fr-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const t = btn.dataset.tab;
      if (t === 'list') renderList();
      else if (t === 'add') renderAddForm();
      else if (t === 'finance') renderFinance();
    };
  });
  renderList();
}

// ═══════════════════════════════════════════════════════
// لیست با فیلتر
// ═══════════════════════════════════════════════════════
async function renderList() {
  const body = $('frBody');
  body.innerHTML = `
    <div class="fr-filters">
      <input type="text" id="frFilterWorker" placeholder="نام کارگر..." class="form-control">
      <input type="text" id="frFilterUser" placeholder="کاربر ثبت‌کننده..." class="form-control mt-2">
      <div class="row g-2 mt-1">
        <div class="col-6"><input type="text" id="frFilterFrom" placeholder="از تاریخ" value="${todayJalali().slice(0,4)}/01/01" class="form-control" dir="ltr"></div>
        <div class="col-6"><input type="text" id="frFilterTo" placeholder="تا تاریخ" value="${todayJalali()}" class="form-control" dir="ltr"></div>
      </div>
      <div class="row g-2 mt-2">
        <div class="col-6"><select id="frFilterType" class="form-select"><option value="all">همه انواع</option><option value="fine">جریمه</option><option value="reward">تشویقی</option><option value="warning">اخطار</option></select></div>
        <div class="col-6"><button class="btn btn-primary w-100" id="frApplyFilter"><i class="bi bi-search"></i> اعمال</button></div>
      </div>
    </div>
    <div id="frListContainer"><div class="text-center py-4"><div class="spinner-border text-primary"></div></div></div>
  `;
  $('frApplyFilter').onclick = loadList;
  loadList();
}

async function loadList() {
  const c = $('frListContainer');
  c.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>';

  const worker = $('frFilterWorker')?.value.trim() || '';
  const user = $('frFilterUser')?.value.trim() || '';
  const from = $('frFilterFrom')?.value.trim() || '';
  const to = $('frFilterTo')?.value.trim() || '';
  const type = $('frFilterType')?.value || 'all';

  try {
    let q = sb.from('safety_finereward')
      .select('*, patient:core_patient(first_name, last_name, personnel_number, national_code, phone_number)')
      .order('created_at', { ascending: false })
      .limit(300);

    if (type !== 'all') q = q.eq('record_type', type);

    const fromG = from ? jalaliToGregorian(from) : null;
    const toG = to ? jalaliToGregorian(to) : null;
    if (fromG) q = q.gte('incident_datetime', fromG + 'T00:00:00');
    if (toG)   q = q.lte('incident_datetime', toG + 'T23:59:59');

    const { data, error } = await q;
    if (error) throw error;

    let list = data || [];
    if (worker) {
      const wl = worker.toLowerCase();
      list = list.filter(it => {
        const n = `${it.patient?.first_name||''} ${it.patient?.last_name||''}`.toLowerCase();
        return n.includes(wl) || (it.patient?.personnel_number||'').includes(worker);
      });
    }
    if (user) {
      const ul = user.toLowerCase();
      list = list.filter(it => (it.recorded_by_name || '').toLowerCase().includes(ul));
    }

    if (!list.length) {
      c.innerHTML = `<div class="fr-empty"><i class="bi bi-inbox"></i><div>موردی یافت نشد</div></div>`;
      return;
    }

    c.innerHTML = `<div class="fr-list">${list.map(renderListItem).join('')}</div>`;
    c.querySelectorAll('[data-fr-id]').forEach(el => {
      el.onclick = () => {
        const item = list.find(x => String(x.id) === String(el.dataset.frId));
        if (item) openDetail(item);
      };
    });
  } catch (e) {
    console.error(e);
    c.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
  }
}

function renderListItem(item) {
  const meta = {
    fine:    { label: 'جریمه',   cls: 'danger',  icon: 'bi-exclamation-circle-fill' },
    reward:  { label: 'تشویقی',  cls: 'success', icon: 'bi-award-fill' },
    warning: { label: 'اخطار',   cls: 'warning', icon: 'bi-exclamation-triangle-fill' },
  }[item.record_type] || { label: '—', cls: 'gray', icon: 'bi-file-earmark' };

  const name = item.patient ? `${item.patient.first_name || ''} ${item.patient.last_name || ''}`.trim() : '—';
  const dateStr = item.incident_datetime ? gregorianToJalali(item.incident_datetime.split('T')[0]) : '—';
  const timeStr = item.incident_datetime ? new Date(item.incident_datetime).toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'}) : '';

  return `
    <button class="fr-item ${meta.cls}" data-fr-id="${item.id}">
      <div class="fr-item-icon ${meta.cls}"><i class="bi ${meta.icon}"></i></div>
      <div class="fr-item-body">
        <div class="fr-item-head">
          <span class="fr-item-type ${meta.cls}">${meta.label}</span>
          <span class="fr-item-date">${escapeHtml(dateStr)} ${escapeHtml(timeStr)}</span>
        </div>
        <div class="fr-item-name">${escapeHtml(name)}</div>
        ${item.patient?.personnel_number ? `<div class="fr-item-personnel"><i class="bi bi-hash"></i> ${escapeHtml(item.patient.personnel_number)}</div>` : ''}
        <div class="fr-item-reason">${escapeHtml(item.reason || '—')}</div>
        ${item.location ? `<div class="fr-item-loc"><i class="bi bi-geo-alt"></i> ${escapeHtml(item.location)}</div>` : ''}
        ${item.amount ? `<div class="fr-item-amount">${fmtMoney(item.amount)} ریال</div>` : ''}
      </div>
      <i class="bi bi-chevron-left fr-item-arrow"></i>
    </button>
  `;
}

function openDetail(item) {
  const typeFa = { fine: 'جریمه', reward: 'تشویقی', warning: 'اخطار' }[item.record_type] || '—';
  const name = item.patient ? `${item.patient.first_name || ''} ${item.patient.last_name || ''}`.trim() : '—';
  const sheet = document.createElement('div');
  sheet.className = 'fr-sheet';
  sheet.innerHTML = `
    <div class="fr-sheet-handle"></div>
    <div class="fr-sheet-title">${typeFa}</div>
    <div class="fr-detail-row"><span>نام کارگر:</span><b>${escapeHtml(name)}</b></div>
    <div class="fr-detail-row"><span>کد پرسنلی:</span><b dir="ltr">${escapeHtml(item.patient?.personnel_number || '—')}</b></div>
    <div class="fr-detail-row"><span>کد ملی:</span><b dir="ltr">${escapeHtml(item.patient?.national_code || '—')}</b></div>
    <div class="fr-detail-row"><span>موبایل:</span><b dir="ltr">${escapeHtml(item.patient?.phone_number || '—')}</b></div>
    <div class="fr-detail-row"><span>تاریخ رویداد:</span><b>${escapeHtml(item.incident_datetime ? gregorianToJalali(item.incident_datetime.split('T')[0]) : '—')}</b></div>
    <div class="fr-detail-row"><span>محل ثبت:</span><b>${escapeHtml(item.location || '—')}</b></div>
    <div class="fr-detail-row"><span>محل جریمه:</span><b>${escapeHtml(item.incident_location || '—')}</b></div>
    <div class="fr-detail-row"><span>علت:</span><b>${escapeHtml(item.reason || '—')}</b></div>
    ${item.amount ? `<div class="fr-detail-row"><span>مبلغ:</span><b>${fmtMoney(item.amount)} ریال</b></div>` : ''}
    ${item.sent_to_finance ? '<div class="fr-detail-row"><span>وضعیت:</span><b style="color:#059669;">ارسال شده به مالی</b></div>' : ''}
    <button class="btn btn-light w-100 mt-3" id="frCloseSheet">بستن</button>
  `;
  const backdrop = document.createElement('div');
  backdrop.className = 'fr-backdrop';
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
  const close = () => { backdrop.classList.add('closing'); setTimeout(() => backdrop.remove(), 200); };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  sheet.querySelector('#frCloseSheet').onclick = close;
}

// ═══════════════════════════════════════════════════════
// فرم ثبت
// ═══════════════════════════════════════════════════════
function renderAddForm() {
  const body = $('frBody');
  body.innerHTML = `
    <div class="fr-form">
      <div class="fr-field">
        <label>نوع *</label>
        <div class="fr-type-grid">
          <button class="fr-type-btn danger active" data-type="fine"><i class="bi bi-exclamation-circle-fill"></i> جریمه</button>
          <button class="fr-type-btn success" data-type="reward"><i class="bi bi-award-fill"></i> تشویقی</button>
          <button class="fr-type-btn warning" data-type="warning"><i class="bi bi-exclamation-triangle-fill"></i> اخطار</button>
        </div>
        <input type="hidden" id="frType" value="fine">
      </div>

      <div class="fr-field">
        <label>جستجوی کارگر *</label>
        <div class="fr-search-wrap">
          <i class="bi bi-search"></i>
          <input type="text" id="frWorkerSearch" placeholder="نام، کد ملی، کد پرسنلی یا موبایل..." autocomplete="off">
        </div>
        <div id="frWorkerResults" class="fr-worker-results"></div>
        <div id="frSelectedWorker" class="fr-selected-worker" style="display:none;"></div>
        <div id="frWorkerStats" class="fr-worker-stats" style="display:none;"></div>
      </div>

      <div class="fr-field">
        <label>محل ثبت *</label>
        <input type="text" class="form-control" id="frLocation" placeholder="محل ثبت">
        <div class="fr-quick-chips" id="frLocationChips"></div>
      </div>

      <div class="fr-field">
        <label>محل جریمه / حادثه *</label>
        <input type="text" class="form-control" id="frIncidentLocation" placeholder="محل جریمه">
      </div>

      <div class="fr-field">
        <label>تاریخ و ساعت رویداد *</label>
        <div class="row g-2">
          <div class="col-7"><input type="text" class="form-control" id="frDate" value="${todayJalali()}" dir="ltr"></div>
          <div class="col-5"><input type="text" class="form-control" id="frTime" value="${nowTime()}" dir="ltr"></div>
        </div>
      </div>

      <div class="fr-field">
        <label>علت *</label>
        <textarea class="form-control" id="frReason" rows="2"></textarea>
        <div class="fr-quick-chips" id="frReasonChips"></div>
      </div>

      <div class="fr-field">
        <label>مبلغ (ریال) *</label>
        <input type="text" class="form-control" id="frAmount" value="1" dir="ltr" inputmode="numeric">
        <div class="fr-quick-chips" id="frAmountChips"></div>
      </div>

      <button class="btn btn-primary w-100 fr-save-btn" id="frSave"><i class="bi bi-check-circle"></i> ثبت</button>
    </div>
  `;

  // quick chips
  const amtWrap = $('frAmountChips');
  QUICK_AMOUNTS.forEach(v => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fr-chip';
    b.textContent = fmtMoney(v);
    b.onclick = () => { $('frAmount').value = String(v); };
    amtWrap.appendChild(b);
  });

  const reasonWrap = $('frReasonChips');
  QUICK_REASONS.forEach(r => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fr-chip';
    b.textContent = r;
    b.onclick = () => { $('frReason').value = r; };
    reasonWrap.appendChild(b);
  });

  const locWrap = $('frLocationChips');
  QUICK_LOCATIONS.forEach(l => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fr-chip';
    b.textContent = l;
    b.onclick = () => { $('frLocation').value = l; };
    locWrap.appendChild(b);
  });

  // جداکننده هزارگان روی مبلغ
  $('frAmount').addEventListener('input', (e) => {
    const v = toEnDigits(e.target.value).replace(/[^0-9]/g, '');
    e.target.value = v ? Number(v).toLocaleString('en-US') : '';
  });

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
}

// ═══════════════════════════════════════════════════════
// جستجو + اعتبارسنجی کارگر
// ═══════════════════════════════════════════════════════
let searchTimer = null;
function bindWorkerSearch() {
  const input = $('frWorkerSearch');
  const resultsEl = $('frWorkerResults');
  const selectedEl = $('frSelectedWorker');
  const statsEl = $('frWorkerStats');

  input.addEventListener('input', () => {
    if (selectedEl.style.display !== 'none') {
      selectedEl.style.display = 'none'; statsEl.style.display = 'none';
      delete input.dataset.workerId;
    }
    clearTimeout(searchTimer);
    const raw = input.value.trim();
    if (raw.length < 2) { resultsEl.innerHTML = ''; return; }
    const q = toEnDigits(raw);
    resultsEl.innerHTML = '<div class="fr-loading">در حال جستجو...</div>';

    searchTimer = setTimeout(async () => {
      try {
        const { data, error } = await sb.from('core_patient')
          .select('id, first_name, last_name, personnel_number, national_code, phone_number, company:core_company(name)')
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,personnel_number.ilike.%${q}%,national_code.ilike.%${q}%,phone_number.ilike.%${q}%`)
          .limit(10);
        if (error) throw error;
        if (!data?.length) { resultsEl.innerHTML = '<div class="fr-no-result">کارگری یافت نشد</div>'; return; }
        resultsEl.innerHTML = data.map(p => `
          <button class="fr-worker-card" data-id="${p.id}" data-name="${escapeHtml((p.first_name||'')+' '+(p.last_name||''))}" data-personnel="${escapeHtml(p.personnel_number||'')}" data-national="${escapeHtml(p.national_code||'')}" data-phone="${escapeHtml(p.phone_number||'')}">
            <div class="fr-worker-avatar">${escapeHtml((p.first_name||'?')[0]||'?')}</div>
            <div class="fr-worker-info">
              <div class="fr-worker-name">${escapeHtml((p.first_name||'')+' '+(p.last_name||''))}</div>
              <div class="fr-worker-meta">
                ${p.personnel_number?`<span><i class="bi bi-hash"></i> ${escapeHtml(p.personnel_number)}</span>`:''}
                ${p.company?.name?`<span><i class="bi bi-building"></i> ${escapeHtml(p.company.name)}</span>`:''}
              </div>
            </div>
            <i class="bi bi-chevron-left"></i>
          </button>
        `).join('');
        resultsEl.querySelectorAll('.fr-worker-card').forEach(card => {
          card.onclick = () => selectWorker(card, input, resultsEl, selectedEl, statsEl);
        });
      } catch (err) {
        resultsEl.innerHTML = `<div class="alert alert-danger py-2 small">${escapeHtml(err.message)}</div>`;
      }
    }, 300);
  });
}

async function selectWorker(card, input, resultsEl, selectedEl, statsEl) {
  const id = card.dataset.id;
  const name = card.dataset.name;
  const personnel = card.dataset.personnel;
  const national = card.dataset.national;
  const phone = card.dataset.phone;

  // اعتبارسنجی اطلاعات
  const problems = [];
  if (!national) problems.push('کد ملی');
  if (!phone) problems.push('شماره موبایل');

  // چک تکراری
  if (national) {
    const { data: dup } = await sb.from('core_patient').select('id').eq('national_code', national).neq('id', id);
    if (dup?.length) { toast('این کد ملی قبلاً برای کارگر دیگری ثبت شده', 'danger'); return; }
  }
  if (phone) {
    const { data: dup } = await sb.from('core_patient').select('id').eq('phone_number', phone).neq('id', id);
    if (dup?.length) { toast('این شماره موبایل قبلاً برای کارگر دیگری ثبت شده', 'danger'); return; }
  }

  if (problems.length) {
    openMissingInfoModal({
      patientId: id, name,
      missingFields: { national_code: !national, phone_number: !phone },
      onSave: async (updated) => {
        // اعتبارسنجی موبایل
        if (updated.phone_number && !/^09\d{9}$/.test(updated.phone_number)) {
          toast('شماره موبایل باید با ۰۹ شروع شده و ۱۱ رقم باشد', 'danger');
          return false;
        }
        if (updated.national_code && !/^\d{10}$/.test(updated.national_code)) {
          toast('کد ملی باید ۱۰ رقم باشد', 'danger');
          return false;
        }
        const { error } = await sb.from('core_patient').update(updated).eq('id', id);
        if (error) { toast('خطا در ذخیره: ' + error.message, 'danger'); return false; }
        return true;
      }
    });
    // بعد از ذخیره، انتخاب رو کامل کن
    setTimeout(async () => {
      if (!problems.length) return;
      await finalizeSelection(id, name, personnel, input, resultsEl, selectedEl, statsEl);
    }, 500);
    return;
  }

  await finalizeSelection(id, name, personnel, input, resultsEl, selectedEl, statsEl);
}

async function finalizeSelection(id, name, personnel, input, resultsEl, selectedEl, statsEl) {
  input.value = name;
  input.dataset.workerId = id;
  resultsEl.innerHTML = '';
  selectedEl.style.display = 'block';
  selectedEl.innerHTML = `<div class="fr-selected-inner"><i class="bi bi-check-circle-fill"></i><div><div class="fr-selected-name">${escapeHtml(name)}</div><div class="fr-selected-meta">${personnel?'کد پرسنلی: '+escapeHtml(personnel):''}</div></div></div>`;

  // واکشی آمار کارگر
  statsEl.style.display = 'block';
  statsEl.innerHTML = '<div class="fr-loading">در حال بارگذاری آمار...</div>';
  try {
    const [incRes, frRes, examRes] = await Promise.all([
      sb.from('visits_visit').select('id', { count: 'exact', head: true }).eq('patient_id', id).neq('incident_type', 'none').neq('incident_type', null),
      sb.from('safety_finereward').select('record_type').eq('worker_id', id),
      sb.from('lab_results_periodicexamination').select('final_opinion_text, final_opinion_conditions, corrective_actions').eq('patient_id', id).order('exam_date', { ascending: false }).limit(1)
    ]);

    const incidentCount = incRes.count || 0;
    const records = frRes.data || [];
    const fines = records.filter(r => r.record_type === 'fine').length;
    const rewards = records.filter(r => r.record_type === 'reward').length;
    const warnings = records.filter(r => r.record_type === 'warning').length;

    // محاسبه اسکور ایمنی (۵ ستاره)
    let score = 5;
    score -= Math.min(3, incidentCount * 0.5);
    score -= Math.min(2, warnings * 0.4);
    score -= Math.min(2, fines * 0.3);
    score += Math.min(1, rewards * 0.3);
    score = Math.max(1, Math.min(5, score));
    const stars = Math.round(score);

    const exam = examRes.data?.[0] || {};

    statsEl.innerHTML = `
      <div class="fr-stats-grid">
        <div class="fr-stat-box danger"><div class="fr-stat-num">${incidentCount}</div><div class="fr-stat-lbl">حادثه</div></div>
        <div class="fr-stat-box warning"><div class="fr-stat-num">${warnings}</div><div class="fr-stat-lbl">اخطار</div></div>
        <div class="fr-stat-box danger"><div class="fr-stat-num">${fines}</div><div class="fr-stat-lbl">جریمه</div></div>
        <div class="fr-stat-box success"><div class="fr-stat-num">${rewards}</div><div class="fr-stat-lbl">تشویقی</div></div>
      </div>

      <div class="fr-safety-score">
        <div class="fr-score-stars">${'★'.repeat(stars)}${'☆'.repeat(5-stars)}</div>
        <div class="fr-score-text">اسکور ایمنی: ${stars}/5 — ${stars>=4?'وضعیت مطلوب':stars>=3?'نیاز به توجه':'وضعیت پرخطر'}</div>
      </div>

      <div class="fr-occupational">
        <div class="fr-occupational-title"><i class="bi bi-clipboard2-pulse"></i> اطلاعات طب کار</div>
        <div class="fr-oc-row"><span>نظریه نهایی:</span><b>${escapeHtml(exam.final_opinion_text || 'ندارد')}</b></div>
        <div class="fr-oc-row"><span>شروط:</span><b>${escapeHtml(exam.final_opinion_conditions || 'ندارد')}</b></div>
        <div class="fr-oc-row"><span>اقدام اصلاحی:</span><b>${escapeHtml(exam.corrective_actions || 'ندارد')}</b></div>
      </div>
    `;
  } catch (e) {
    statsEl.innerHTML = `<div class="alert alert-warning py-2 small">خطا در بارگذاری آمار: ${escapeHtml(e.message)}</div>`;
  }
}

function openMissingInfoModal({ patientId, name, missingFields, onSave }) {
  const modal = document.createElement('div');
  modal.className = 'fr-modal-backdrop';
  modal.innerHTML = `
    <div class="fr-modal">
      <div class="fr-modal-title">تکمیل اطلاعات کارگر</div>
      <div class="fr-modal-sub">اطلاعات زیر برای <b>${escapeHtml(name)}</b> ناقص است:</div>
      ${missingFields.national_code?`<div class="fr-field"><label>کد ملی (۱۰ رقم)</label><input type="text" class="form-control" id="frMissingNational" dir="ltr" inputmode="numeric" maxlength="10"></div>`:''}
      ${missingFields.phone_number?`<div class="fr-field"><label>موبایل (۱۱ رقم، با ۰۹)</label><input type="text" class="form-control" id="frMissingPhone" dir="ltr" inputmode="numeric" maxlength="11"></div>`:''}
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
    const ok = await onSave(updated);
    if (ok !== false) modal.remove();
  };
}

// ═══════════════════════════════════════════════════════
// ذخیره
// ═══════════════════════════════════════════════════════
async function saveRecord() {
  const input = $('frWorkerSearch');
  const workerId = input.dataset.workerId;
  if (!workerId) { toast('ابتدا کارگر را انتخاب کنید', 'warning'); return; }

  const reason = $('frReason').value.trim();
  if (!reason) { toast('علت اجباری است', 'warning'); return; }

  const location = $('frLocation').value.trim();
  if (!location) { toast('محل ثبت اجباری است', 'warning'); return; }

  const incidentLocation = $('frIncidentLocation').value.trim();
  if (!incidentLocation) { toast('محل جریمه/حادثه اجباری است', 'warning'); return; }

  const dateStr = $('frDate').value.trim();
  const timeStr = $('frTime').value.trim();
  const isoDT = toISOWithTime(dateStr, timeStr);
  if (!isoDT) { toast('تاریخ نامعتبر', 'warning'); return; }

  const amount = parseInt(toEnDigits($('frAmount').value).replace(/,/g,''), 10) || 0;
  if (amount < 1) { toast('مبلغ حداقل ۱ ریال است', 'warning'); return; }

  const { data: { user } } = await sb.auth.getUser();
  const record = {
    worker_id: parseInt(workerId, 10),
    record_type: $('frType').value,
    location, incident_location: incidentLocation,
    incident_datetime: isoDT,
    reason, amount,
    recorded_by: user?.id || null,
    sent_to_finance: false,
  };

  try {
    const { error } = await sb.from('safety_finereward').insert(record);
    if (error) throw error;
    toast('✅ ثبت شد', 'success');
    document.querySelector('.fr-tab[data-tab="list"]').click();
  } catch (e) {
    console.error(e);
    toast('خطا در ثبت: ' + e.message, 'danger');
  }
}

// ═══════════════════════════════════════════════════════
// تب مالی — ارسال به مالی
// ═══════════════════════════════════════════════════════
async function renderFinance() {
  const body = $('frBody');
  body.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>';

  try {
    const { data, error } = await sb.from('safety_finereward')
      .select('*, patient:core_patient(first_name, last_name, personnel_number, national_code, phone_number)')
      .eq('sent_to_finance', false)
      .order('created_at', { ascending: false });
    if (error) throw error;

    if (!data?.length) {
      body.innerHTML = `<div class="fr-empty"><i class="bi bi-check2-circle"></i><div>همه موارد به مالی ارسال شده‌اند</div></div>`;
      return;
    }

    body.innerHTML = `
      <div class="fr-finance-header">
        <div>${data.length} مورد ارسال‌نشده</div>
        <button class="btn btn-success btn-sm" id="frSendAll"><i class="bi bi-file-earmark-excel"></i> ارسال همه به مالی</button>
      </div>
      <div class="fr-list">
        ${data.map(it => `
          <div class="fr-item ${it.record_type}">
            <div class="fr-item-icon ${it.record_type === 'reward' ? 'success' : 'danger'}"><i class="bi ${it.record_type === 'reward' ? 'bi-award-fill' : 'bi-exclamation-circle-fill'}"></i></div>
            <div class="fr-item-body">
              <div class="fr-item-name">${escapeHtml((it.patient?.first_name||'')+' '+(it.patient?.last_name||''))}</div>
              <div class="fr-item-personnel">پرسنلی: ${escapeHtml(it.patient?.personnel_number||'—')} — موبایل: ${escapeHtml(it.patient?.phone_number||'—')}</div>
              <div class="fr-item-amount">${fmtMoney(it.amount)} ریال</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    $('frSendAll').onclick = () => exportExcel(data);
  } catch (e) {
    body.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
  }
}

function exportExcel(records) {
  // CSV با BOM تا در Excel درست باز شود
  const headers = ['نام', 'کد پرسنلی', 'کد ملی', 'موبایل', 'نوع', 'مبلغ (ریال)', 'علت', 'محل', 'تاریخ'];
  const rows = records.map(r => [
    `${r.patient?.first_name||''} ${r.patient?.last_name||''}`.trim(),
    r.patient?.personnel_number || '',
    r.patient?.national_code || '',
    r.patient?.phone_number || '',
    r.record_type === 'fine' ? 'جریمه' : r.record_type === 'reward' ? 'تشویقی' : 'اخطار',
    r.amount || 0,
    (r.reason || '').replace(/,/g, ' '),
    (r.location || '').replace(/,/g, ' '),
    r.incident_datetime ? gregorianToJalali(r.incident_datetime.split('T')[0]) : '',
  ]);

  const csv = '\uFEFF' + [headers, ...rows].map(row => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finance-report-${todayJalali().replace(/\//g,'-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  // علامت‌گذاری به‌عنوان ارسال‌شده
  const ids = records.map(r => r.id);
  sb.from('safety_finereward')
    .update({ sent_to_finance: true, finance_sent_at: new Date().toISOString() })
    .in('id', ids)
    .then(() => toast('✅ گزارش دانلود و به‌عنوان ارسال‌شده علامت‌گذاری شد', 'success'))
    .catch(e => toast('خطا در علامت‌گذاری: ' + e.message, 'warning'));
}
