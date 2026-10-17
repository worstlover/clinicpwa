// js/modules/fine-reward.js
import { sb } from '../sb.js';
import { $, toast, escapeHtml, gregorianToJalali, jalaliToGregorian, todayJalali } from '../utils.js';
import { getAccountStatus, getDeliveries } from './amoot-api.js';

// ═══════════════════════════════════════════════════════
// دکمه‌های سریع
// ═══════════════════════════════════════════════════════
const QUICK_AMOUNTS = [500000, 1000000, 2000000, 5000000];
const QUICK_REASONS = [
  'عدم استفاده از PPE', 'بی‌احتیاطی در کار', 'عدم رعایت دستورالعمل',
  'ورود به منطقه ممنوعه', 'عدم گزارش حادثه', 'انجام کار بدون مجوز'
];
const QUICK_REGISTER_LOCATIONS = ['دفتر ایمنی', 'سیار', 'دفتر سرپرست ایمنی', 'مدیریت'];
const QUICK_INCIDENT_LOCATIONS = [
  'خط تولید', 'انبار', 'کارگاه', 'محوطه', 'آزمایشگاه',
  'ساختمان اداری', 'تعمیرگاه', 'باسکول', 'کوره', 'آسیاب'
];

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

function buildSmsText(record) {
  const type = record.record_type;
  const amount = fmtMoney(record.amount);
  const date = record.incident_datetime ? gregorianToJalali(record.incident_datetime.split('T')[0]) : '—';
  const reason = record.reason || '—';
  const who = 'مدیریت ایمنی';
  const SIGN = '';

  if (type === "fine")
    return `اطلاعیه ایمنی: ${who} مبلغ ${amount} ریال در تاریخ ${date} به علت ${reason} برای شما منظور گردید. ${SIGN}`;
  if (type === "reward")
    return `اطلاعیه ایمنی: ${who} مبلغ ${amount} ریال در تاریخ ${date} به علت ${reason} به عنوان پاداش برای شما منظور گردید. ${SIGN}`;
  return `اخطار ایمنی: ${who} در تاریخ ${date} به علت ${reason} اخطار ایمنی برای شما ثبت گردید. ${SIGN}`;
}

