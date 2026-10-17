// js/modules/fine-reward.js
import { sb } from '../sb.js';
import { $, toast, escapeHtml, gregorianToJalali, jalaliToGregorian, todayJalali } from '../utils.js';

// ═══════════════════════════════════════════════════════
// ⚙️ تنظیمات پیامک (اینجا را ویرایش کنید)
// ═══════════════════════════════════════════════════════
const SMS_CONFIG = {
  API_TOKEN: 'YOUR_API_TOKEN_HERE',   // 🔴 توکن API خود را اینجا قرار دهید
  LINE_NUMBER: 'Public',              // شماره خط فرستنده
  SEND_URL: 'https://portal.amootsms.com/rest/SendSimple',
  DELIVERY_URL: 'https://portal.amootsms.com/rest/GetDeliveries' // برای استعلام وضعیت
};

// ═══════════════════════════════════════════════════════
// توابع کمکی
// ═══════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════
// 📱 سرویس پیامک (ارسال + ذخیره لاگ)
// ═══════════════════════════════════════════════════════
async function sendSMS(phone, text, patientName) {
  if (!phone || !/^09\d{9}$/.test(phone)) {
    console.warn('[SMS] شماره نامعتبر:', phone);
    return { success: false, error: 'شماره نامعتبر' };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('token', SMS_CONFIG.API_TOKEN);
    formData.append('Mobiles', phone);
    formData.append('SendDateTime', '0');
    formData.append('SMSMessageText', text);
    formData.append('LineNumber', SMS_CONFIG.LINE_NUMBER);

    const res = await fetch(SMS_CONFIG.SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });

    const data = await res.json();
    console.log('[SMS] Response:', data);

    // بررسی خروجی API (ساختار: result.Data[0].Status)
    let isSuccess = false;
    let messageId = null;
    let statusText = 'نامشخص';

    if (data?.result?.Data?.[0]) {
      const item = data.result.Data[0];
      messageId = item.MessageID;
      statusText = item.Status;
      // طبق مستندات، Status های موفقیت معمولاً 1 یا 200 هستند
      isSuccess = (String(item.Status) === '1' || String(item.Status) === '200');
    } else if (data?.Status) {
      statusText = data.Status;
      isSuccess = (String(data.Status) === '1' || String(data.Status) === '200');
    }

    // ذخیره لاگ در دیتابیس (جدول جدید sms_logs)
    const { error: logErr } = await sb.from('sms_logs').insert({
      patient_name: patientName,
      mobile: phone,
      message_text: text,
      message_id: messageId,
      status: statusText,
      is_success: isSuccess,
      sent_at: new Date().toISOString()
    });

    if (logErr) console.error('[SMS] Log error:', logErr);
    
    return { success: isSuccess, messageId, status: statusText };
  } catch (e) {
    console.error('[SMS] Send error:', e);
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════
// 📊 استعلام وضعیت تحویل (GetDeliveries)
// ═══════════════════════════════════════════════════════
async function checkDeliveryStatus() {
  try {
    const { data: pending } = await sb.from('sms_logs')
      .select('id, message_id, mobile')
      .eq('is_delivered', false)
      .not('message_id', 'is', null)
      .limit(20);

    if (!pending?.length) return;

    for (const log of pending) {
      const formData = new URLSearchParams();
      formData.append('token', SMS_CONFIG.API_TOKEN);
      formData.append('MessageIDs', log.message_id);

      const res = await fetch(SMS_CONFIG.DELIVERY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      });
      const data = await res.json();
      
      // اگر وضعیت نهایی بود (مثلاً 2 = تحویل شده)، آپدیت کن
      const deliveryStatus = data?.result?.Data?.[0]?.Status;
      if (deliveryStatus && String(deliveryStatus) === '2') {
        await sb.from('sms_logs').update({ is_delivered: true, delivery_status: deliveryStatus }).eq('id', log.id);
      }
    }
    toast('وضعیت تحویل پیام‌ها به‌روز شد', 'success');
  } catch (e) {
    console.error('Delivery check error:', e);
  }
}

