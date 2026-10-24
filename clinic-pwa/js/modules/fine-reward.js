// js/modules/fine-reward.js
import { sb } from '../sb.js';
import { $, toast, escapeHtml, gregorianToJalali, jalaliToGregorian, todayJalali } from '../utils.js';
import { getAccountStatus, getDeliveries } from './amoot-api.js';
import { fitAndPrint } from '../forms/print-fit.js';

// ═══════════════════════════════════════════════════════
// متغیرهای سراسری و ثابت‌ها
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

let lastSmsCheckTime = 0;
let selectedItemsForPrint = new Map();

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

const formatDateTime = (isoStr) => {
  if (!isoStr) return '—';
  try {
    const parts = String(isoStr).split('T');
    if (parts.length !== 2) return '—';
    const datePart = parts[0]; 
    const timePart = parts[1].split('.')[0]; 
    return `${gregorianToJalali(datePart)} - ${timePart.split(':').slice(0, 2).join(':')}`;
  } catch (e) { return '—'; }
};

// ⭐️ تبدیل عدد به حروف
function numberToWords(num) {
  if (num === 0) return 'صفر';
  const yekan = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
  const dahgan = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
  const sadgan = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
  const scales = ['', 'هزار', 'میلیون', 'میلیارد'];

  let words = [];
  let scaleIndex = 0;

  while (num > 0) {
    let chunk = num % 1000;
    if (chunk > 0) {
      let chunkWords = [];
      let s = Math.floor(chunk / 100);
      let d = Math.floor((chunk % 100) / 10);
      let y = chunk % 10;

      if (s > 0) chunkWords.push(sadgan[s]);
      let remainder = chunk % 100;
      if (remainder >= 11 && remainder <= 19) {
        const teens = ['', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
        chunkWords.push(teens[remainder - 10]);
      } else {
        if (d > 1) chunkWords.push(dahgan[d]);
        if (y > 0) chunkWords.push(yekan[y]);
      }
      if (scaleIndex > 0) chunkWords.push(scales[scaleIndex]);
      words.unshift(chunkWords.join(' و '));
    }
    num = Math.floor(num / 1000);
    scaleIndex++;
  }
  return words.join(' و ');
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
    if (!data.success) throw new Error(data.error || 'خطای نامشخص');
    return { success: true, messageId: data.messageId };
  } catch (e) { return { success: false, error: e.message }; }
}

// ═══════════════════════════════════════════════════════
// 📤 خروجی اکسل و PDF
// ═══════════════════════════════════════════════════════
function exportToExcel(headers, rows, filename) {
  if (!window.XLSX) { toast('کتابخانه اکسل لود نشده است', 'danger'); return; }
  try {
    const wsData = [headers, ...rows];
    const ws = window.XLSX.utils.aoa_to_sheet(wsData);
    if(!ws['!views']) ws['!views'] = [];
    ws['!views'].push({ RTL: true });
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Report");
    window.XLSX.writeFile(wb, filename);
    toast('✅ فایل اکسل دانلود شد', 'success');
  } catch (e) { toast('خطا در تولید فایل اکسل', 'danger'); }
}