// ═══════════════════════════════════════════════════════
// 📱 سرویس پیامک
// ═══════════════════════════════════════════════════════
async function sendSMS(phone, text) {
  if (!phone) return { success: false, error: 'شماره موبایل ثبت نشده است' };

  let cleanPhone = toEnDigits(phone).replace(/\D/g, '');
  if (cleanPhone.length === 10 && cleanPhone.startsWith('9')) cleanPhone = '0' + cleanPhone;
  if (!/^09\d{9}$/.test(cleanPhone)) return { success: false, error: `شماره نامعتبر (${phone})` };

  try {
    const { data, error } = await sb.functions.invoke('send-fine-sms', {
      body: { mobile: cleanPhone, text: text }
    });

    if (error) throw new Error(error.message || 'خطا در ارتباط با سرور');
    if (!data.success) throw new Error(data.error || 'خطای نامشخص از سمت آموت');

    return { success: true, messageId: data.messageId };
  } catch (e) {
    console.error('[SMS] Error:', e);
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════
// 📤 خروجی اکسل
// ═══════════════════════════════════════════════════════
function exportToExcel(headers, rows, filename) {
  if (!window.XLSX) {
    toast('کتابخانه اکسل لود نشده است', 'danger');
    return;
  }
  try {
    const wsData = [headers, ...rows];
    const ws = window.XLSX.utils.aoa_to_sheet(wsData);
    if(!ws['!views']) ws['!views'] = [];
    ws['!views'].push({ RTL: true });
    
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Report");
    window.XLSX.writeFile(wb, filename);
    toast('✅ فایل اکسل دانلود شد', 'success');
  } catch (e) {
    console.error('Excel Error:', e);
    toast('خطا در تولید فایل اکسل', 'danger');
  }
}

// ═══════════════════════════════════════════════════════
// 📤 خروجی PDF (اصلاح شده)
// ═══════════════════════════════════════════════════════
async function exportToPDF(title, headers, rows, filename) {
  if (!window.html2canvas || !window.jspdf) {
    toast('کتابخانه‌های PDF لود نشده‌اند', 'danger');
    return;
  }

  // ایجاد یک کانتینر با استایل امن برای رندر
  const tempDiv = document.createElement('div');
  tempDiv.style.position = 'absolute';
  tempDiv.style.top = '0';
  tempDiv.style.left = '-9999px'; // انتقال به خارج از صفحه
  tempDiv.style.width = '800px';
  tempDiv.style.backgroundColor = '#ffffff';
  tempDiv.style.direction = 'rtl';
  tempDiv.style.fontFamily = 'Tahoma, Arial, sans-serif';
  tempDiv.style.padding = '20px';
  // ⚠️ از opacity: 0 یا display: none استفاده نمی‌کنیم تا html2canvas بتواند آن را ببیند

  const tableRows = rows.map(row => `<tr>${row.map(cell => `<td style="border:1px solid #000; padding:8px; text-align:center;">${cell}</td>`).join('')}</tr>`).join('');
  
  tempDiv.innerHTML = `
    <h2 style="text-align:center; margin-bottom: 20px;">${title}</h2>
    <p style="text-align:left; font-size:12px;">تاریخ چاپ: ${todayJalali()}</p>
    <table style="width:100%; border-collapse:collapse; text-align:center; font-size:12px;">
      <thead><tr style="background:#f3f4f6;">${headers.map(h => `<th style="border:1px solid #000; padding:8px;">${h}</th>`).join('')}</tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;
  document.body.appendChild(tempDiv);

  try {
    toast('در حال آماده‌سازی PDF...', 'info');
    
    // صبر کوتاه برای لود کامل استایل‌ها
    await new Promise(r => setTimeout(r, 200));

    const canvas = await window.html2canvas(tempDiv, { 
      scale: 2, 
      useCORS: true,
      logging: false
    });
    const imgData = canvas.toDataURL('image/png');

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight);
    pdf.save(filename);
    
    toast('✅ PDF با موفقیت دانلود شد', 'success');
  } catch (err) {
    console.error('PDF Error:', err);
    toast('خطا در تولید PDF', 'danger');
  } finally {
    document.body.removeChild(tempDiv);
  }
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
        <button class="fr-tab" data-tab="sms"><i class="bi bi-phone"></i> پیامک‌ها</button>
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
      else if (t === 'sms') renderSMSStatus();
    };
  });
  renderList();
}

// ═══════════════════════════════════════════════════════
// تب لیست
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
  
  let smsBadge = '';
  if (item.sms_is_delivered) {
    smsBadge = '<span class="badge bg-success" style="font-size:0.6rem;">تحویل شد</span>';
  } else if (item.sms_status === 'sent') {
    smsBadge = '<span class="badge bg-warning text-dark" style="font-size:0.6rem;">ارسال شد</span>';
  } else if (item.sms_status === 'failed') {
    smsBadge = '<span class="badge bg-danger" style="font-size:0.6rem;">ناموفق</span>';
  } else {
    smsBadge = '<span class="badge bg-secondary" style="font-size:0.6rem;">در انتظار</span>';
  }

  return `
    <button class="fr-item ${meta.cls}" data-fr-id="${item.id}">
      <div class="fr-item-icon ${meta.cls}"><i class="bi ${meta.icon}"></i></div>
      <div class="fr-item-body">
        <div class="fr-item-head">
          <span class="fr-item-type ${meta.cls}">${meta.label}</span>
          <div class="d-flex gap-1 align-items-center">
            ${smsBadge}
            <span class="fr-item-date">${escapeHtml(dateStr)}</span>
          </div>
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
// مودال جزئیات (با نمایش ساعت تحویل)
// ═══════════════════════════════════════════════════════
function openDetail(item) {
  const typeFa = { fine: 'جریمه', reward: 'تشویقی', warning: 'اخطار' }[item.record_type] || '—';
  const name = item.patient ? `${item.patient.first_name||''} ${item.patient.last_name||''}`.trim() : '—';
  
  const deliveryDate = item.sms_delivery_datetime ? new Date(item.sms_delivery_datetime).toLocaleString('fa-IR') : '—';

  const sheet = document.createElement('div');
  sheet.className = 'fr-sheet';
  sheet.innerHTML = `
    <div class="fr-sheet-handle"></div>
    <div class="fr-sheet-title">جزئیات ${typeFa}</div>
    <div class="fr-detail-row"><span>نام کارگر:</span><b>${escapeHtml(name)}</b></div>
    <div class="fr-detail-row"><span>کد پرسنلی:</span><b dir="ltr">${escapeHtml(item.patient?.personnel_number||'—')}</b></div>
    <div class="fr-detail-row"><span>موبایل:</span><b dir="ltr">${escapeHtml(item.patient?.phone_number||'—')}</b></div>
    <div class="fr-detail-row"><span>تاریخ رویداد:</span><b>${escapeHtml(item.incident_datetime?gregorianToJalali(item.incident_datetime.split('T')[0]):'—')}</b></div>
    <div class="fr-detail-row"><span>علت:</span><b>${escapeHtml(item.reason||'—')}</b></div>
    ${item.amount?`<div class="fr-detail-row"><span>مبلغ:</span><b>${fmtMoney(item.amount)} ریال</b></div>`:''}
    
    <div class="fr-detail-row">
      <span>وضعیت پیامک:</span>
      <b>${item.sms_status === 'sent' ? '✅ ارسال شده' : item.sms_status === 'failed' ? '❌ ناموفق' : '⏳ در انتظار'}</b>
    </div>
    ${item.sms_is_delivered ? `<div class="fr-detail-row"><span>وضعیت تحویل:</span><b>📬 تحویل شده</b></div>` : ''}
    ${item.sms_delivery_datetime ? `<div class="fr-detail-row"><span>زمان تحویل:</span><b dir="ltr">${deliveryDate}</b></div>` : ''}
    ${item.sms_error ? `<div class="fr-detail-row"><span>علت خطا:</span><b class="text-danger">${escapeHtml(item.sms_error)}</b></div>` : ''}

    <div class="d-flex gap-2 mt-3">
      ${item.sms_status !== 'sent' ? `<button class="btn btn-primary w-100" id="frResendSingle"><i class="bi bi-arrow-repeat"></i> ارسال مجدد پیامک</button>` : ''}
      <button class="btn btn-light w-100" id="frCloseSheet">بستن</button>
    </div>
  `;
  const backdrop = document.createElement('div');
  backdrop.className = 'fr-backdrop';
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
  
  const close = () => { backdrop.classList.add('closing'); setTimeout(() => backdrop.remove(), 200); };
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  sheet.querySelector('#frCloseSheet').onclick = close;
  
  if (item.sms_status !== 'sent') {
    sheet.querySelector('#frResendSingle').onclick = async () => {
      const btn = sheet.querySelector('#frResendSingle');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ارسال...';
      
      const smsText = buildSmsText(item);
      const res = await sendSMS(item.patient?.phone_number, smsText);
      
      if (res.success) {
        await sb.from('safety_finereward').update({ sms_status: 'sent', sms_message_id: res.messageId, sms_error: null }).eq('id', item.id);
        toast('✅ پیامک با موفقیت ارسال شد', 'success');
        close(); loadList(); 
      } else {
        await sb.from('safety_finereward').update({ sms_status: 'failed', sms_error: res.error }).eq('id', item.id);
        toast(`❌ ارسال ناموفق: ${res.error}`, 'danger');
        btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> ارسال مجدد پیامک';
      }
    };
  }
}

// ═══════════════════════════════════════════════════════
// تب ثبت جدید
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
        <div class="fr-quick-chips" id="frLocationChips"></div>
      </div>

      <div class="fr-field">
        <label>محل جریمه / حادثه *</label>
        <input type="text" class="form-control" id="frIncidentLocation" placeholder="خط تولید / انبار / ...">
        <div class="fr-quick-chips" id="frIncidentLocationChips"></div>
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

      <button class="btn btn-primary w-100 fr-save-btn" id="frSave"><i class="bi bi-check-circle"></i> ثبت و ارسال پیامک</button>
    </div>
  `;

  const chipWrap = (wrapId, items, onPick) => {
    const w = $(wrapId);
    if (!w) return;
    items.forEach(v => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'fr-chip'; 
      b.textContent = typeof v === 'number' ? fmtMoney(v) : v;
      b.onclick = () => onPick(v);
      w.appendChild(b);
    });
  };

  chipWrap('frAmountChips', QUICK_AMOUNTS, v => { $('frAmount').value = v.toLocaleString('en-US'); });
  chipWrap('frReasonChips', QUICK_REASONS, v => { $('frReason').value = v; });
  chipWrap('frLocationChips', QUICK_REGISTER_LOCATIONS, v => { $('frLocation').value = v; });
  chipWrap('frIncidentLocationChips', QUICK_INCIDENT_LOCATIONS, v => { $('frIncidentLocation').value = v; });

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

let searchTimer = null;
function bindWorkerSearch() {
  const input = $('frWorkerSearch');
  const resultsEl = $('frWorkerResults');
  const selectedEl = $('frSelectedWorker');
  const statsEl = $('frWorkerStats');

  input.addEventListener('input', () => {
    if (selectedEl.style.display !== 'none') {
      selectedEl.style.display = 'none'; statsEl.style.display = 'none';
      delete input.dataset.workerId; delete input.dataset.phone;
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

  if (problems.length) {
    openMissingInfoModal({
      patientId: id, name,
      missingFields: { national_code: !national, phone_number: !phone },
      onSave: async (updated) => {
        if (updated.phone_number && !/^09\d{9}$/.test(updated.phone_number)) { toast('شماره موبایل نامعتبر', 'danger'); return false; }
        if (updated.national_code && !/^\d{10}$/.test(updated.national_code)) { toast('کد ملی نامعتبر', 'danger'); return false; }
        const { error } = await sb.from('core_patient').update(updated).eq('id', id);
        if (error) { toast('خطا: ' + error.message, 'danger'); return false; }
        await finalizeSelection(id, name, personnel, updated.phone_number || phone, input, resultsEl, selectedEl, statsEl);
        return true;
      }
    });
    return;
  }
  await finalizeSelection(id, name, personnel, phone, input, resultsEl, selectedEl, statsEl);
}

async function finalizeSelection(id, name, personnel, phone, input, resultsEl, selectedEl, statsEl) {
  input.value = name;
  input.dataset.workerId = id;
  input.dataset.phone = phone;
  resultsEl.innerHTML = '';
  selectedEl.style.display = 'block';
  selectedEl.innerHTML = `<div class="fr-selected-inner"><i class="bi bi-check-circle-fill"></i><div><div class="fr-selected-name">${escapeHtml(name)}</div><div class="fr-selected-meta">${personnel?'کد پرسنلی: '+escapeHtml(personnel):''}</div></div></div>`;

  statsEl.style.display = 'block';
  statsEl.innerHTML = '<div class="fr-loading">در حال بارگذاری آمار...</div>';

  try {
    const { count: incidentCount } = await sb.from('visits_visit').select('id', { count: 'exact', head: true }).eq('patient_id', id).neq('incident_type', 'none').not('incident_type', 'is', null);
    const { data: records } = await sb.from('safety_finereward').select('record_type').eq('worker_id', id);
    const fines = (records||[]).filter(r => r.record_type === 'fine').length;
    const rewards = (records||[]).filter(r => r.record_type === 'reward').length;
    const warnings = (records||[]).filter(r => r.record_type === 'warning').length;

    let score = 5;
    score -= Math.min(3, incidentCount * 0.5);
    score -= Math.min(2, warnings * 0.4);
    score -= Math.min(2, fines * 0.3);
    score += Math.min(1, rewards * 0.3);
    score = Math.max(1, Math.min(5, score));
    const stars = Math.round(score);
    const scoreText = stars >= 4 ? 'وضعیت مطلوب' : stars >= 3 ? 'نیاز به توجه' : 'وضعیت پرخطر';

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

async function saveRecord() {
  const input = $('frWorkerSearch');
  const workerId = input.dataset.workerId;
  const phone = input.dataset.phone;
  if (!workerId) { toast('ابتدا کارگر را انتخاب کنید', 'warning'); return; }

  const reason = $('frReason').value.trim();
  if (!reason) { toast('علت اجباری است', 'warning'); return; }
  const location = $('frLocation').value.trim();
  if (!location) { toast('محل ثبت اجباری است', 'warning'); return; }
  const incidentLocation = $('frIncidentLocation').value.trim();
  if (!incidentLocation) { toast('محل جریمه/حادثه اجباری است', 'warning'); return; }

  const isoDT = toISOWithTime($('frDate').value.trim(), $('frTime').value.trim());
  if (!isoDT) { toast('تاریخ نامعتبر', 'warning'); return; }

  const rawAmount = toEnDigits($('frAmount').value);
  const amount = parseInt(rawAmount.replace(/[^\d]/g, ''), 10) || 0;
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
    sms_status: 'pending'
  };

  try {
    const { data: inserted, error } = await sb.from('safety_finereward').insert(record).select().single();
    if (error) throw error;

    const smsText = buildSmsText(record);
    const smsResult = await sendSMS(phone, smsText);
    
    if (smsResult.success) {
      await sb.from('safety_finereward').update({ sms_status: 'sent', sms_message_id: smsResult.messageId, sms_error: null }).eq('id', inserted.id);
      toast('✅ ثبت شد و پیامک ارسال گردید', 'success');
    } else {
      await sb.from('safety_finereward').update({ sms_status: 'failed', sms_error: smsResult.error }).eq('id', inserted.id);
      toast(`⚠️ ثبت شد اما پیامک ناموفق بود: ${smsResult.error}`, 'warning');
    }
    document.querySelector('.fr-tab[data-tab="list"]').click();
  } catch (e) {
    console.error(e);
    toast('خطا در ثبت: ' + e.message, 'danger');
  }
}

// ═══════════════════════════════════════════════════════
// تب مالی
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
          ${pending.length ? `
            <div class="d-flex gap-1">
              <button class="btn btn-success btn-sm" id="frSendAll"><i class="bi bi-file-earmark-excel"></i> اکسل</button>
              <button class="btn btn-outline-danger btn-sm" id="frExportPendingPDF"><i class="bi bi-file-earmark-pdf"></i> PDF</button>
            </div>
          ` : '<span class="badge-soft success">همه ارسال شده</span>'}
        </div>
        ${pending.length ? `<div class="fr-list">${pending.map(renderFinanceItem).join('')}</div>` : ''}
      </div>

      ${sent.length ? `
        <div class="fr-finance-section" style="margin-top:20px;">
          <div class="fr-finance-header sent">
            <div><i class="bi bi-check2-circle"></i> ${sent.length} مورد ارسال‌شده</div>
            <div class="d-flex gap-1">
              <button class="btn btn-outline-success btn-sm" id="frExportSent"><i class="bi bi-file-earmark-excel"></i> اکسل</button>
              <button class="btn btn-outline-danger btn-sm" id="frExportSentPDF"><i class="bi bi-file-earmark-pdf"></i> PDF</button>
            </div>
          </div>
          <div class="fr-list">${sent.slice(0, 50).map(renderFinanceItem).join('')}</div>
        </div>` : ''}
    `;

    if ($('frSendAll')) $('frSendAll').onclick = () => exportAndMark(pending, 'excel');
    if ($('frExportPendingPDF')) $('frExportPendingPDF').onclick = () => exportAndMark(pending, 'pdf');
    if ($('frExportSent')) $('frExportSent').onclick = () => exportFinance(sent, 'excel');
    if ($('frExportSentPDF')) $('frExportSentPDF').onclick = () => exportFinance(sent, 'pdf');
  } catch (e) {
    body.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
  }
}

function renderFinanceItem(it) {
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

async function exportAndMark(records, format) {
  if (!records.length) return;
  const headers = ['نام', 'کد پرسنلی', 'کد ملی', 'موبایل', 'نوع', 'مبلغ (ریال)', 'علت', 'محل ثبت', 'تاریخ'];
  const rows = records.map(r => [
    `${r.patient?.first_name||''} ${r.patient?.last_name||''}`.trim(),
    r.patient?.personnel_number || '', r.patient?.national_code || '', r.patient?.phone_number || '',
    r.record_type === 'fine' ? 'جریمه' : r.record_type === 'reward' ? 'تشویقی' : 'اخطار',
    r.amount || 0, (r.reason || '').replace(/,/g, ' '), (r.location || '').replace(/,/g, ' '),
    r.incident_datetime ? gregorianToJalali(r.incident_datetime.split('T')[0]) : '',
  ]);

  if (format === 'excel') {
    exportToExcel(headers, rows, `finance-pending-${todayJalali().replace(/\//g,'-')}.xlsx`);
  } else {
    exportToPDF('گزارش مالی ارسال‌نشده', headers, rows, `finance-pending-${todayJalali().replace(/\//g,'-')}.pdf`);
  }
  
  const ids = records.map(r => r.id);
  const now = new Date().toISOString();
  await sb.from('safety_finereward').update({ sent_to_finance: true, finance_sent_at: now, status_changed_at: now }).in('id', ids);
  toast('✅ گزارش دانلود و علامت‌گذاری شد', 'success'); renderFinance();
}

function exportFinance(records, format) {
  const headers = ['نام', 'کد پرسنلی', 'کد ملی', 'موبایل', 'نوع', 'مبلغ (ریال)', 'علت', 'محل ثبت', 'تاریخ'];
  const rows = records.map(r => [
    `${r.patient?.first_name||''} ${r.patient?.last_name||''}`.trim(),
    r.patient?.personnel_number || '', r.patient?.national_code || '', r.patient?.phone_number || '',
    r.record_type === 'fine' ? 'جریمه' : r.record_type === 'reward' ? 'تشویقی' : 'اخطار',
    r.amount || 0, (r.reason || '').replace(/,/g, ' '), (r.location || '').replace(/,/g, ' '),
    r.incident_datetime ? gregorianToJalali(r.incident_datetime.split('T')[0]) : '',
  ]);
  
  if (format === 'excel') {
    exportToExcel(headers, rows, `finance-sent-${todayJalali().replace(/\//g,'-')}.xlsx`);
  } else {
    exportToPDF('گزارش مالی ارسال‌شده', headers, rows, `finance-sent-${todayJalali().replace(/\//g,'-')}.pdf`);
  }
}

// ═══════════════════════════════════════════════════════
// تب پیامک‌ها
// ═══════════════════════════════════════════════════════
async function renderSMSStatus() {
  const body = $('frBody');
  
  let creditInfo = null;
  const statusRes = await getAccountStatus();
  if (statusRes.success) creditInfo = statusRes.data;

  let lastExportDate = '—';
  try {
    const { data: lastExp } = await sb.from('safety_finereward')
      .select('sms_exported_at').not('sms_exported_at', 'is', null)
      .order('sms_exported_at', { ascending: false }).limit(1);
    if (lastExp && lastExp.length) lastExportDate = gregorianToJalali(lastExp[0].sms_exported_at.split('T')[0]);
  } catch(e) {}

  body.innerHTML = `
    <div class="card mb-3" style="background:#f8fafc; border:none; border-radius:12px;">
      <div class="card-body p-3 d-flex justify-content-between align-items-center">
        <div>
          <div style="font-size:0.8rem; color:#64748b;">اعتبار پنل پیامک:</div>
          <div class="fw-bold" style="font-size:1.1rem; color:#0f172a;">${creditInfo ? fmtMoney(creditInfo.RemaindCredit) + ' ریال' : 'نامشخص'}</div>
        </div>
        <a href="https://hub.amootsoft.com/panel/" target="_blank" class="btn btn-sm btn-outline-primary"><i class="bi bi-plus-circle"></i> شارژ</a>
      </div>
    </div>

    <div class="fr-filters" style="background:#fff; border-radius:12px; padding:12px; margin-bottom:12px; box-shadow:0 1px 4px rgba(0,0,0,0.05);">
      <div class="input-group mb-2">
        <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
        <input type="text" id="frSmsFilterQuery" placeholder="جستجو..." class="form-control">
      </div>
      <div class="row g-2">
        <div class="col-6"><input type="text" id="frSmsFilterFrom" placeholder="از تاریخ" value="${todayJalali().slice(0,4)}/01/01" class="form-control" dir="ltr"></div>
        <div class="col-6"><input type="text" id="frSmsFilterTo" placeholder="تا تاریخ" value="${todayJalali()}" class="form-control" dir="ltr"></div>
      </div>
      <div class="d-flex justify-content-between align-items-center mt-2">
        <button class="btn btn-primary btn-sm flex-grow-1 me-2" id="frSmsApplyFilter"><i class="bi bi-funnel"></i> اعمال فیلتر</button>
        <button class="btn btn-info btn-sm text-white" id="frCheckDeliveryBtn"><i class="bi bi-arrow-repeat"></i> استعلام تحویل</button>
      </div>
    </div>
    <div id="frSmsListContainer"><div class="text-center py-4"><div class="spinner-border text-primary"></div></div></div>
  `;

  $('frSmsApplyFilter').onclick = loadSMSStatusList;
  $('frCheckDeliveryBtn').onclick = checkAllDeliveries;
  loadSMSStatusList();
}

async function loadSMSStatusList() {
  const c = $('frSmsListContainer');
  c.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>';

  const q = $('frSmsFilterQuery')?.value.trim().toLowerCase() || '';
  const from = $('frSmsFilterFrom')?.value.trim() || '';
  const to = $('frSmsFilterTo')?.value.trim() || '';

  try {
    let query = sb.from('safety_finereward')
      .select('*, patient:core_patient(first_name, last_name, personnel_number, phone_number)')
      .not('sms_status', 'eq', 'pending')
      .order('created_at', { ascending: false });

    const fromG = from ? jalaliToGregorian(from) : null;
    const toG = to ? jalaliToGregorian(to) : null;
    if (fromG) query = query.gte('incident_datetime', fromG + 'T00:00:00');
    if (toG) query = query.lte('incident_datetime', toG + 'T23:59:59');

    const { data, error } = await query;
    if (error) throw error;

    let list = data || [];
    if (q) {
      list = list.filter(it => {
        const haystack = [it.patient?.first_name, it.patient?.last_name, it.patient?.personnel_number, it.patient?.phone_number, it.sms_error, it.reason].join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }

    if (!list.length) {
      c.innerHTML = `<div class="fr-empty"><i class="bi bi-inbox"></i><div>موردی یافت نشد</div></div>`;
      return;
    }

    c.innerHTML = `
      <div class="fr-finance-section">
        <div class="fr-finance-header" style="background:#e0e7ff; color:#3730a3; margin-bottom:10px;">
          <div><i class="bi bi-phone"></i> ${list.length} پیامک</div>
          <div class="d-flex gap-1 flex-wrap">
            <button class="btn btn-outline-primary btn-sm" id="frExportFailedExcel"><i class="bi bi-file-earmark-excel"></i> اکسل</button>
            <button class="btn btn-outline-primary btn-sm" id="frExportFailedPDF"><i class="bi bi-file-earmark-pdf"></i> PDF</button>
            <button class="btn btn-primary btn-sm" id="frResendFailed"><i class="bi bi-arrow-repeat"></i> ارسال مجدد ناموفق‌ها</button>
          </div>
        </div>
        <div class="fr-list" id="frFailedList">
          ${list.map(it => {
            let badge = '';
            if (it.sms_is_delivered) badge = '<span class="badge bg-success">تحویل شد</span>';
            else if (it.sms_status === 'sent') badge = '<span class="badge bg-warning text-dark">ارسال شد (در انتظار تحویل)</span>';
            else if (it.sms_status === 'failed') badge = '<span class="badge bg-danger">ناموفق</span>';
            else badge = '<span class="badge bg-secondary">در انتظار</span>';
            
            return `
            <div class="fr-item ${it.sms_status === 'failed' ? 'danger' : ''}" data-id="${it.id}">
              <div class="fr-item-icon ${it.sms_status === 'failed' ? 'danger' : 'success'}"><i class="bi ${it.sms_status === 'failed' ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill'}"></i></div>
              <div class="fr-item-body">
                <div class="fr-item-head mb-1">
                  <div class="fr-item-name">${escapeHtml((it.patient?.first_name||'')+' '+(it.patient?.last_name||''))}</div>
                  ${badge}
                </div>
                <div class="fr-item-personnel">موبایل: ${escapeHtml(it.patient?.phone_number||'—')}</div>
                ${it.sms_error ? `<div class="fr-item-reason text-danger small mt-1">خطا: ${escapeHtml(it.sms_error)}</div>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;

    $('frExportFailedExcel').onclick = async () => {
      const headers = ['نام', 'کد پرسنلی', 'موبایل', 'وضعیت ارسال', 'وضعیت تحویل', 'زمان تحویل', 'علت خطا', 'تاریخ'];
      const rows = list.map(r => [
        `${r.patient?.first_name||''} ${r.patient?.last_name||''}`.trim(),
        r.patient?.personnel_number || '', r.patient?.phone_number || '',
        r.sms_status === 'failed' ? 'ناموفق' : 'ارسال شده',
        r.sms_is_delivered ? 'تحویل شده' : 'تحویل نشده',
        r.sms_delivery_datetime ? new Date(r.sms_delivery_datetime).toLocaleString('fa-IR') : '—',
        r.sms_error || '—',
        r.incident_datetime ? gregorianToJalali(r.incident_datetime.split('T')[0]) : '',
      ]);
      exportToExcel(headers, rows, `sms-report-${todayJalali().replace(/\//g,'-')}.xlsx`);
      
      const ids = list.map(r => r.id);
      await sb.from('safety_finereward').update({ sms_exported_at: new Date().toISOString() }).in('id', ids);
      toast('✅ خروجی اکسل ذخیره شد', 'success');
    };

    $('frExportFailedPDF').onclick = () => {
      const headers = ['ردیف', 'نام', 'موبایل', 'وضعیت', 'زمان تحویل', 'علت خطا'];
      const rows = list.map((r, idx) => [
        idx + 1,
        `${r.patient?.first_name||''} ${r.patient?.last_name||''}`.trim(),
        r.patient?.phone_number || '—',
        r.sms_status === 'failed' ? 'ناموفق' : (r.sms_is_delivered ? 'تحویل شده' : 'ارسال شده'),
        r.sms_delivery_datetime ? new Date(r.sms_delivery_datetime).toLocaleString('fa-IR') : '—',
        r.sms_error || '—',
      ]);
      exportToPDF('گزارش وضعیت پیامک‌ها', headers, rows, `sms-report-${todayJalali().replace(/\//g,'-')}.pdf`);
    };

    $('frResendFailed').onclick = async () => {
      const failedItems = list.filter(it => it.sms_status === 'failed');
      if (!failedItems.length) { toast('پیامک ناموفقی در این لیست نیست', 'info'); return; }
      if (!confirm(`آیا مایل به ارسال مجدد ${failedItems.length} پیامک ناموفق هستید؟`)) return;
      
      const btn = $('frResendFailed');
      btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ارسال...';
      
      let success = 0, fail = 0;
      for (const item of failedItems) {
        const smsText = buildSmsText(item);
        const res = await sendSMS(item.patient?.phone_number, smsText);
        
        if (res.success) {
          await sb.from('safety_finereward').update({ sms_status: 'sent', sms_message_id: res.messageId, sms_error: null }).eq('id', item.id);
          success++;
        } else {
          await sb.from('safety_finereward').update({ sms_status: 'failed', sms_error: res.error }).eq('id', item.id);
          fail++;
        }
      }
      toast(`پایان یافت. موفق: ${success}، ناموفق: ${fail}`, success ? 'success' : 'danger');
      renderSMSStatus();
    };

  } catch (e) {
    c.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
  }
}

// ⭐ تابع استعلام وضعیت تحویل (با ذخیره تاریخ/ساعت تحویل)
async function checkAllDeliveries() {
  const btn = $('frCheckDeliveryBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال استعلام...';

  try {
    const { data: pendingList, error } = await sb.from('safety_finereward')
      .select('id, sms_message_id')
      .eq('sms_status', 'sent')
      .eq('sms_is_delivered', false)
      .not('sms_message_id', 'is', null)
      .or('sms_delivery_status.is.null,sms_delivery_status.neq.invalid')
      .limit(50);

    if (error) throw error;
    if (!pendingList || pendingList.length === 0) {
      toast('هیچ پیامک در انتظار تحویلی وجود ندارد', 'info');
      btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> استعلام تحویل';
      return;
    }

    const messageIds = pendingList.map(p => p.sms_message_id);
    let updatedCount = 0;
    let invalidCount = 0;

    const processDelivery = async (del) => {
      // ⭐ ذخیره تاریخ و ساعت تحویل همراه با وضعیت
      const updateData = { 
        sms_is_delivered: true, 
        sms_delivery_status: del.Status,
        sms_status: 'sent', // مجبور کردن سیستم به آپدیت وضعیت اصلی
        sms_send_datetime: del.SendDateTime ? del.SendDateTime : null,
        sms_delivery_datetime: del.DeliveryDateTime ? del.DeliveryDateTime : (del.SendDateTime ? del.SendDateTime : null)
      };
      await sb.from('safety_finereward').update(updateData).eq('sms_message_id', del.MessageID);
    };

    // تلاش برای استعلام گروهی
    const res = await getDeliveries(messageIds);
    
    if (res.success && res.data.Status !== 'Failed') {
      const deliveries = res.data?.Data || res.data?.data || [];
      for (const del of deliveries) {
        if (['2', 'delivered', 'success'].includes(String(del.Status).toLowerCase())) {
          await processDelivery(del);
          updatedCount++;
        }
      }
    } else {
      console.warn('استعلام گروهی خطا داد، در حال بررسی تک‌تک...');
      toast('استعلام گروهی خطا داد. در حال بررسی تک‌تک پیام‌ها...', 'warning');

      for (const msgId of messageIds) {
        const singleRes = await getDeliveries([msgId]);
        
        if (!singleRes.success || singleRes.data.Status === 'Failed') {
          await sb.from('safety_finereward')
            .update({ sms_delivery_status: 'invalid' })
            .eq('sms_message_id', msgId);
          invalidCount++;
        } else {
          const deliveries = singleRes.data?.Data || singleRes.data?.data || [];
          for (const del of deliveries) {
            if (['2', 'delivered', 'success'].includes(String(del.Status).toLowerCase())) {
              await processDelivery(del);
              updatedCount++;
            }
          }
        }
        await new Promise(r => setTimeout(r, 300));
      }
    }

    let msg = `استعلام پایان یافت. ${updatedCount} پیامک تحویل شد.`;
    if (invalidCount > 0) msg += ` (${invalidCount} شناسه نامعتبر نادیده گرفته شد)`;
    toast(msg, 'success');
    
    loadSMSStatusList();

  } catch (e) {
    console.error('Delivery check error:', e);
    toast('خطا در استعلام: ' + e.message, 'danger');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> استعلام تحویل';
  }
}
