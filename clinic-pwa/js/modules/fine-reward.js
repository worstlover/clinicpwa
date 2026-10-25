// js/modules/fine-reward.js
import { sb } from '../sb.js';
import { $, toast, escapeHtml, gregorianToJalali, jalaliToGregorian, todayJalali } from '../utils.js';
import { getAccountStatus, getDeliveries } from './amoot-api.js';

// ═══════════════════════════════════════════════════════
// ثابت‌ها
// ═══════════════════════════════════════════════════════
const DELIVERY_FRESH_MINUTES = 5;
const DELIVERY_CHUNK_SIZE    = 50;

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
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};
const toISOWithTime = (jalaliDate, timeStr) => {
  const g = jalaliToGregorian(jalaliDate);
  if (!g) return null;
  const [h, m] = (timeStr || '12:00').split(':');
  return new Date(`${g}T${(h || '12').padStart(2, '0')}:${(m || '00').padStart(2, '0')}:00`).toISOString();
};

const formatDateTime = (isoStr) => {
  if (!isoStr) return '—';
  try {
    const parts = String(isoStr).split('T');
    if (parts.length !== 2) return '—';
    const datePart = parts[0];
    const timePart = parts[1].split('.')[0];
    const jDate = gregorianToJalali(datePart);
    const hm = timePart.split(':').slice(0, 2).join(':');
    return `${jDate} - ${hm}`;
  } catch (e) {
    return '—';
  }
};

// ═══════════════════════════════════════════════════════
// تازگی استعلام
// ═══════════════════════════════════════════════════════
function isFreshCheck(checkedAtIso) {
  if (!checkedAtIso) return false;
  const ms = Date.now() - new Date(checkedAtIso).getTime();
  if (isNaN(ms) || ms < 0) return false;
  return ms <= DELIVERY_FRESH_MINUTES * 60 * 1000;
}

function classifySmsStatus(record) {
  if (!record) return 'unknown';
  if (record.sms_is_delivered === true) return 'delivered';

  const status = record.sms_status;
  const hasMessageId = !!record.sms_message_id;

  if (status === 'failed')  return 'not_delivered';
  if (status === 'pending') return 'not_delivered';
  if (!hasMessageId)        return 'not_delivered';

  if (status === 'sent') {
    if (isFreshCheck(record.sms_last_checked_at)) return 'not_delivered';
    return 'needs_check';
  }
  return 'unknown';
}

function smsBadgeHtml(record) {
  const cat = classifySmsStatus(record);
  switch (cat) {
    case 'delivered':
      return '<span class="badge bg-success" style="font-size:0.6rem;">تحویل شد</span>';
    case 'not_delivered':
      return '<span class="badge bg-danger" style="font-size:0.6rem;">نرسیده</span>';
    case 'needs_check':
      return '<span class="badge bg-warning text-dark" style="font-size:0.6rem;">نیاز به استعلام</span>';
    default:
      return '<span class="badge bg-secondary" style="font-size:0.6rem;">نامعلوم</span>';
  }
}

// ═══════════════════════════════════════════════════════
// متن پیامک
// ═══════════════════════════════════════════════════════
function buildSmsText(record, customName) {
  const type = record.record_type;
  const amount = fmtMoney(record.amount);
  const reason = record.reason || '—';

  const cleanName = customName && customName.trim() !== '' ? customName.trim() : '';
  const prefix = cleanName ? `آقای ${cleanName}` : 'همکار گرامی';
  const SIGN = 'واحد ایمنی گندله سازی بهاباد';

  if (type === 'fine') {
    return `اطلاعیه ایمنی! ${prefix} مبلغ ${amount} ریال جریمه به علت ${reason} برای شما ثبت گردید. ${SIGN}`;
  }
  if (type === 'reward') {
    return `اطلاعیه ایمنی! ${prefix} مبلغ ${amount} ریال پاداش به علت ${reason} برای شما ثبت گردید. ${SIGN}`;
  }
  return `${prefix} اخطار ایمنی به علت ${reason} برای شما ثبت گردید. ${SIGN}`;
}