async function exportToPDF(title, headers, rows, filename) {
  if (!window.html2canvas || !window.jspdf) { toast('کتابخانه‌های PDF لود نشده‌اند', 'danger'); return; }
  const tempDiv = document.createElement('div');
  tempDiv.style.position = 'absolute'; tempDiv.style.top = '0'; tempDiv.style.left = '-9999px';
  tempDiv.style.width = '800px'; tempDiv.style.backgroundColor = '#ffffff';
  tempDiv.style.direction = 'rtl'; tempDiv.style.fontFamily = 'Tahoma, Arial, sans-serif';
  tempDiv.style.padding = '20px';

  const tableRows = rows.map(row => `<tr>${row.map(cell => `<td style="border:1px solid #000; padding:6px; text-align:center; font-size:11px;">${cell}</td>`).join('')}</tr>`).join('');
  
  tempDiv.innerHTML = `
    <h2 style="text-align:center; margin-bottom: 20px;">${title}</h2>
    <p style="text-align:left; font-size:12px;">تاریخ چاپ: ${todayJalali()}</p>
    <table style="width:100%; border-collapse:collapse; text-align:center; font-size:11px;">
      <thead><tr style="background:#f3f4f6;">${headers.map(h => `<th style="border:1px solid #000; padding:6px;">${h}</th>`).join('')}</tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;
  document.body.appendChild(tempDiv);

  try {
    toast('در حال آماده‌سازی PDF...', 'info');
    await new Promise(r => setTimeout(r, 200));
    const canvas = await window.html2canvas(tempDiv, { scale: 2, useCORS: true, logging: false });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight);
    pdf.save(filename);
    toast('✅ PDF دانلود شد', 'success');
  } catch (err) { toast('خطا در تولید PDF', 'danger'); } 
  finally { document.body.removeChild(tempDiv); }
}

// ═══════════════════════════════════════════════════════
// 📄 قالب چاپ فرم BR-FR-HS-07-00
// ═══════════════════════════════════════════════════════
function buildPrintFormHTML(record) {
  const name = record.patient ? `${record.patient.first_name||''} ${record.patient.last_name||''}`.trim() : (record.patient_name || '—');
  const pCode = record.patient?.personnel_number || record.personnel_number || '—';
  const company = record.patient?.company?.name || record.company_name || '—';
  const date = record.incident_datetime ? gregorianToJalali(record.incident_datetime.split('T')[0]) : (record.date || '—');
  const time = record.incident_datetime ? record.incident_datetime.split('T')[1].slice(0,5) : (record.time || '—');
  const reason = record.reason || '—';
  const amountNum = record.amount || 0;
  const amountStr = numberToWords(amountNum);
  
  const typeLabel = record.record_type === 'fine' ? 'جریمه' : (record.record_type === 'reward' ? 'پاداش' : 'اخطار');

  return `
    <div class="form-sheet fs compact" dir="rtl">
      <table class="fs-head">
        <tr>
          <td class="fs-logo"><img src="icons/logo-transparent.png" alt="Logo"></td>
          <td class="fs-title">فرم اخطار کتبی و ${typeLabel}</td>
          <td class="fs-code">کد فرم: <bdi>BR-FR-HS-07-00</bdi></td>
        </tr>
      </table>

      <div class="fs-para" style="margin-top: 20px; text-align: justify; font-size: 14px; line-height: 2.5;">
        بدینوسیله به آقای/خانم/شرکت پیمانکاری 
        <span class="fs-dots w160" style="font-size: 16px;">${escapeHtml(name)}</span> 
        به شماره پرسنلی 
        <span class="fs-dots w90" dir="ltr">${escapeHtml(pCode)}</span> 
        از واحد 
        <span class="fs-dots w120">${escapeHtml(company)}</span> 
        در تاریخ 
        <span class="fs-dots w90" dir="ltr">${escapeHtml(date)}</span> 
        ساعت 
        <span class="fs-dots w60" dir="ltr">${escapeHtml(time)}</span>
        <br><br>
        به علت 
        <span class="fs-dots w220" style="font-size: 16px;">${escapeHtml(reason)}</span> 
        اخطار کتبی جهت درج در پرونده ابلاغ گردید. ضمنا نامبرده به مبلغ (به عدد) 
        <span class="fs-dots w120" dir="ltr">${fmtMoney(amountNum)}</span> 
        ریال (به حروف) 
        <span class="fs-dots w220">${escapeHtml(amountStr)}</span> 
        ریال ${typeLabel} شد که مراتب جهت اجرا به واحد اداری اعلام می‌گردد.
        <br><br>
        لازم به ذکر است در صورت تکرار تخلف بیش از سه مرتبه، مراتب در کمیته انضباطی بررسی و تصمیم‌گیری خواهد شد.
      </div>

      <div style="display: flex; justify-content: space-between; margin-top: 40px; font-size: 13px; font-weight: 700;">
        <div style="text-align: center;">
          امضاء رئیس ایمنی، بهداشت و محیط زیست
          <br><br><br>
          ....................
        </div>
        <div style="text-align: center;">
          امضاء افسر ایمنی
          <br><br><br>
          ....................
        </div>
      </div>

      <div style="margin-top: 40px; font-size: 11px; text-align: center; border-top: 1px solid #ccc; padding-top: 10px;">
        نسخه سفید: واحد اداری &nbsp;&nbsp;&nbsp; نسخه زرد: خاطی &nbsp;&nbsp;&nbsp; نسخه قرمز: واحد HSE
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
// 🖨️ منطق چاپ و آرشیو
// ═══════════════════════════════════════════════════════
async function handlePrint(records) {
  if (!records.length) return;

  const now = Date.now();
  const isRecentCheck = (now - lastSmsCheckTime) < 5 * 60 * 1000;

  const invalidRecords = records.filter(r => !r.sms_is_delivered);

  if (!isRecentCheck && invalidRecords.length > 0) {
    toast('⚠️ ابتدا از تب پیامک‌ها استعلام وضعیت تحویل را بگیرید (حداکثر ۵ دقیقه پیش).', 'warning');
    return;
  }

  const root = document.createElement('div');
  root.id = 'formPrintArea';
  root.innerHTML = records.map(buildPrintFormHTML).join('');

  fitAndPrint(root, {
    onAfterPrint: async () => {
      const ids = records.map(r => r.id);
      const nowIso = new Date().toISOString();
      
      // ۱. آپدیت وضعیت چاپ در جدول جریمه
      await sb.from('safety_finereward').update({ is_printed: true, printed_at: nowIso }).in('id', ids);

      // ۲. ⭐️ ثبت در آرشیو فرم‌ها (فقط برای مواردی که قبلاً ثبت نشده‌اند)
      const { data: { user } } = await sb.auth.getUser();
      const archiveRecords = records.filter(r => !r.archived_record_id).map(r => {
        const name = r.patient ? `${r.patient.first_name||''} ${r.patient.last_name||''}`.trim() : '—';
        return {
          form_code: 'BR-FR-HS-07-00',
          patient_id: r.worker_id,
          data: {
            patient_name: name,
            personnel_number: r.patient?.personnel_number || '—',
            company_name: r.patient?.company?.name || '—',
            date: r.incident_datetime ? gregorianToJalali(r.incident_datetime.split('T')[0]) : '—',
            time: r.incident_datetime ? r.incident_datetime.split('T')[1].slice(0,5) : '—',
            reason: r.reason,
            amount: r.amount,
            record_type: r.record_type
          },
          created_by: user?.id || null,
          created_at: nowIso
        };
      });

      if (archiveRecords.length > 0) {
        await sb.from('form_records').insert(archiveRecords);
      }

      selectedItemsForPrint.clear();
      renderList(); 
      toast('✅ فرم چاپ و در آرشیو ذخیره شد', 'success');
    }
  });
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
        <div class="fr-sub">ثبت، پیامک، چاپ فرم و گزارش‌گیری</div>
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
      selectedItemsForPrint.clear();
      if (t === 'list') renderList();
      else if (t === 'add') renderAddForm();
      else if (t === 'finance') renderFinance();
      else if (t === 'sms') renderSMSStatus();
    };
  });
  renderList();
}