// ═══════════════════════════════════════════════════════
// 📤 خروجی اکسل (CSV با پشتیبانی از فارسی)
// ═══════════════════════════════════════════════════════
function downloadCSV(headers, rows, filename) {
  const BOM = '\uFEFF';
  const csvContent = BOM + [headers, ...rows].map(row => 
    row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ═══════════════════════════════════════════════════════
// لیست و جستجوی تراکنش‌ها
// ═══════════════════════════════════════════════════════
async function renderList() {
  const body = $('frBody');
  body.innerHTML = `
    <div class="fr-filters">
      <div class="input-group mb-2">
        <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
        <input type="text" id="frFilterQuery" placeholder="جستجو (نام، کد پرسنلی، موبایل، علت...)" class="form-control">
      </div>
      <div class="row g-2">
        <div class="col-6"><input type="text" id="frFilterFrom" placeholder="از تاریخ" value="${todayJalali().slice(0,4)}/01/01" class="form-control" dir="ltr"></div>
        <div class="col-6"><input type="text" id="frFilterTo" placeholder="تا تاریخ" value="${todayJalali()}" class="form-control" dir="ltr"></div>
      </div>
      <div class="row g-2 mt-2">
        <div class="col-8"><select id="frFilterType" class="form-select"><option value="all">همه انواع</option><option value="fine">جریمه</option><option value="reward">تشویقی</option><option value="warning">اخطار</option></select></div>
        <div class="col-4"><button class="btn btn-primary w-100" id="frApplyFilter"><i class="bi bi-funnel"></i> فیلتر</button></div>
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
  
  const q = $('frFilterQuery')?.value.trim().toLowerCase() || '';
  const from = $('frFilterFrom')?.value.trim() || '';
  const to = $('frFilterTo')?.value.trim() || '';
  const type = $('frFilterType')?.value || 'all';

  try {
    let query = sb.from('safety_finereward')
      .select('*, patient:core_patient(first_name, last_name, personnel_number, national_code, phone_number)')
      .order('created_at', { ascending: false }).limit(300);
      
    if (type !== 'all') query = query.eq('record_type', type);
    const fromG = from ? jalaliToGregorian(from) : null;
    const toG = to ? jalaliToGregorian(to) : null;
    if (fromG) query = query.gte('incident_datetime', fromG + 'T00:00:00');
    if (toG) query = query.lte('incident_datetime', toG + 'T23:59:59');

    const { data, error } = await query;
    if (error) throw error;

    let list = data || [];
    if (q) {
      list = list.filter(it => {
        const haystack = [
          it.patient?.first_name, it.patient?.last_name,
          it.patient?.personnel_number, it.patient?.national_code, it.patient?.phone_number,
          it.reason, it.location, it.incident_location
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      });
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
    c.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
  }
}

function renderListItem(item) {
  const meta = {
    fine:    { label: 'جریمه',   cls: 'danger',  icon: 'bi-exclamation-circle-fill' },
    reward:  { label: 'تشویقی',  cls: 'success', icon: 'bi-award-fill' },
    warning: { label: 'اخطار',   cls: 'warning', icon: 'bi-exclamation-triangle-fill' },
  }[item.record_type] || { label: '—', cls: 'gray', icon: 'bi-file-earmark' };

  const name = item.patient ? `${item.patient.first_name||''} ${item.patient.last_name||''}`.trim() : '—';
  const dateStr = item.incident_datetime ? gregorianToJalali(item.incident_datetime.split('T')[0]) : '—';

  return `
    <button class="fr-item ${meta.cls}" data-fr-id="${item.id}">
      <div class="fr-item-icon ${meta.cls}"><i class="bi ${meta.icon}"></i></div>
      <div class="fr-item-body">
        <div class="fr-item-head">
          <span class="fr-item-type ${meta.cls}">${meta.label}</span>
          <span class="fr-item-date">${escapeHtml(dateStr)}</span>
        </div>
        <div class="fr-item-name">${escapeHtml(name)}</div>
        <div class="fr-item-personnel">${escapeHtml(item.patient?.personnel_number || '—')}</div>
        <div class="fr-item-reason">${escapeHtml(item.reason || '—')}</div>
        ${item.amount ? `<div class="fr-item-amount">${fmtMoney(item.amount)} ریال</div>` : ''}
      </div>
      <i class="bi bi-chevron-left fr-item-arrow"></i>
    </button>
  `;
}

// ═══════════════════════════════════════════════════════
// جزئیات کامل تراکنش
// ═══════════════════════════════════════════════════════
function openDetail(item) {
  const typeFa = { fine: 'جریمه', reward: 'تشویقی', warning: 'اخطار' }[item.record_type] || '—';
  const name = item.patient ? `${item.patient.first_name||''} ${item.patient.last_name||''}`.trim() : '—';
  
  const sheet = document.createElement('div');
  sheet.className = 'fr-sheet';
  sheet.innerHTML = `
    <div class="fr-sheet-handle"></div>
    <div class="fr-sheet-title">جزئیات ${typeFa}</div>
    <div class="fr-detail-row"><span>نام کارگر:</span><b>${escapeHtml(name)}</b></div>
    <div class="fr-detail-row"><span>کد پرسنلی:</span><b dir="ltr">${escapeHtml(item.patient?.personnel_number||'—')}</b></div>
    <div class="fr-detail-row"><span>کد ملی:</span><b dir="ltr">${escapeHtml(item.patient?.national_code||'—')}</b></div>
    <div class="fr-detail-row"><span>موبایل:</span><b dir="ltr">${escapeHtml(item.patient?.phone_number||'—')}</b></div>
    <div class="fr-detail-row"><span>تاریخ رویداد:</span><b>${escapeHtml(item.incident_datetime?gregorianToJalali(item.incident_datetime.split('T')[0]):'—')}</b></div>
    <div class="fr-detail-row"><span>محل ثبت:</span><b>${escapeHtml(item.location||'—')}</b></div>
    <div class="fr-detail-row"><span>محل جریمه:</span><b>${escapeHtml(item.incident_location||'—')}</b></div>
    <div class="fr-detail-row"><span>علت:</span><b>${escapeHtml(item.reason||'—')}</b></div>
    ${item.amount?`<div class="fr-detail-row"><span>مبلغ:</span><b>${fmtMoney(item.amount)} ریال</b></div>`:''}
    <div class="fr-detail-row"><span>وضعیت پیامک:</span><b>${item.sms_sent ? '✅ ارسال شده' : '⏳ در انتظار'}</b></div>
    <button class="btn btn-light w-100 mt-3" id="frCloseSheet">بستن</button>
  `;
  const backdrop = document.createElement('div');
  backdrop.className = 'fr-backdrop';
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
  const close = () => { backdrop.classList.add('closing'); setTimeout(() => backdrop.remove(), 200); };
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  sheet.querySelector('#frCloseSheet').onclick = close;
}

// ═══════════════════════════════════════════════════════
// فرم ثبت (با ارسال پیامک خودکار)
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
          <input type="text" id="frWorkerSearch" placeholder="نام، کد ملی، کد پرسنلی..." autocomplete="off">
        </div>
        <div id="frWorkerResults" class="fr-worker-results"></div>
        <div id="frSelectedWorker" class="fr-selected-worker" style="display:none;"></div>
        <div id="frWorkerStats" class="fr-worker-stats" style="display:none;"></div>
      </div>

      <div class="fr-field">
        <label>محل ثبت *</label>
        <input type="text" class="form-control" id="frLocation" placeholder="دفتر ایمنی / سیار / ...">
      </div>

      <div class="fr-field">
        <label>محل جریمه / حادثه *</label>
        <input type="text" class="form-control" id="frIncidentLocation" placeholder="خط تولید / انبار / ...">
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
      </div>

      <div class="fr-field">
        <label>مبلغ (ریال) *</label>
        <input type="text" class="form-control" id="frAmount" value="1" dir="ltr" inputmode="numeric">
      </div>

      <button class="btn btn-primary w-100 fr-save-btn" id="frSave"><i class="bi bi-check-circle"></i> ثبت و ارسال پیامک</button>
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
}

// ═══════════════════════════════════════════════════════
// جستجوی کارگر (با نمایش آمار)
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

  const problems = [];
  if (!national) problems.push('کد ملی');
  if (!phone) problems.push('شماره موبایل');

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
        if (updated.phone_number && !/^09\d{9}$/.test(updated.phone_number)) {
          toast('شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود', 'danger'); return false;
        }
        if (updated.national_code && !/^\d{10}$/.test(updated.national_code)) {
          toast('کد ملی باید ۱۰ رقم باشد', 'danger'); return false;
        }
        const { error } = await sb.from('core_patient').update(updated).eq('id', id);
        if (error) { toast('خطا: ' + error.message, 'danger'); return false; }
        await finalizeSelection(id, name, personnel, input, resultsEl, selectedEl, statsEl);
        return true;
      }
    });
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

  statsEl.style.display = 'block';
  statsEl.innerHTML = '<div class="fr-loading">در حال بارگذاری آمار...</div>';

  try {
    const { count: incidentCount } = await sb.from('visits_visit')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', id)
      .neq('incident_type', 'none')
      .not('incident_type', 'is', null);

    const { data: records } = await sb.from('safety_finereward')
      .select('record_type').eq('worker_id', id);
    const fines = (records||[]).filter(r => r.record_type === 'fine').length;
    const rewards = (records||[]).filter(r => r.record_type === 'reward').length;
    const warnings = (records||[]).filter(r => r.record_type === 'warning').length;

    let exam = null;
    try {
      const { data: ex } = await sb.from('lab_results_periodicexamination')
        .select('*')
        .eq('patient_id', id)
        .order('exam_date', { ascending: false })
        .limit(1);
      if (ex && ex.length) exam = ex[0];
    } catch (err) { console.warn('[FR] exam query:', err); }

    let score = 5;
    score -= Math.min(3, incidentCount * 0.5);
    score -= Math.min(2, warnings * 0.4);
    score -= Math.min(2, fines * 0.3);
    score += Math.min(1, rewards * 0.3);
    score = Math.max(1, Math.min(5, score));
    const stars = Math.round(score);
    const scoreText = stars >= 4 ? 'وضعیت مطلوب' : stars >= 3 ? 'نیاز به توجه' : 'وضعیت پرخطر';

    const opinion = exam?.final_opinion_text || exam?.final_opinion || exam?.opinion_text || '';
    const conditions = exam?.final_opinion_conditions || exam?.conditions || '';
    const actions = exam?.corrective_actions || exam?.corrective_action || exam?.actions || '';

    statsEl.innerHTML = `
      <div class="fr-stats-grid">
        <div class="fr-stat-box danger"><div class="fr-stat-num">${incidentCount}</div><div class="fr-stat-lbl">حادثه</div></div>
        <div class="fr-stat-box warning"><div class="fr-stat-num">${warnings}</div><div class="fr-stat-lbl">اخطار</div></div>
        <div class="fr-stat-box danger"><div class="fr-stat-num">${fines}</div><div class="fr-stat-lbl">جریمه</div></div>
        <div class="fr-stat-box success"><div class="fr-stat-num">${rewards}</div><div class="fr-stat-lbl">تشویقی</div></div>
      </div>
      <div class="fr-safety-score">
        <div class="fr-score-stars">${'★'.repeat(stars)}${'☆'.repeat(5-stars)}</div>
        <div class="fr-score-text">اسکور ایمنی: ${stars}/5 — ${scoreText}</div>
      </div>
      <div class="fr-occupational">
        <div class="fr-occupational-title"><i class="bi bi-clipboard2-pulse"></i> اطلاعات طب کار</div>
        <div class="fr-oc-row"><span>نظریه نهایی:</span><b>${escapeHtml(opinion || 'ندارد')}</b></div>
        <div class="fr-oc-row"><span>شروط:</span><b>${escapeHtml(conditions || 'ندارد')}</b></div>
        <div class="fr-oc-row"><span>اقدام اصلاحی:</span><b>${escapeHtml(actions || 'ندارد')}</b></div>
      </div>
    `;
  } catch (e) {
    statsEl.innerHTML = `<div class="alert alert-warning py-2 small">خطا: ${escapeHtml(e.message)}</div>`;
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
// ذخیره تراکنش + ارسال پیامک
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
    status_changed_at: new Date().toISOString(),
  };

  try {
    // ۱. ذخیره در دیتابیس
    const { data: inserted, error } = await sb.from('safety_finereward').insert(record).select().single();
    if (error) throw error;

    // ۲. ارسال پیامک
    const typeFa = { fine: 'جریمه', reward: 'تشویقی', warning: 'اخطار' }[record.record_type];
    const smsText = `همکار گرامی، ${typeFa} ثبت شده برای شما: ${reason} (مبلغ: ${fmtMoney(amount)} ریال)`;
    const smsResult = await sendSMS($('frWorkerSearch').dataset.phone, smsText, input.value);
    
    if (smsResult.success) {
      await sb.from('safety_finereward').update({ sms_sent: true, sms_message_id: smsResult.messageId }).eq('id', inserted.id);
      toast('✅ ثبت شد و پیامک ارسال گردید', 'success');
    } else {
      toast('✅ ثبت شد اما پیامک ارسال نشد: ' + (smsResult.error || 'خطای نامشخص'), 'warning');
    }

    document.querySelector('.fr-tab[data-tab="list"]').click();
  } catch (e) {
    console.error(e);
    toast('خطا در ثبت: ' + e.message, 'danger');
  }
}

// ═══════════════════════════════════════════════════════
// تب مالی (با خروجی اکسل تفکیک‌شده)
// ═══════════════════════════════════════════════════════
async function renderFinance() {
  const body = $('frBody');
  body.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>';

  try {
    const { data, error } = await sb.from('safety_finereward')
      .select('*, patient:core_patient(first_name, last_name, personnel_number, national_code, phone_number)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    const all = data || [];
    const pending = all.filter(it => !it.sent_to_finance);
    const sent = all.filter(it => it.sent_to_finance);

    body.innerHTML = `
      <div class="fr-finance-section">
        <div class="fr-finance-header pending">
          <div><i class="bi bi-hourglass-split"></i> ${pending.length} مورد ارسال‌نشده</div>
          ${pending.length ? `<button class="btn btn-success btn-sm" id="frSendAll"><i class="bi bi-file-earmark-excel"></i> ارسال و اکسل</button>` : '<span class="badge-soft success">همه ارسال شده</span>'}
        </div>
        ${pending.length ? `<div class="fr-list">${pending.map(renderFinanceItem).join('')}</div>` : ''}
      </div>

      ${sent.length ? `
        <div class="fr-finance-section" style="margin-top:20px;">
          <div class="fr-finance-header sent">
            <div><i class="bi bi-check2-circle"></i> ${sent.length} مورد ارسال‌شده</div>
            <button class="btn btn-outline-success btn-sm" id="frExportSent"><i class="bi bi-download"></i> خروجی اکسل</button>
          </div>
          <div class="fr-list">${sent.slice(0, 50).map(renderFinanceItem).join('')}</div>
        </div>` : ''}
    `;

    if ($('frSendAll')) $('frSendAll').onclick = () => exportAndMark(pending);
    if ($('frExportSent')) $('frExportSent').onclick = () => exportExcel(sent, 'sent-finance');
  } catch (e) {
    body.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
  }
}

function renderFinanceItem(it) {
  const dateFa = it.incident_datetime ? gregorianToJalali(it.incident_datetime.split('T')[0]) : '—';
  return `
    <div class="fr-item ${it.record_type}">
      <div class="fr-item-icon ${it.record_type === 'reward' ? 'success' : 'danger'}"><i class="bi ${it.record_type === 'reward' ? 'bi-award-fill' : 'bi-exclamation-circle-fill'}"></i></div>
      <div class="fr-item-body">
        <div class="fr-item-name">${escapeHtml((it.patient?.first_name||'')+' '+(it.patient?.last_name||''))}</div>
        <div class="fr-item-personnel">پرسنلی: ${escapeHtml(it.patient?.personnel_number||'—')} — موبایل: ${escapeHtml(it.patient?.phone_number||'—')}</div>
        <div class="fr-item-amount">${fmtMoney(it.amount)} ریال</div>
      </div>
    </div>
  `;
}

async function exportAndMark(records) {
  if (!records.length) return;

  const headers = ['نام', 'کد پرسنلی', 'کد ملی', 'موبایل', 'نوع', 'مبلغ (ریال)', 'علت', 'محل ثبت', 'محل جریمه', 'تاریخ'];
  const rows = records.map(r => [
    `${r.patient?.first_name||''} ${r.patient?.last_name||''}`.trim(),
    r.patient?.personnel_number || '',
    r.patient?.national_code || '',
    r.patient?.phone_number || '',
    r.record_type === 'fine' ? 'جریمه' : r.record_type === 'reward' ? 'تشویقی' : 'اخطار',
    r.amount || 0,
    (r.reason || '').replace(/,/g, ' '),
    (r.location || '').replace(/,/g, ' '),
    (r.incident_location || '').replace(/,/g, ' '),
    r.incident_datetime ? gregorianToJalali(r.incident_datetime.split('T')[0]) : '',
  ]);

  downloadCSV(headers, rows, `finance-pending-${todayJalali().replace(/\//g,'-')}.csv`);

  const ids = records.map(r => r.id);
  const now = new Date().toISOString();
  const { error } = await sb.from('safety_finereward')
    .update({ sent_to_finance: true, finance_sent_at: now, status_changed_at: now })
    .in('id', ids);

  if (error) toast('خطا: ' + error.message, 'danger');
  else { toast('✅ گزارش دانلود و علامت‌گذاری شد', 'success'); renderFinance(); }
}

function exportExcel(records, prefix) {
  const headers = ['نام', 'کد پرسنلی', 'کد ملی', 'موبایل', 'نوع', 'مبلغ (ریال)', 'علت', 'محل ثبت', 'تاریخ'];
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
  downloadCSV(headers, rows, `${prefix}-${todayJalali().replace(/\//g,'-')}.csv`);
}

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
        <div class="fr-sub">ثبت، پیامک و گزارش‌گیری</div>
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