// ═══════════════════════════════════════════════════════
// سرویس پیامک
// ═══════════════════════════════════════════════════════
async function sendSMS(phone, text) {
  if (!phone) return { success: false, error: 'شماره موبایل ثبت نشده است' };

  let cleanPhone = toEnDigits(phone).replace(/\D/g, '');
  if (cleanPhone.length === 10 && cleanPhone.startsWith('9')) cleanPhone = '0' + cleanPhone;
  if (!/^09\d{9}$/.test(cleanPhone)) return { success: false, error: `شماره نامعتبر (${phone})` };

  try {
    const { data, error } = await sb.functions.invoke('send-fine-sms', {
      body: { mobile: cleanPhone, text }
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
// خروجی اکسل / PDF
// ═══════════════════════════════════════════════════════
function exportToExcel(headers, rows, filename) {
  if (!window.XLSX) { toast('کتابخانه اکسل لود نشده است', 'danger'); return; }
  try {
    const ws = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);
    if (!ws['!views']) ws['!views'] = [];
    ws['!views'].push({ RTL: true });
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Report');
    window.XLSX.writeFile(wb, filename);
    toast('✅ فایل اکسل دانلود شد', 'success');
  } catch (e) {
    console.error('Excel Error:', e);
    toast('خطا در تولید فایل اکسل', 'danger');
  }
}

async function exportToPDF(title, headers, rows, filename) {
  if (!window.html2canvas || !window.jspdf) {
    toast('کتابخانه‌های PDF لود نشده‌اند', 'danger');
    return;
  }
  const tempDiv = document.createElement('div');
  tempDiv.style.cssText = 'position:absolute;top:0;left:-9999px;width:800px;background:#fff;direction:rtl;font-family:Tahoma,Arial,sans-serif;padding:20px;';
  const tableRows = rows.map(row =>
    `<tr>${row.map(cell => `<td style="border:1px solid #000;padding:6px;text-align:center;font-size:11px;">${cell}</td>`).join('')}</tr>`
  ).join('');
  tempDiv.innerHTML = `
    <h2 style="text-align:center;margin-bottom:20px;">${title}</h2>
    <p style="text-align:left;font-size:12px;">تاریخ چاپ: ${todayJalali()}</p>
    <table style="width:100%;border-collapse:collapse;text-align:center;font-size:11px;">
      <thead><tr style="background:#f3f4f6;">${headers.map(h => `<th style="border:1px solid #000;padding:6px;">${h}</th>`).join('')}</tr></thead>
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
    toast('✅ PDF با موفقیت دانلود شد', 'success');
  } catch (err) {
    console.error('PDF Error:', err);
    toast('خطا در تولید PDF', 'danger');
  } finally {
    document.body.removeChild(tempDiv);
  }
}

// ═══════════════════════════════════════════════════════
// refreshDeliveries — chunked + progress + UTC
// ═══════════════════════════════════════════════════════
let _refreshInProgress = false;

async function refreshDeliveries(ids) {
  if (_refreshInProgress) {
    toast('یک استعلام در حال اجراست', 'warning');
    return { success: false, error: 'in_progress' };
  }
  _refreshInProgress = true;

  const summary = { total: 0, checked: 0, delivered: 0, notDelivered: 0, failed: 0, unknown: 0, errors: [] };
  let progressEl = null;

  try {
    let query = sb.from('safety_finereward')
      .select('id, sms_message_id, sms_status, sms_is_delivered')
      .eq('sms_status', 'sent')
      .eq('sms_is_delivered', false)
      .not('sms_message_id', 'is', null);

    if (Array.isArray(ids) && ids.length > 0) query = query.in('id', ids);

    const { data: pendingList, error } = await query;
    if (error) throw error;
    if (!pendingList || pendingList.length === 0) return { success: true, summary };

    summary.total = pendingList.length;
    progressEl = _ensureProgressUI(summary.total);

    for (let i = 0; i < pendingList.length; i += DELIVERY_CHUNK_SIZE) {
      const chunk = pendingList.slice(i, i + DELIVERY_CHUNK_SIZE);
      const messageIds = chunk.map(p => p.sms_message_id);
      const nowIso = new Date().toISOString();

      try {
        const res = await getDeliveries(messageIds);
        if (!res?.success) {
          summary.errors.push(res?.error || 'خطای استعلام');
          await sb.from('safety_finereward').update({ sms_last_checked_at: nowIso }).in('sms_message_id', messageIds);
          summary.unknown += chunk.length;
        } else {
          const deliveries = res.data?.Data ?? res.data?.data ?? [];
          const byMessageId = new Map();
          if (Array.isArray(deliveries)) {
            for (const del of deliveries) {
              if (del && del.MessageID != null) byMessageId.set(String(del.MessageID), del);
            }
          }

          for (const row of chunk) {
            const del = byMessageId.get(String(row.sms_message_id));
            if (!del) {
              await sb.from('safety_finereward').update({ sms_last_checked_at: nowIso }).eq('id', row.id);
              summary.unknown++;
              summary.checked++;
              continue;
            }

            const sendTime = del.SendDateTime || null;
            const statusCode = String(del.Status).toLowerCase();
            const deliveryType = del.DeliveryType ?? -1;
            const cost = Math.abs(Number(del.Cost) || 0);

            let isDelivered = false;
            let newSmsStatus = 'sent';

            if (deliveryType === 1) {
              isDelivered = true;
            } else if (deliveryType === 0 || deliveryType === 35) {
              isDelivered = false;
            } else if (['2', '16', 'failed'].includes(statusCode)) {
              newSmsStatus = 'failed';
            } else {
              newSmsStatus = 'sent';
            }

            const { error: updErr } = await sb.from('safety_finereward').update({
              sms_is_delivered: isDelivered,
              sms_delivery_status: del.Status,
              sms_delivery_type: deliveryType,
              sms_status: newSmsStatus,
              sms_send_datetime: sendTime,
              sms_delivery_datetime: isDelivered ? sendTime : null,
              sms_cost: cost,
              sms_last_checked_at: nowIso
            }).eq('id', row.id);

            if (updErr) {
              summary.errors.push(updErr.message);
            } else {
              if (isDelivered) summary.delivered++;
              else if (newSmsStatus === 'failed') summary.failed++;
              else summary.notDelivered++;
              summary.checked++;
            }
          }
        }
      } catch (chunkErr) {
        summary.errors.push(chunkErr.message);
        summary.unknown += chunk.length;
      }

      _updateProgressUI(progressEl, summary.checked, summary.total);
      await new Promise(r => setTimeout(r, 0));
    }

    return { success: true, summary };
  } catch (e) {
    console.error('[refreshDeliveries]', e);
    return { success: false, error: e.message, summary };
  } finally {
    if (progressEl) _removeProgressUI(progressEl);
    _refreshInProgress = false;
  }
}

function _ensureProgressUI(total) {
  const prev = document.getElementById('frDeliveryProgress');
  if (prev) prev.remove();
  const el = document.createElement('div');
  el.id = 'frDeliveryProgress';
  el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;background:#1e293b;color:#fff;padding:10px 14px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.3);font-size:0.85rem;';
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
      <span>در حال استعلام...</span>
      <span id="frProgressText">0 / ${total}</span>
    </div>
    <div style="background:#334155;border-radius:6px;height:8px;overflow:hidden;">
      <div id="frProgressBar" style="width:0%;height:100%;background:#10b981;transition:width 0.3s;"></div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}
function _updateProgressUI(el, done, total) {
  if (!el) return;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const bar = el.querySelector('#frProgressBar');
  const txt = el.querySelector('#frProgressText');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = `${done} / ${total}`;
}
function _removeProgressUI(el) { if (el) el.remove(); }

// ═══════════════════════════════════════════════════════
// قالب فرم HS-07 (dynamic)
// ═══════════════════════════════════════════════════════
let _hs07Renderer = null;
async function getHS07Renderer() {
  if (_hs07Renderer === false) return null;
  if (_hs07Renderer) return _hs07Renderer;
  try {
    const mod = await import('../forms/templates/hs07.js');
    _hs07Renderer = mod.render || false;
  } catch (e) {
    console.warn('[HS07] template not found:', e);
    _hs07Renderer = false;
  }
  return _hs07Renderer || null;
}

function buildFormData(item) {
  const p = item.patient || {};
  const dt = item.incident_datetime || '';
  const [datePart = '', timeRaw = ''] = dt.split('T');
  const timePart = timeRaw.split('.')[0] || '';
  const jalali = datePart ? gregorianToJalali(datePart) : '......';
  const time = timePart ? timePart.split(':').slice(0, 2).join(':') : '......';
  return {
    serialNumber: item.id,
    fullName: `${p.first_name || ''} ${p.last_name || ''}`.trim() || '......',
    personnelNumber: p.personnel_number || '......',
    unit: item.incident_location || item.location || '......',
    jalaliDate: jalali,
    time,
    reason: item.reason || '......',
    amount: item.amount,
    isWarning: item.record_type === 'warning',
    record_type: item.record_type
  };
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
let _masterList = [];
let _currentList = [];
let _selectedIds = new Set();

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
        <div class="col-7">
          <select id="frFilterType" class="form-select">
            <option value="all">همه انواع</option>
            <option value="fine">جریمه</option>
            <option value="reward">تشویقی</option>
            <option value="warning">اخطار</option>
          </select>
        </div>
        <div class="col-5">
          <button class="btn btn-primary w-100" id="frApplyFilter"><i class="bi bi-funnel"></i> فیلتر</button>
        </div>
      </div>
      <div class="row g-2 mt-2">
        <div class="col-12">
          <label class="form-label small text-muted mb-1">وضعیت پیامک</label>
          <select id="frFilterSmsStatus" class="form-select">
            <option value="all">همه</option>
            <option value="delivered">تحویل شد</option>
            <option value="not_delivered">نرسیده (قطعی)</option>
            <option value="needs_check">نیاز به استعلام</option>
          </select>
        </div>
      </div>
      <div id="frSmsCounts" class="d-flex flex-wrap gap-2 mt-2" style="font-size:0.75rem;"></div>
    </div>
    <div id="frActionBar"></div>
    <div id="frListContainer"><div class="text-center py-4"><div class="spinner-border text-primary"></div></div></div>
  `;

  $('frApplyFilter').onclick = loadList;
  $('frFilterQuery').addEventListener('keydown', e => { if (e.key === 'Enter') loadList(); });
  $('frFilterSmsStatus').addEventListener('change', applyClientFilter);

  loadList();
}

async function loadList() {
  const c = $('frListContainer');
  c.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>';

  const q    = $('frFilterQuery')?.value.trim().toLowerCase() || '';
  const from = $('frFilterFrom')?.value.trim() || '';
  const to   = $('frFilterTo')?.value.trim() || '';
  const type = $('frFilterType')?.value || 'all';

  try {
    let query = sb.from('safety_finereward')
      .select('*, patient:core_patient(first_name, last_name, personnel_number, national_code, phone_number)')
      .order('created_at', { ascending: false })
      .limit(300);

    if (type !== 'all') query = query.eq('record_type', type);
    const fromG = from ? jalaliToGregorian(from) : null;
    const toG   = to   ? jalaliToGregorian(to)   : null;
    if (fromG) query = query.gte('incident_datetime', fromG + 'T00:00:00');
    if (toG)   query = query.lte('incident_datetime', toG   + 'T23:59:59');

    const { data, error } = await query;
    if (error) throw error;

    let list = data || [];
    if (q) {
      list = list.filter(it => {
        const hay = [
          it.patient?.first_name, it.patient?.last_name,
          it.patient?.personnel_number, it.patient?.national_code, it.patient?.phone_number,
          it.reason, it.location, it.incident_location
        ].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }

    _masterList = list;
    _selectedIds.clear();
    applyClientFilter();
  } catch (e) {
    c.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
  }
}

function applyClientFilter() {
  const smsFilter = $('frFilterSmsStatus')?.value || 'all';
  const c = $('frListContainer');

  const counts = { delivered: 0, not_delivered: 0, needs_check: 0, unknown: 0 };
  for (const it of _masterList) {
    const cat = classifySmsStatus(it);
    if (counts[cat] !== undefined) counts[cat]++;
  }
  const countsEl = $('frSmsCounts');
  if (countsEl) {
    countsEl.innerHTML = `
      <span class="badge bg-success">تحویل: ${counts.delivered}</span>
      <span class="badge bg-danger">نرسیده: ${counts.not_delivered}</span>
      <span class="badge bg-warning text-dark">نیاز به استعلام: ${counts.needs_check}</span>
      <span class="badge bg-secondary">نامعلوم: ${counts.unknown}</span>
    `;
  }

  let list = _masterList;
  if      (smsFilter === 'delivered')     list = list.filter(it => classifySmsStatus(it) === 'delivered');
  else if (smsFilter === 'not_delivered') list = list.filter(it => classifySmsStatus(it) === 'not_delivered');
  else if (smsFilter === 'needs_check')   list = list.filter(it => classifySmsStatus(it) === 'needs_check');

  _currentList = list;

  const ab = $('frActionBar');
  if (ab) {
    const printable = list.filter(it => it.record_type === 'fine' || it.record_type === 'warning');
    ab.innerHTML = `
      <div class="fr-action-bar" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;margin:8px 0;">
        <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
          <label class="d-flex align-items-center gap-2" style="font-size:0.85rem;cursor:pointer;margin:0;">
            <input type="checkbox" id="frSelectAll" class="form-check-input" style="width:22px;height:22px;">
            <span>انتخاب همه (${printable.length} فرم قابل چاپ)</span>
          </label>
          <span class="text-muted" style="font-size:0.78rem;">${list.length} مورد در نتایج</span>
        </div>
        <div class="d-flex gap-2 flex-wrap align-items-center">
          <select id="frCopiesCount" class="form-select form-select-sm" style="max-width:170px;">
            <option value="1">۱ نسخه</option>
            <option value="3">۳ نسخه جدا</option>
          </select>
          <button class="btn btn-primary btn-sm" id="frPrintBtn" ${printable.length ? '' : 'disabled'}>
            <i class="bi bi-printer"></i> چاپ فرم‌ها
          </button>
          <button class="btn btn-outline-secondary btn-sm" id="frRefreshSelectedBtn">
            <i class="bi bi-arrow-repeat"></i> استعلام انتخاب‌شده‌ها
          </button>
        </div>
      </div>
    `;

    $('frSelectAll').onchange = (e) => {
      _selectedIds.clear();
      if (e.target.checked) printable.forEach(it => _selectedIds.add(String(it.id)));
      c.querySelectorAll('input[type=checkbox][data-select-id]').forEach(cb => cb.checked = e.target.checked);
      _updateSelectedCount();
    };

    $('frPrintBtn').onclick = () => openPrintDialog(list);
    $('frRefreshSelectedBtn').onclick = async () => {
      const ids = Array.from(_selectedIds).map(id => parseInt(id, 10));
      if (!ids.length) { toast('هیچ ردیفی انتخاب نشده', 'info'); return; }
      await runRefreshAndReload(ids, true);
    };
  }

  if (!list.length) {
    c.innerHTML = `<div class="fr-empty"><i class="bi bi-inbox"></i><div>موردی یافت نشد</div></div>`;
    return;
  }

  c.innerHTML = `<div class="fr-list">${list.map(renderListItem).join('')}</div>`;

  c.querySelectorAll('input[type=checkbox][data-select-id]').forEach(cb => {
    cb.checked = _selectedIds.has(String(cb.dataset.selectId));
    cb.onchange = () => {
      if (cb.checked) _selectedIds.add(String(cb.dataset.selectId));
      else            _selectedIds.delete(String(cb.dataset.selectId));
      _updateSelectedCount();
    };
  });
  c.querySelectorAll('.fr-item[data-fr-id]').forEach(btn => {
    btn.onclick = () => {
      const item = list.find(x => String(x.id) === String(btn.dataset.frId));
      if (item) openDetail(item);
    };
  });
  _updateSelectedCount();
}

function _updateSelectedCount() {
  const btn = $('frRefreshSelectedBtn');
  if (btn) {
    const n = _selectedIds.size;
    btn.innerHTML = `<i class="bi bi-arrow-repeat"></i> استعلام انتخاب‌شده‌ها${n ? ` (${n})` : ''}`;
  }
}

function renderListItem(item) {
  const meta = {
    fine:    { label: 'جریمه',  cls: 'danger',  icon: 'bi-exclamation-circle-fill' },
    reward:  { label: 'تشویقی', cls: 'success', icon: 'bi-award-fill' },
    warning: { label: 'اخطار',  cls: 'warning', icon: 'bi-exclamation-triangle-fill' },
  }[item.record_type] || { label: '—', cls: 'gray', icon: 'bi-file-earmark' };

  const name = item.patient
    ? `${item.patient.first_name || ''} ${item.patient.last_name || ''}`.trim()
    : '—';
  const dateStr = item.incident_datetime
    ? gregorianToJalali(item.incident_datetime.split('T')[0])
    : '—';
  const printable = item.record_type === 'fine' || item.record_type === 'warning';

  return `
    <div class="fr-item-wrap" style="display:flex;gap:0;align-items:stretch;margin-bottom:8px;">
      ${printable
        ? `<label style="display:flex;align-items:center;justify-content:center;padding:0 12px;background:#f8fafc;border-radius:0 12px 12px 0;cursor:pointer;">
             <input type="checkbox" class="form-check-input" data-select-id="${item.id}" style="width:22px;height:22px;margin:0;cursor:pointer;">
           </label>`
        : `<span style="width:46px;display:inline-block;"></span>`}
      <button class="fr-item ${meta.cls}" data-fr-id="${item.id}" style="flex:1;margin:0;border-radius:12px 0 0 12px;">
        <div class="fr-item-icon ${meta.cls}"><i class="bi ${meta.icon}"></i></div>
        <div class="fr-item-body">
          <div class="fr-item-head">
            <span class="fr-item-type ${meta.cls}">${meta.label}</span>
            <div class="d-flex gap-1 align-items-center">
              ${smsBadgeHtml(item)}
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
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
// مودال جزئیات
// ═══════════════════════════════════════════════════════
function openDetail(item) {
  const typeFa = { fine: 'جریمه', reward: 'تشویقی', warning: 'اخطار' }[item.record_type] || '—';
  const name = item.patient
    ? `${item.patient.first_name || ''} ${item.patient.last_name || ''}`.trim()
    : '—';
  const deliveryDate = formatDateTime(item.sms_delivery_datetime);
  const cat = classifySmsStatus(item);

  const sheet = document.createElement('div');
  sheet.className = 'fr-sheet';
  sheet.innerHTML = `
    <div class="fr-sheet-handle"></div>
    <div class="fr-sheet-title">جزئیات ${typeFa}</div>
    <div class="fr-detail-row"><span>نام کارگر:</span><b>${escapeHtml(name)}</b></div>
    <div class="fr-detail-row"><span>کد پرسنلی:</span><b dir="ltr">${escapeHtml(item.patient?.personnel_number || '—')}</b></div>
    <div class="fr-detail-row"><span>موبایل:</span><b dir="ltr">${escapeHtml(item.patient?.phone_number || '—')}</b></div>
    <div class="fr-detail-row"><span>تاریخ رویداد:</span><b>${escapeHtml(item.incident_datetime ? gregorianToJalali(item.incident_datetime.split('T')[0]) : '—')}</b></div>
    <div class="fr-detail-row"><span>علت:</span><b>${escapeHtml(item.reason || '—')}</b></div>
    ${item.amount ? `<div class="fr-detail-row"><span>مبلغ:</span><b>${fmtMoney(item.amount)} ریال</b></div>` : ''}

    <div class="fr-detail-row">
      <span>وضعیت پیامک:</span>
      <b>${smsBadgeHtml(item)}</b>
    </div>
    ${item.sms_last_checked_at
      ? `<div class="fr-detail-row"><span>آخرین استعلام:</span><b dir="ltr">${formatDateTime(item.sms_last_checked_at)}</b></div>`
      : `<div class="fr-detail-row"><span>آخرین استعلام:</span><b class="text-muted">هرگز</b></div>`}
    ${item.sms_is_delivered ? `<div class="fr-detail-row"><span>وضعیت تحویل:</span><b>📬 تحویل شده</b></div>` : ''}
    ${item.sms_delivery_datetime ? `<div class="fr-detail-row"><span>زمان تحویل:</span><b dir="ltr">${deliveryDate}</b></div>` : ''}
    ${item.sms_cost ? `<div class="fr-detail-row"><span>هزینه پیامک:</span><b>${fmtMoney(item.sms_cost)} ریال</b></div>` : ''}
    ${item.sms_error ? `<div class="fr-detail-row"><span>علت خطا:</span><b class="text-danger">${escapeHtml(item.sms_error)}</b></div>` : ''}

    <div class="d-flex gap-2 mt-3 flex-wrap">
      ${(item.record_type === 'fine' || item.record_type === 'warning')
        ? `<button class="btn btn-primary" id="frPrintSingle"><i class="bi bi-printer"></i> چاپ این فرم</button>` : ''}
      ${item.sms_status !== 'sent'
        ? `<button class="btn btn-outline-primary" id="frResendSingle"><i class="bi bi-arrow-repeat"></i> ارسال مجدد پیامک</button>` : ''}
      ${(cat === 'needs_check' || cat === 'unknown') && item.sms_message_id
        ? `<button class="btn btn-warning" id="frCheckSingle"><i class="bi bi-search"></i> استعلام این رکورد</button>` : ''}
      <button class="btn btn-light" id="frCloseSheet">بستن</button>
    </div>
  `;
  const backdrop = document.createElement('div');
  backdrop.className = 'fr-backdrop';
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);

  const close = () => { backdrop.classList.add('closing'); setTimeout(() => backdrop.remove(), 200); };
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  sheet.querySelector('#frCloseSheet').onclick = close;

  if (sheet.querySelector('#frPrintSingle')) {
    sheet.querySelector('#frPrintSingle').onclick = async () => { close(); await doPrint([item], 1); };
  }
  if (sheet.querySelector('#frCheckSingle')) {
    sheet.querySelector('#frCheckSingle').onclick = async () => {
      const b = sheet.querySelector('#frCheckSingle');
      b.disabled = true;
      b.innerHTML = '<span class="spinner-border spinner-border-sm"></span> ...';
      await runRefreshAndReload([item.id], true);
      close();
      loadList();
    };
  }
  if (sheet.querySelector('#frResendSingle')) {
    sheet.querySelector('#frResendSingle').onclick = async () => {
      const btn = sheet.querySelector('#frResendSingle');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ارسال...';
      const res = await sendSMS(item.patient?.phone_number, buildSmsText(item, name));
      if (res.success) {
        await sb.from('safety_finereward').update({
          sms_status: 'sent', sms_message_id: res.messageId,
          sms_error: null, sms_last_checked_at: null
        }).eq('id', item.id);
        toast('✅ پیامک با موفقیت ارسال شد', 'success');
        close(); loadList();
      } else {
        await sb.from('safety_finereward').update({ sms_status: 'failed', sms_error: res.error }).eq('id', item.id);
        toast(`❌ ارسال ناموفق: ${res.error}`, 'danger');
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> ارسال مجدد پیامک';
      }
    };
  }
}

// ═══════════════════════════════════════════════════════
// چاپ
// ═══════════════════════════════════════════════════════
function openPrintDialog(list) {
  const printableAll = list.filter(it => it.record_type === 'fine' || it.record_type === 'warning');
  const selectedPrintable = printableAll.filter(it => _selectedIds.has(String(it.id)));
  const notDeliveredList = printableAll.filter(it => classifySmsStatus(it) === 'not_delivered');
  const needsCheckList   = printableAll.filter(it => classifySmsStatus(it) === 'needs_check');
  const rejectedRewards  = list.filter(it => it.record_type === 'reward').length;

  if (!printableAll.length) {
    toast('هیچ رکورد جریمه/اخطاری برای چاپ وجود ندارد', 'info');
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'fr-modal-backdrop';
  modal.innerHTML = `
    <div class="fr-modal">
      <div class="fr-modal-title">چاپ فرم‌ها</div>
      <div class="fr-modal-sub">
        ${printableAll.length} فرم قابل چاپ
        ${rejectedRewards ? `<br><small class="text-muted">${rejectedRewards} رکورد تشویقی رد شد</small>` : ''}
      </div>
      <div class="fr-field">
        <label>تعداد نسخه</label>
        <select id="prCopies" class="form-select">
          <option value="1">۱ نسخه (کاغذ کپی‌دار)</option>
          <option value="3">۳ نسخه جدا (سفید/زرد/قرمز)</option>
        </select>
      </div>
      <div class="d-flex flex-column gap-2 mt-3">
        <button class="btn btn-danger" id="prNotDelivered" ${notDeliveredList.length ? '' : 'disabled'}>
          فقط پیامک‌نرسیده‌ها (${notDeliveredList.length})
          ${needsCheckList.length ? `<div style="font-size:0.72rem;opacity:0.9;margin-top:4px;">+ ${needsCheckList.length} نیاز به استعلام</div>` : ''}
        </button>
        <button class="btn btn-primary" id="prAll">همه نتایج فیلترشده (${printableAll.length})</button>
        <button class="btn btn-outline-primary" id="prSelected" ${selectedPrintable.length ? '' : 'disabled'}>
          فقط انتخاب‌شده‌ها (${selectedPrintable.length})
        </button>
      </div>
      <div class="fr-modal-actions mt-3">
        <button class="btn btn-light w-100" id="prCancel">انصراف</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  const modalCard = modal.querySelector('.fr-modal');

  modal.querySelector('#prCancel').onclick = close;
  modal.querySelector('#prAll').onclick = async () => {
    const copies = parseInt(modal.querySelector('#prCopies').value, 10) || 1;
    close();
    await doPrint(printableAll, copies);
  };
  modal.querySelector('#prSelected').onclick = async () => {
    const copies = parseInt(modal.querySelector('#prCopies').value, 10) || 1;
    close();
    await doPrint(selectedPrintable, copies);
  };
  modal.querySelector('#prNotDelivered').onclick = () => {
    const copies = parseInt(modal.querySelector('#prCopies').value, 10) || 1;

    if (!needsCheckList.length) {
      close();
      doPrint(notDeliveredList, copies);
      return;
    }

    modalCard.innerHTML = `
      <div class="fr-modal-title">⚠️ استعلام تازه لازم است</div>
      <div class="fr-modal-sub" style="line-height:2;">
        ${needsCheckList.length} رکورد ارسال‌شده است ولی استعلام آن‌ها قدیمی یا انجام‌نشده است
        (بیش از ${DELIVERY_FRESH_MINUTES} دقیقه قبل).
      </div>
      <div class="d-flex flex-column gap-2 mt-3">
        <button class="btn btn-warning" id="prRefreshThenPrint">
          <i class="bi bi-arrow-repeat"></i> استعلام تازه و سپس چاپ
        </button>
        <button class="btn btn-outline-secondary" id="prSkipAndPrint">
          فقط ${notDeliveredList.length} رکورد قطعی را چاپ کن
          <div style="font-size:0.72rem;opacity:0.85;margin-top:4px;">${needsCheckList.length} رکورد نامعلوم حذف می‌شود</div>
        </button>
        <button class="btn btn-light" id="prBack">بازگشت</button>
      </div>
    `;

    modalCard.querySelector('#prBack').onclick = () => { close(); openPrintDialog(list); };
    modalCard.querySelector('#prSkipAndPrint').onclick = async () => {
      close();
      if (!notDeliveredList.length) { toast('هیچ رکوردی برای چاپ باقی نماند', 'warning'); return; }
      toast(`${needsCheckList.length} رکورد نامعلوم از چاپ حذف شد`, 'info');
      await doPrint(notDeliveredList, copies);
    };
    modalCard.querySelector('#prRefreshThenPrint').onclick = async () => {
      close();
      const ids = needsCheckList.map(it => it.id);
      const res = await refreshDeliveries(ids);
      if (!res.success) { toast(res.error || 'استعلام ناموفق بود', 'danger'); return; }

      const { data: refreshed, error: rErr } = await sb.from('safety_finereward')
        .select('*, patient:core_patient(first_name, last_name, personnel_number, national_code, phone_number)')
        .in('id', ids);
      if (rErr) { toast('خطا در بازخوانی: ' + rErr.message, 'danger'); return; }

      const stillNotDelivered = (refreshed || []).filter(it => classifySmsStatus(it) === 'not_delivered');
      const merged = notDeliveredList.slice();
      const seen = new Set(merged.map(it => String(it.id)));
      for (const it of stillNotDelivered) {
        if (!seen.has(String(it.id))) { merged.push(it); seen.add(String(it.id)); }
      }

      const excluded = needsCheckList.length - stillNotDelivered.length;
      if (excluded > 0) toast(`${excluded} رکورد پس از استعلام همچنان نامعلوم بود و حذف شد`, 'info');
      if (!merged.length) { toast('هیچ رکوردی برای چاپ باقی نماند', 'warning'); return; }

      await doPrint(merged, copies);
      loadList();
    };
  };
}

async function doPrint(records, copies = 1) {
  const renderFn = await getHS07Renderer();
  if (!renderFn) {
    toast('قالب فرم HS-07 پیدا نشد. فایل js/forms/templates/hs07.js را اضافه کنید.', 'danger');
    return;
  }

  const printable = records.filter(it => it.record_type === 'fine' || it.record_type === 'warning');
  if (!printable.length) { toast('هیچ فرمی برای چاپ نیست', 'warning'); return; }

  let area = document.getElementById('formPrintArea');
  if (!area) {
    area = document.createElement('div');
    area.id = 'formPrintArea';
    document.body.appendChild(area);
  }

  const labels = ['نسخه سفید: واحد اداری', 'نسخه زرد: خاطی', 'نسخه قرمز: واحد HSE'];
  let html = '';

  for (const item of printable) {
    const formHtml = renderFn(buildFormData(item));
    if (!formHtml) continue;
    if (copies === 3) {
      for (let c = 0; c < 3; c++) {
        html += `<div class="print-form-page"><div class="copy-label">${labels[c]}</div>${formHtml}</div>`;
      }
    } else {
      html += `<div class="print-form-page">${formHtml}</div>`;
    }
  }

  if (!html) { toast('هیچ فرمی رندر نشد', 'warning'); return; }
  area.innerHTML = html;

  await new Promise(r => setTimeout(r, 400));

  try {
    window.print();
  } finally {
    const ids = printable.map(it => it.id);
    setTimeout(() => markFormPrinted(ids), 800);
    setTimeout(() => { area.innerHTML = ''; }, 4000);
  }
}

async function markFormPrinted(ids) {
  if (!Array.isArray(ids) || !ids.length) return;
  try {
    const { error } = await sb.from('safety_finereward')
      .update({ form_printed_at: new Date().toISOString() })
      .in('id', ids);
    if (error) throw error;
  } catch (e) {
    console.warn('[markFormPrinted]', e);
    toast('خطا در ثبت وضعیت چاپ: ' + e.message, 'warning');
  }
}

async function runRefreshAndReload(ids, reload = true) {
  const res = await refreshDeliveries(ids);
  if (!res.success) { toast(res.error || 'خطا در استعلام', 'danger'); return res; }
  const s = res.summary;
  toast(
    `استعلام انجام شد — بررسی: ${s.checked} | تحویل: ${s.delivered} | ناموفق: ${s.failed} | تحویل‌نشده: ${s.notDelivered} | نامعلوم: ${s.unknown}`,
    s.unknown > 0 ? 'warning' : 'success'
  );
  if (reload) await loadList();
  return res;
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
    const { count: incidentCount } = await sb.from('visits_visit')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', id)
      .neq('incident_type', 'none')
      .not('incident_type', 'is', null);

    const { data: records } = await sb.from('safety_finereward').select('record_type').eq('worker_id', id);
    const fines    = (records||[]).filter(r => r.record_type === 'fine').length;
    const rewards  = (records||[]).filter(r => r.record_type === 'reward').length;
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
      const { data: ex } = await sb.from('lab_results_periodicexamination')
        .select('*').eq('patient_id', id).order('exam_date', { ascending: false }).limit(1);
      if (ex && ex.length) exam = ex[0];
    } catch (err) { console.warn('[FR] exam query:', err); }

    let correctiveAction = null;
    try {
      const { data: ca } = await sb.from('occupational_corrective_actions')
        .select('*').eq('patient_id', id).order('created_at', { ascending: false }).limit(1);
      if (ca && ca.length) correctiveAction = ca[0];
    } catch (err) { console.warn('[FR] corrective action query:', err); }

    const opinion   = exam?.final_opinion_text || exam?.final_opinion || exam?.opinion_text || '';
    const conditions = exam?.final_opinion_conditions || exam?.conditions || '';
    const actions    = correctiveAction?.action_text || exam?.corrective_actions || exam?.corrective_action || exam?.actions || '';
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
        <div class="fr-oc-row">
          <span>اقدام اصلاحی:</span>
          <b class="${actionStatus === 'pending' ? 'text-warning' : 'text-success'}">
            ${escapeHtml(actions || 'ندارد')}
            ${actions ? `<small>(${actionStatus === 'pending' ? 'در انتظار' : 'انجام شده'})</small>` : ''}
          </b>
        </div>
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

    const smsResult = await sendSMS(phone, buildSmsText(record, patientName));
    if (smsResult.success) {
      await sb.from('safety_finereward').update({
        sms_status: 'sent', sms_message_id: smsResult.messageId,
        sms_error: null, sms_last_checked_at: null
      }).eq('id', inserted.id);
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
    const sent    = all.filter(it => it.sent_to_finance);

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
  toast('✅ گزارش دانلود و علامت‌گذاری شد', 'success');
  renderFinance();
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

// ═══════════════════════════════════════════════════════
// تب پیامک‌ها
// ═══════════════════════════════════════════════════════
async function renderSMSStatus() {
  const body = $('frBody');

  let creditInfo = null;
  const statusRes = await getAccountStatus();
  if (statusRes.success) creditInfo = statusRes.data;

  body.innerHTML = `
    <div class="card mb-3" style="background:#f8fafc;border:none;border-radius:12px;">
      <div class="card-body p-3 d-flex justify-content-between align-items-center">
        <div>
          <div style="font-size:0.8rem;color:#64748b;">اعتبار پنل پیامک:</div>
          <div class="fw-bold" style="font-size:1.1rem;color:#0f172a;">${creditInfo ? fmtMoney(creditInfo.RemaindCredit) + ' ریال' : 'نامشخص'}</div>
        </div>
        <a href="https://hub.amootsoft.com/panel/" target="_blank" class="btn btn-sm btn-outline-primary"><i class="bi bi-plus-circle"></i> شارژ</a>
      </div>
    </div>
    <div class="fr-filters" style="background:#fff;border-radius:12px;padding:12px;margin-bottom:12px;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
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
  $('frCheckDeliveryBtn').onclick = async () => {
    const btn = $('frCheckDeliveryBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> استعلام...';
    await refreshDeliveries();
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> استعلام';
    loadSMSStatusList();
  };

  loadSMSStatusList();
}

async function loadSMSStatusList() {
  const c = $('frSmsListContainer');
  c.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>';

  const q = $('frSmsFilterQuery')?.value.trim().toLowerCase() || '';
  const from = $('frSmsFilterFrom')?.value.trim() || '';
  const to   = $('frSmsFilterTo')?.value.trim() || '';
  const statusFilter = $('frSmsFilterStatus')?.value || 'all';

  try {
    let query = sb.from('safety_finereward')
      .select('*, patient:core_patient(first_name, last_name, personnel_number, phone_number)')
      .not('sms_status', 'eq', 'pending')
      .order('created_at', { ascending: false });

    if (statusFilter === 'delivered') query = query.eq('sms_is_delivered', true);
    else if (statusFilter === 'sent') query = query.eq('sms_status', 'sent').eq('sms_is_delivered', false);
    else if (statusFilter === 'failed') query = query.eq('sms_status', 'failed');

    const fromG = from ? jalaliToGregorian(from) : null;
    const toG   = to   ? jalaliToGregorian(to)   : null;
    if (fromG) query = query.gte('incident_datetime', fromG + 'T00:00:00');
    if (toG)   query = query.lte('incident_datetime', toG   + 'T23:59:59');

    const { data, error } = await query;
    if (error) throw error;

    let list = data || [];
    if (q) {
      list = list.filter(it => {
        const hay = [it.patient?.first_name, it.patient?.last_name, it.patient?.personnel_number, it.patient?.phone_number, it.sms_error, it.reason].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }

    if (!list.length) {
      c.innerHTML = `<div class="fr-empty"><i class="bi bi-inbox"></i><div>موردی یافت نشد</div></div>`;
      return;
    }

    c.innerHTML = `
      <div class="fr-finance-section">
        <div class="fr-finance-header" style="background:#e0e7ff;color:#3730a3;margin-bottom:10px;">
          <div><i class="bi bi-phone"></i> ${list.length} پیامک</div>
          <div class="d-flex gap-1 flex-wrap">
            <button class="btn btn-outline-primary btn-sm" id="frExportSmsExcel"><i class="bi bi-file-earmark-excel"></i> اکسل</button>
            <button class="btn btn-outline-primary btn-sm" id="frExportSmsPDF"><i class="bi bi-file-earmark-pdf"></i> PDF</button>
            <button class="btn btn-primary btn-sm" id="frResendFailed"><i class="bi bi-arrow-repeat"></i> ارسال مجدد ناموفق‌ها</button>
          </div>
        </div>
        <div class="fr-list">
          ${list.map(it => `
            <div class="fr-item ${it.sms_status === 'failed' ? 'danger' : ''}" data-id="${it.id}">
              <div class="fr-item-icon ${it.sms_status === 'failed' ? 'danger' : 'success'}"><i class="bi ${it.sms_status === 'failed' ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill'}"></i></div>
              <div class="fr-item-body">
                <div class="fr-item-head mb-1">
                  <div class="fr-item-name">${escapeHtml((it.patient?.first_name||'')+' '+(it.patient?.last_name||''))}</div>
                  ${smsBadgeHtml(it)}
                </div>
                <div class="fr-item-personnel">موبایل: ${escapeHtml(it.patient?.phone_number||'—')}</div>
                ${it.sms_cost ? `<div class="fr-item-meta small text-primary">هزینه: ${fmtMoney(it.sms_cost)} ریال</div>` : ''}
                ${it.sms_delivery_datetime ? `<div class="fr-item-meta small text-success">زمان تحویل: ${formatDateTime(it.sms_delivery_datetime)}</div>` : ''}
                ${it.sms_error ? `<div class="fr-item-reason text-danger small mt-1">خطا: ${escapeHtml(it.sms_error)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    $('frExportSmsExcel').onclick = async () => {
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
      const ids = list.map(r => r.id);
      await sb.from('safety_finereward').update({ sms_exported_at: new Date().toISOString() }).in('id', ids);
      toast('✅ خروجی اکسل ذخیره شد', 'success');
    };

    $('frExportSmsPDF').onclick = () => {
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
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ارسال...';

      let success = 0, fail = 0;
      for (const item of failedItems) {
        const name = `${item.patient?.first_name||''} ${item.patient?.last_name||''}`.trim();
        const res = await sendSMS(item.patient?.phone_number, buildSmsText(item, name));
        if (res.success) {
          await sb.from('safety_finereward').update({
            sms_status: 'sent', sms_message_id: res.messageId,
            sms_error: null, sms_last_checked_at: null
          }).eq('id', item.id);
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