// ═══════════════════════════════════════════════════════
// تب لیست (با انتخاب برای چاپ)
// ═══════════════════════════════════════════════════════
async function renderList() {
  const body = $('frBody');
  body.innerHTML = `
    <div class="fr-filters">
      <div class="input-group mb-2">
        <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
        <input type="text" id="frFilterQuery" placeholder="جستجو..." class="form-control">
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
    
    <div id="frBulkPrintBar" class="d-none mb-3 p-2 bg-primary text-white rounded-3 d-flex justify-content-between align-items-center" style="box-shadow: 0 4px 12px rgba(13,110,253,0.3);">
      <div><span id="frSelectedCount">0</span> مورد انتخاب شده</div>
      <button class="btn btn-sm btn-light fw-bold" id="frPrintSelected"><i class="bi bi-printer"></i> چاپ موارد انتخابی</button>
    </div>

    <div id="frListContainer"><div class="text-center py-4"><div class="spinner-border text-primary"></div></div></div>
  `;

  $('frApplyFilter').onclick = loadList;
  $('frPrintSelected').onclick = () => {
    const itemsToPrint = Array.from(selectedItemsForPrint.values());
    if (itemsToPrint.length) handlePrint(itemsToPrint);
  };
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
      .select('*, patient:core_patient(first_name, last_name, personnel_number, national_code, phone_number, company:core_company(name))')
      .order('created_at', { ascending: false }).limit(100);
      
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

    c.innerHTML = `<div class="fr-list">${list.map(item => renderListItem(item)).join('')}</div>`;
    
    c.querySelectorAll('.fr-item').forEach(el => {
      const id = el.dataset.frId;
      
      el.addEventListener('click', (e) => {
        if (e.target.closest('.fr-check-wrap')) return; 
        const item = list.find(x => String(x.id) === String(id));
        if (item) openDetail(item);
      });

      const checkbox = el.querySelector('.fr-checkbox');
      if (checkbox) {
        if (selectedItemsForPrint.has(id)) checkbox.checked = true;

        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            const item = list.find(x => String(x.id) === String(id));
            selectedItemsForPrint.set(id, item);
          } else {
            selectedItemsForPrint.delete(id);
          }
          updateBulkPrintBar();
        });
      }
    });
  } catch (e) {
    c.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
  }
}

function updateBulkPrintBar() {
  const bar = $('frBulkPrintBar');
  const count = $('frSelectedCount');
  if (selectedItemsForPrint.size > 0) {
    bar.classList.remove('d-none');
    count.textContent = selectedItemsForPrint.size;
  } else {
    bar.classList.add('d-none');
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

  let printBadge = item.is_printed ? `<span class="badge bg-info text-dark" style="font-size:0.6rem;"><i class="bi bi-printer"></i> چاپ شد</span>` : '';

  return `
    <div class="fr-item ${meta.cls}" data-fr-id="${item.id}">
      <div class="fr-check-wrap" style="padding: 10px 0 10px 10px; display:flex; align-items:center;">
        <input type="checkbox" class="fr-checkbox" style="width:20px; height:20px; cursor:pointer;">
      </div>
      <div class="fr-item-icon ${meta.cls}"><i class="bi ${meta.icon}"></i></div>
      <div class="fr-item-body">
        <div class="fr-item-head">
          <span class="fr-item-type ${meta.cls}">${meta.label}</span>
          <div class="d-flex gap-1 align-items-center flex-wrap">
            ${printBadge}
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
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
// مودال جزئیات (با دکمه چاپ تکی)
// ═══════════════════════════════════════════════════════
function openDetail(item) {
  const typeFa = { fine: 'جریمه', reward: 'تشویقی', warning: 'اخطار' }[item.record_type] || '—';
  const name = item.patient ? `${item.patient.first_name||''} ${item.patient.last_name||''}`.trim() : '—';
  const deliveryDate = formatDateTime(item.sms_delivery_datetime);

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
    ${item.sms_cost ? `<div class="fr-detail-row"><span>هزینه پیامک:</span><b>${fmtMoney(item.sms_cost)} ریال</b></div>` : ''}
    ${item.sms_error ? `<div class="fr-detail-row"><span>علت خطا:</span><b class="text-danger">${escapeHtml(item.sms_error)}</b></div>` : ''}

    <div class="d-flex flex-column gap-2 mt-3">
      <button class="btn btn-dark w-100" id="frPrintSingle"><i class="bi bi-printer"></i> چاپ فرم ${typeFa}</button>
      ${item.sms_status !== 'sent' ? `<button class="btn btn-outline-primary w-100" id="frResendSingle"><i class="bi bi-arrow-repeat"></i> ارسال مجدد پیامک</button>` : ''}
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
  
  sheet.querySelector('#frPrintSingle').onclick = () => {
    handlePrint([item]);
    close();
  };

  if (item.sms_status !== 'sent') {
    sheet.querySelector('#frResendSingle').onclick = async () => {
      const btn = sheet.querySelector('#frResendSingle');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ارسال...';
      
      const smsText = buildSmsText(item, name);
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
// تب ثبت جدید (با ثبت در آرشیو همزمان)
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
          <button class="fr-worker-card" data-id="${p.id}" data-name="${escapeHtml((p.first_name||'')+' '+(p.last_name||''))}" data-personnel="${escapeHtml(p.personnel_number||'')}" data-national="${escapeHtml(p.national_code||'')}" data-phone="${escapeHtml(p.phone_number||'')}" data-company="${escapeHtml(p.company?.name||'')}">
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
  const company = card.dataset.company;

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
        await finalizeSelection(id, name, personnel, updated.phone_number || phone, company, input, resultsEl, selectedEl, statsEl);
        return true;
      }
    });
    return;
  }
  await finalizeSelection(id, name, personnel, phone, company, input, resultsEl, selectedEl, statsEl);
}

async function finalizeSelection(id, name, personnel, phone, company, input, resultsEl, selectedEl, statsEl) {
  input.value = name;
  input.dataset.workerId = id;
  input.dataset.phone = phone;
  input.dataset.company = company;
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

    let score = 5;
    score -= Math.min(3, incidentCount * 0.5);
    score -= Math.min(2, warnings * 0.4);
    score -= Math.min(2, fines * 0.3);
    score += Math.min(1, rewards * 0.3);
    score = Math.max(1, Math.min(5, score));
    const stars = Math.round(score);
    const scoreText = stars >= 4 ? 'وضعیت مطلوب' : stars >= 3 ? 'نیاز به توجه' : 'وضعیت پرخطر';

    let exam = null;
    try {
      const { data: ex } = await sb.from('lab_results_periodicexamination').select('*').eq('patient_id', id).order('exam_date', { ascending: false }).limit(1);
      if (ex && ex.length) exam = ex[0];
    } catch (err) { }

    let correctiveAction = null;
    try {
      const { data: ca } = await sb.from('occupational_corrective_actions').select('*').eq('patient_id', id).order('created_at', { ascending: false }).limit(1);
      if (ca && ca.length) correctiveAction = ca[0];
    } catch (err) { }

    const opinion = exam?.final_opinion_text || exam?.final_opinion || exam?.opinion_text || '';
    const conditions = exam?.final_opinion_conditions || exam?.conditions || '';
    const actions = correctiveAction?.action_text || exam?.corrective_actions || exam?.corrective_action || exam?.actions || '';
    const actionStatus = correctiveAction?.status || 'pending';

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
        <div class="fr-oc-row"><span>اقدام اصلاحی:</span><b class="${actionStatus === 'pending' ? 'text-warning' : 'text-success'}">${escapeHtml(actions || 'ندارد')} ${actions ? `<small>(${actionStatus === 'pending' ? 'در انتظار' : 'انجام شده'})</small>` : ''}</b></div>
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
  const patientName = input.value;
  const companyName = input.dataset.company || '—';
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

    // ⭐️ ثبت در آرشیو فرم‌ها
    try {
      await sb.from('form_records').insert({
        form_code: 'BR-FR-HS-07-00',
        patient_id: parseInt(workerId, 10),
        data: {
          patient_name: patientName,
          personnel_number: input.dataset.personnel || '—', 
          company_name: companyName,
          date: gregorianToJalali(isoDT.split('T')[0]),
          time: isoDT.split('T')[1].slice(0,5),
          reason: reason,
          amount: amount,
          record_type: $('frType').value
        },
        created_by: user?.id || null,
        created_at: new Date().toISOString()
      });
    } catch (archiveErr) {
      console.warn('خطا در ثبت آرشیو:', archiveErr);
    }

    const smsText = buildSmsText(record, patientName);
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
// تب مالی و پیامک‌ها
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
  const headers = ['نام', 'کد پرسنلی', 'کد ملی', 'موبایل', 'نوع', 'مبلغ (ریال)', 'علت', 'محل ثبت', 'تاریخ', 'وضعیت پیامک', 'زمان تحویل', 'هزینه پیامک'];
  const rows = records.map(r => [
    `${r.patient?.first_name||''} ${r.patient?.last_name||''}`.trim(),
    r.patient?.personnel_number || '', r.patient?.national_code || '', r.patient?.phone_number || '',
    r.record_type === 'fine' ? 'جریمه' : r.record_type === 'reward' ? 'تشویقی' : 'اخطار',
    r.amount || 0, (r.reason || '').replace(/,/g, ' '), (r.location || '').replace(/,/g, ' '),
    r.incident_datetime ? gregorianToJalali(r.incident_datetime.split('T')[0]) : '',
    r.sms_is_delivered ? 'تحویل شده' : (r.sms_status === 'sent' ? 'ارسال شده' : (r.sms_status === 'failed' ? 'ناموفق' : 'در انتظار')),
    formatDateTime(r.sms_delivery_datetime),
    r.sms_cost || 0
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
  const headers = ['نام', 'کد پرسنلی', 'کد ملی', 'موبایل', 'نوع', 'مبلغ (ریال)', 'علت', 'محل ثبت', 'تاریخ', 'وضعیت پیامک', 'زمان تحویل', 'هزینه پیامک'];
  const rows = records.map(r => [
    `${r.patient?.first_name||''} ${r.patient?.last_name||''}`.trim(),
    r.patient?.personnel_number || '', r.patient?.national_code || '', r.patient?.phone_number || '',
    r.record_type === 'fine' ? 'جریمه' : r.record_type === 'reward' ? 'تشویقی' : 'اخطار',
    r.amount || 0, (r.reason || '').replace(/,/g, ' '), (r.location || '').replace(/,/g, ' '),
    r.incident_datetime ? gregorianToJalali(r.incident_datetime.split('T')[0]) : '',
    r.sms_is_delivered ? 'تحویل شده' : (r.sms_status === 'sent' ? 'ارسال شده' : (r.sms_status === 'failed' ? 'ناموفق' : 'در انتظار')),
    formatDateTime(r.sms_delivery_datetime),
    r.sms_cost || 0
  ]);
  
  if (format === 'excel') {
    exportToExcel(headers, rows, `finance-sent-${todayJalali().replace(/\//g,'-')}.xlsx`);
  } else {
    exportToPDF('گزارش مالی ارسال‌شده', headers, rows, `finance-sent-${todayJalali().replace(/\//g,'-')}.pdf`);
  }
}

async function renderSMSStatus() {
  const body = $('frBody');
  
  let creditInfo = null;
  const statusRes = await getAccountStatus();
  if (statusRes.success) creditInfo = statusRes.data;

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
      <div class="row g-2 mt-2">
        <div class="col-6">
          <select id="frSmsFilterStatus" class="form-select">
            <option value="all">همه وضعیت‌ها</option>
            <option value="delivered">تحویل شده</option>
            <option value="sent">ارسال شده (در انتظار تحویل)</option>
            <option value="failed">ناموفق</option>
          </select>
        </div>
        <div class="col-6 d-flex align-items-end">
          <button class="btn btn-primary btn-sm flex-grow-1 me-2" id="frSmsApplyFilter"><i class="bi bi-funnel"></i> فیلتر</button>
          <button class="btn btn-info btn-sm text-white" id="frCheckDeliveryBtn"><i class="bi bi-arrow-repeat"></i> استعلام</button>
        </div>
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
  const statusFilter = $('frSmsFilterStatus')?.value || 'all';

  try {
    let query = sb.from('safety_finereward')
      .select('*, patient:core_patient(first_name, last_name, personnel_number, phone_number)')
      .not('sms_status', 'eq', 'pending')
      .order('created_at', { ascending: false });

    if (statusFilter === 'delivered') {
      query = query.eq('sms_is_delivered', true);
    } else if (statusFilter === 'sent') {
      query = query.eq('sms_status', 'sent').eq('sms_is_delivered', false);
    } else if (statusFilter === 'failed') {
      query = query.eq('sms_status', 'failed');
    }

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
                ${it.sms_cost ? `<div class="fr-item-meta small text-primary">هزینه: ${fmtMoney(it.sms_cost)} ریال</div>` : ''}
                ${it.sms_delivery_datetime ? `<div class="fr-item-meta small text-success">زمان تحویل: ${formatDateTime(it.sms_delivery_datetime)}</div>` : ''}
                ${it.sms_error ? `<div class="fr-item-reason text-danger small mt-1">خطا: ${escapeHtml(it.sms_error)}</div>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;

    $('frExportFailedExcel').onclick = async () => {
      const headers = ['نام', 'کد پرسنلی', 'موبایل', 'وضعیت ارسال', 'وضعیت تحویل', 'هزینه پیامک', 'زمان تحویل', 'علت خطا', 'تاریخ'];
      const rows = list.map(r => [
        `${r.patient?.first_name||''} ${r.patient?.last_name||''}`.trim(),
        r.patient?.personnel_number || '', r.patient?.phone_number || '',
        r.sms_status === 'failed' ? 'ناموفق' : 'ارسال شده',
        r.sms_is_delivered ? 'تحویل شده' : 'تحویل نشده',
        r.sms_cost || 0,
        formatDateTime(r.sms_delivery_datetime),
        r.sms_error || '—',
        r.incident_datetime ? gregorianToJalali(r.incident_datetime.split('T')[0]) : '',
      ]);
      exportToExcel(headers, rows, `sms-report-${todayJalali().replace(/\//g,'-')}.xlsx`);
    };

    $('frExportFailedPDF').onclick = () => {
      const headers = ['ردیف', 'نام', 'موبایل', 'وضعیت', 'هزینه', 'زمان تحویل', 'علت خطا'];
      const rows = list.map((r, idx) => [
        idx + 1,
        `${r.patient?.first_name||''} ${r.patient?.last_name||''}`.trim(),
        r.patient?.phone_number || '—',
        r.sms_status === 'failed' ? 'ناموفق' : (r.sms_is_delivered ? 'تحویل شده' : 'ارسال شده'),
        r.sms_cost || 0,
        formatDateTime(r.sms_delivery_datetime),
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
        const name = `${item.patient?.first_name||''} ${item.patient?.last_name||''}`.trim();
        const smsText = buildSmsText(item, name);
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

async function checkAllDeliveries() {
  const btn = $('frCheckDeliveryBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال استعلام...';

  try {
    const { data: pendingList, error } = await sb.from('safety_finereward')
      .select('id, sms_message_id')
      .eq('sms_status', 'sent')
      .eq('sms_is_delivered', false)
      .not('sms_message_id', 'is', null)
      .limit(50);

    if (error) throw error;
    if (!pendingList || pendingList.length === 0) {
      toast('هیچ پیامک در انتظار تحویلی وجود ندارد', 'info');
      lastSmsCheckTime = Date.now(); // ⭐️ ثبت زمان حتی اگر لیست خالی باشد
      btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> استعلام';
      return;
    }

    const messageIds = pendingList.map(p => p.sms_message_id);
    let updatedCount = 0;

    const processDelivery = async (del) => {
      const sendTime = del.SendDateTime || null;
      const statusCode = String(del.Status).toLowerCase();
      const deliveryType = del.DeliveryType ?? -1;
      const cost = Math.abs(Number(del.Cost) || 0);

      let isDelivered = false;
      let newSmsStatus = 'sent';

      if (deliveryType === 1) {
        isDelivered = true;
        newSmsStatus = 'sent';
      } else if (deliveryType === 0 || deliveryType === 35) {
        isDelivered = false;
        newSmsStatus = 'sent';
      } else if (['2', '16', 'failed'].includes(statusCode)) {
        newSmsStatus = 'failed';
      } else {
        newSmsStatus = 'sent';
      }

      const { error: updErr } = await sb.from('safety_finereward')
        .update({ 
          sms_is_delivered: isDelivered, 
          sms_delivery_status: del.Status,
          sms_delivery_type: deliveryType,
          sms_status: newSmsStatus,
          sms_send_datetime: sendTime,
          sms_delivery_datetime: isDelivered ? sendTime : null,
          sms_cost: cost
        })
        .eq('sms_message_id', del.MessageID);

      if (updErr) throw new Error('خطا در ذخیره وضعیت: ' + updErr.message);
    };

    const res = await getDeliveries(messageIds);
    if (!res?.success) {
      throw new Error(res?.error || 'ارتباط با سرویس استعلام دلیوری ناموفق بود');
    }

    const deliveries = res.data?.Data ?? res.data?.data;
    if (!Array.isArray(deliveries)) throw new Error('ساختار پاسخ دلیوری آموت قابل شناسایی نیست');
    
    if (deliveries.length > 0) {
      for (const del of deliveries) {
        if (!del || del.MessageID == null || del.Status == null) continue;
        await processDelivery(del);
        updatedCount++;
      }
    }

    // ⭐️ ثبت زمان استعلام برای شرط ۵ دقیقه چاپ
    lastSmsCheckTime = Date.now();
    toast(`استعلام پایان یافت. ${updatedCount} پیامک بررسی شد.`, 'success');
    loadSMSStatusList();

  } catch (e) {
    console.error('Delivery check error:', e);
    toast(e.message || 'خطا در استعلام', 'danger');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> استعلام';
  }
}

// ═══════════════════════════════════════════════════════
// قالب پیامک
// ═══════════════════════════════════════════════════════
function buildSmsText(record, customName) {
  const type = record.record_type;
  const amount = fmtMoney(record.amount);
  const reason = record.reason || '—';
  
  const cleanName = customName && customName.trim() !== '' ? customName.trim() : '';
  const prefix = cleanName ? `آقای ${cleanName}` : 'همکار گرامی';
  
  const SIGN = 'واحد ایمنی گندله سازی بهاباد';

  if (type === "fine") {
    return `اطلاعیه ایمنی! ${prefix} مبلغ ${amount} ریال جریمه به علت ${reason} برای شما ثبت گردید. ${SIGN}`;
  }
  if (type === "reward") {
    return `اطلاعیه ایمنی! ${prefix} مبلغ ${amount} ریال پاداش به علت ${reason} برای شما ثبت گردید. ${SIGN}`;
  }
  return `${prefix} اخطار ایمنی به علت ${reason} برای شما ثبت گردید. ${SIGN}`;
}