// js/modules/forms-archive.js
import { sb } from '../sb.js';
import { $, toast, escapeHtml, faNum, faToEn, gregorianToJalali, jalaliToGregorian } from '../utils.js';
import { showScreen } from '../ui.js';
import { FORMS } from '../forms/registry.js';
import { fitAndPrint } from '../forms/print-fit.js';

// ═══════════════════════════════════════════════════════
// نقشه‌ی نام فرم‌ها (مطابق اسناد BR-PR-HS-07-00 و BR-PR-HS-10-00)
// ═══════════════════════════════════════════════════════
const FORM_NAMES = {
  // ── BR-PR-HS-07-00 : رسیدگی به مراجعات و مدیریت امور بهداری ──
  'BR-FR-HS-34-00': 'فرم بستری موقت مراجعه‌کننده',
  'BR-FR-HS-35-00': 'فرم ثبت اطلاعات مراجعین به بهداری',
  'BR-FR-HS-36-00': 'فرم گزارش مراجعات حوادث ناشی از کار به بهداری',
  'BR-FR-HS-37-00': 'فرم اعزام / ارجاع به مرکز درمانی',
  'BR-FR-HS-38-00': 'فرم گزارش شیفت بهداری',
  'BR-FR-HS-39-00': 'فرم تحویل پسماند عفونی (Safety box) به بیمارستان',
  'BR-FR-HS-40-00': 'فرم کنترل موجودی و مدیریت اقلام دارویی و پزشکی',

  // ── BR-PR-HS-10-00 : مدیریت معاینات و آزمایشات ──
  'BR-FR-HS-47-00': 'فرم معرفی به مرکز معاینات پزشکی و آزمایشات طب کار',
  'BR-FR-HS-48-00': 'فرم ارجاع به متخصص',
  'BR-FR-HS-49-00': 'فرم اعلام نتایج معاینات طب کار',
  'BR-FR-HS-50-00': 'تعهدنامه شروع به کار / ادامه همکاری پرسنل مشروط',
  'BR-FR-HS-51-00': 'فرم ثبت نتایج معاینات بدو استخدام و دوره‌ای',
  'BR-FR-HS-52-00': 'فرم برنامه زمانی انجام معاینات پزشکی و آزمایشات ادواری',
};

const FORM_ICONS = {
  // ── 07-00 ──
  'BR-FR-HS-34-00': { bg:'#fee2e2', color:'#dc2626', icon:'bi-hospital-fill' },
  'BR-FR-HS-35-00': { bg:'#dbeafe', color:'#2563eb', icon:'bi-person-vcard-fill' },
  'BR-FR-HS-36-00': { bg:'#fce7f3', color:'#db2777', icon:'bi-exclamation-triangle-fill' },
  'BR-FR-HS-37-00': { bg:'#ede9fe', color:'#7c3aed', icon:'bi-truck-front-fill' },
  'BR-FR-HS-38-00': { bg:'#fef3c7', color:'#d97706', icon:'bi-clipboard2-check-fill' },
  'BR-FR-HS-39-00': { bg:'#d1fae5', color:'#059669', icon:'bi-trash3-fill' },
  'BR-FR-HS-40-00': { bg:'#cffafe', color:'#0891b2', icon:'bi-boxes' },

  // ── 10-00 ──
  'BR-FR-HS-47-00': { bg:'#e0e7ff', color:'#4f46e5', icon:'bi-file-earmark-medical-fill' },
  'BR-FR-HS-48-00': { bg:'#fce7f3', color:'#db2777', icon:'bi-send-fill' },
  'BR-FR-HS-49-00': { bg:'#cffafe', color:'#0891b2', icon:'bi-clipboard2-pulse-fill' },
  'BR-FR-HS-50-00': { bg:'#fef3c7', color:'#d97706', icon:'bi-file-earmark-text-fill' },
  'BR-FR-HS-51-00': { bg:'#dbeafe', color:'#2563eb', icon:'bi-clipboard2-data-fill' },
  'BR-FR-HS-52-00': { bg:'#d1fae5', color:'#059669', icon:'bi-calendar-week-fill' },
};

// ═══════════════════════════════════════════════════════
// برچسب‌های فارسی برای کلیدهای اسنپ‌شات (_xxx)
// ═══════════════════════════════════════════════════════
const SNAPSHOT_LABELS = {
  _patientName: 'نام و نام خانوادگی',
  _personnelNumber: 'کد پرسنلی',
  _nationalCode: 'کد ملی',
  _phone: 'شماره تماس',
  _fatherName: 'نام پدر',
  _dob: 'تاریخ تولد',
  _age: 'سن',
  _visitDate: 'تاریخ مراجعه',
  _visitTime: 'ساعت مراجعه',
  _visitDateTime: 'تاریخ و ساعت مراجعه',
  _symptomTime: 'ساعت شروع علائم',
  _incidentLocation: 'محل حادثه',
  _incidentDateTime: 'تاریخ و ساعت حادثه',
  _injuries: 'عضو صدمه دیده',
  _unitContractor: 'واحد / پیمانکار',
  _workUnit: 'محل کار',
  _bp: 'فشار خون (BP)',
  _pr: 'ضربان قلب (PR)',
  _rr: 'تعداد تنفس (RR)',
  _tem: 'دمای بدن (Tem)',
  _spo2: 'اکسیژن خون (SPO₂)',
  _gcsE: 'GCS - چشم',
  _gcsV: 'GCS - کلامی',
  _gcsM: 'GCS - حرکتی',
  _gcsTotal: 'GCS - مجموع',
  _dischargeDate: 'تاریخ ترخیص',
  _dischargeTime: 'ساعت ترخیص',
  _dispatchDate: 'تاریخ اعزام',
  _dispatchTime: 'ساعت اعزام',
  _leftAtDate: 'تاریخ ترک با رضایت',
  _vitalsSummary: 'خلاصه علائم حیاتی',
  _isDispatch: 'اعزام با آمبولانس',
  _isReferral: 'ارجاع به مرکز درمانی',
  _visitCount: 'تعداد مراجعه',
};

// ═══════════════════════════════════════════════════════
// پیدا کردن برچسب فارسی برای هر کلید
// ═══════════════════════════════════════════════════════
function getPersianLabel(formCode, key) {
  if (!key) return '';

  // ۱) کلیدهای اسنپ‌شات (شروع با _)
  if (key.startsWith('_')) {
    if (SNAPSHOT_LABELS[key]) return SNAPSHOT_LABELS[key];
    return key.replace(/^_+/, '').replace(/([A-Z])/g, ' $1').trim();
  }

  // ۲) از fields فرم در registry
  const mod = FORMS[formCode];
  const fields = mod?.fields || [];
  const f = fields.find(x => x.key === key);
  if (f?.label) return f.label;

  // ۳) fallback: خود کلید
  return key;
}

// ═══════════════════════════════════════════════════════
// ترجمه‌ی مقدار (yes/no/selects/boolean)
// ═══════════════════════════════════════════════════════
function translateValue(formCode, key, value) {
  if (value === '' || value == null) return '';

  // Boolean
  if (typeof value === 'boolean') {
    return value ? '✓ بله' : '✗ خیر';
  }

  // Select / options → برچسب فارسی
  const mod = FORMS[formCode];
  const fields = mod?.fields || [];
  const f = fields.find(x => x.key === key);
  if (f?.options) {
    const opt = f.options.find(o => String(o.value) === String(value));
    if (opt) return opt.label;
  }

  // مقادیر خاص بدون options
  const specialMap = {
    yes: 'بله',
    no: 'خیر',
    true: 'بله',
    false: 'خیر',
    ambulance: 'آمبولانس',
    agency: 'آژانس',
    personal: 'وسیله شخصی',
    transport: 'ترانسپورت',
    other: 'سایر',
    disease: 'بیماری',
    incident: 'حادثه',
  };
  const s = String(value).toLowerCase();
  if (specialMap[s]) return specialMap[s];

  return String(value);
}

// ═══════════════════════════════════════════════════════
// گرفتن نام و آیکون فرم
// ═══════════════════════════════════════════════════════
function getFormName(code) {
  if (!code) return 'فرم ناشناس';
  const f = FORMS[code];
  if (f && (f.name || f.title)) return f.name || f.title;
  if (FORM_NAMES[code]) return FORM_NAMES[code];
  return code;
}

function getFormIcon(code) {
  if (!code) return { bg:'#f1f5f9', color:'#475569', icon:'bi-file-earmark-text-fill' };
  const f = FORMS[code];
  if (f && f.icon) {
    return { bg: f.iconBg || '#dbeafe', color: f.iconColor || '#2563eb', icon: f.icon };
  }
  if (FORM_ICONS[code]) return FORM_ICONS[code];
  return { bg:'#f1f5f9', color:'#475569', icon:'bi-file-earmark-text-fill' };
}

// ═══════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════
const state = {
  items: [],
  query: '',
  dateFrom: '',
  dateTo: '',
  datePreset: 'all',
  formTypeFilter: 'all',
  loading: false,
  loaded: false,
  patientFilter: null,
};

function showScreenDirect(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen' + name);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
}

// ═══════════════════════════════════════════════════════
// ورودی اصلی
// ═══════════════════════════════════════════════════════
export async function openFormsArchive() {
  showScreenDirect('FormsArchive');
  const wrap = $('formsArchiveContent');
  if (!wrap) return;

  state.loaded = false;
  state.items = [];
  state.patientFilter = null;
  state.query = '';
  state.dateFrom = '';
  state.dateTo = '';
  state.datePreset = 'all';
  state.formTypeFilter = 'all';

  wrap.innerHTML = renderShell();
  bindShellEvents();
  await loadAll();
  state.loaded = true;
  renderFormTypeChips();
  renderList();
}

// ═══════════════════════════════════════════════════════
// Shell
// ═══════════════════════════════════════════════════════
function renderShell() {
  return `
    <div class="archive-page">
      <div class="archive-header">
        <button class="archive-back-btn" id="archiveBack">
          <i class="bi bi-arrow-right"></i>
        </button>
        <div class="archive-title-wrap">
          <div class="archive-title">آرشیو فرم‌ها</div>
          <div class="archive-sub">جستجو، مشاهده و چاپ مجدد</div>
        </div>
      </div>

      <div class="archive-search-bar">
        <i class="bi bi-search"></i>
        <input type="text" id="archiveQuery" placeholder="نام کارگر، کد پرسنلی، کد ملی..." autocomplete="off">
        <button class="archive-clear-btn" id="archiveClear" style="display:none;">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>

      <div id="archivePatientChip"></div>

      <div class="archive-filter-row">
        <select class="archive-filter-select" id="archiveDatePreset">
          <option value="all">همه زمان‌ها</option>
          <option value="today">امروز</option>
          <option value="week">۷ روز اخیر</option>
          <option value="month">۳۰ روز اخیر</option>
          <option value="custom">بازه دلخواه</option>
        </select>
        <button class="archive-filter-btn" id="archiveRefresh" title="بارگذاری مجدد">
          <i class="bi bi-arrow-clockwise"></i>
        </button>
      </div>

      <div id="archiveCustomDate" style="display:none;" class="archive-custom-date">
        <div>
          <label>از</label>
          <input type="text" id="archiveDateFrom" placeholder="1403/01/01" dir="ltr" autocomplete="off">
        </div>
        <div>
          <label>تا</label>
          <input type="text" id="archiveDateTo" placeholder="1403/12/29" dir="ltr" autocomplete="off">
        </div>
        <button class="btn btn-primary btn-sm" id="archiveApplyDate">اعمال</button>
      </div>

      <div class="archive-form-chips" id="archiveFormChips"></div>

      <div id="archiveStats" class="archive-stats"></div>
      <div id="archiveList" class="archive-list"></div>
      <div id="archiveLoadMore" class="archive-load-more"></div>
    </div>
  `;
}

function bindShellEvents() {
  const wrap = $('formsArchiveContent');
  if (!wrap) return;

  const backBtn = wrap.querySelector('#archiveBack');
  if (backBtn) backBtn.onclick = () => {
    import('./forms-menu.js').then(m => m.openFormsMenu()).catch(() => {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      const m = document.getElementById('screenFormsMenu');
      if (m) m.classList.add('active');
    });
  };

  const q = wrap.querySelector('#archiveQuery');
  const clearBtn = wrap.querySelector('#archiveClear');
  let timer = null;
  q.oninput = () => {
    clearBtn.style.display = q.value ? '' : 'none';
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.query = q.value.trim();
      state.patientFilter = null;
      renderPatientChip();
      renderList();
    }, 250);
  };
  q.onkeydown = (e) => { if (e.key === 'Enter') q.blur(); };

  clearBtn.onclick = () => {
    q.value = '';
    clearBtn.style.display = 'none';
    state.query = '';
    state.patientFilter = null;
    renderPatientChip();
    renderList();
  };

  wrap.querySelector('#archiveDatePreset').onchange = (e) => {
    state.datePreset = e.target.value;
    const custom = wrap.querySelector('#archiveCustomDate');
    custom.style.display = state.datePreset === 'custom' ? 'flex' : 'none';
    if (state.datePreset !== 'custom') {
      state.dateFrom = '';
      state.dateTo = '';
      renderList();
    }
  };

  wrap.querySelector('#archiveApplyDate').onclick = () => {
    state.dateFrom = wrap.querySelector('#archiveDateFrom').value.trim();
    state.dateTo = wrap.querySelector('#archiveDateTo').value.trim();
    renderList();
  };

  wrap.querySelector('#archiveRefresh').onclick = async () => {
    await loadAll();
    renderFormTypeChips();
    renderList();
  };
}

// ═══════════════════════════════════════════════════════
// چیپ‌های فیلتر نوع فرم
// ═══════════════════════════════════════════════════════
function renderFormTypeChips() {
  const el = $('archiveFormChips');
  if (!el) return;

  const counts = {};
  state.items.forEach(it => {
    counts[it.formCode] = (counts[it.formCode] || 0) + 1;
  });

  const total = state.items.length;
  const codes = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  el.innerHTML = `
    <button class="archive-chip ${state.formTypeFilter === 'all' ? 'active' : ''}"
            data-form="all" type="button">
      <i class="bi bi-grid-fill"></i>
      <span class="archive-chip-title">همه</span>
      <span class="archive-chip-count">${faNum(total)}</span>
    </button>
    ${codes.map(code => {
      const icon = getFormIcon(code);
      const name = getFormName(code);
      const active = state.formTypeFilter === code;
      return `
        <button class="archive-chip ${active ? 'active' : ''}"
                data-form="${escapeHtml(code)}" type="button"
                title="${escapeHtml(name)} — ${escapeHtml(code)}">
          <i class="bi ${icon.icon}"></i>
          <span class="archive-chip-body">
            <span class="archive-chip-title">${escapeHtml(name)}</span>
            <span class="archive-chip-code" dir="ltr">${escapeHtml(code)}</span>
          </span>
          <span class="archive-chip-count">${faNum(counts[code])}</span>
        </button>`;
    }).join('')}
  `;

  el.querySelectorAll('.archive-chip').forEach(btn => {
    btn.onclick = () => {
      const form = btn.dataset.form;
      if (state.formTypeFilter === form) {
        state.formTypeFilter = 'all';
      } else {
        state.formTypeFilter = form;
      }
      renderFormTypeChips();
      renderList();
    };
  });
}

// ═══════════════════════════════════════════════════════
// بارگذاری از Supabase
// ═══════════════════════════════════════════════════════
async function loadAll() {
  state.loading = true;
  state.items = [];

  try {
    const { data, error } = await sb.from('form_records')
      .select('id, form_code, process_code, patient_id, visit_id, exam_id, data, created_at, created_by_email')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    (data || []).forEach(r => {
      const d = r.data || {};
      state.items.push({
        id: r.id,
        source: 'form_records',
        formCode: r.form_code,
        formName: getFormName(r.form_code),
        processCode: r.process_code || null,
        patientId: r.patient_id || null,
        visitId: r.visit_id || null,
        examId: r.exam_id || null,
        data: d,
        createdAt: r.created_at,
        createdBy: r.created_by_email || '',
        workerName: d._patientName || d.patientName || d.fullName || '',
        personnelNumber: d._personnelNumber || d.personnelNumber || '',
        nationalCode: d._nationalCode || d.nationalCode || '',
      });
    });
  } catch (e) {
    console.error('[ARCHIVE] form_records failed:', e);
    const list = $('archiveList');
    if (list) {
      list.innerHTML = `
        <div class="alert alert-danger m-3">
          <i class="bi bi-exclamation-triangle"></i>
          خواندن آرشیو ناموفق بود: ${escapeHtml(e.message || 'خطای نامشخص')}
          <button class="btn btn-sm btn-outline-danger mt-2 d-block" id="archiveRetry">تلاش مجدد</button>
        </div>`;
      const retry = list.querySelector('#archiveRetry');
      if (retry) retry.onclick = async () => { await loadAll(); renderFormTypeChips(); renderList(); };
    }
    state.loading = false;
    return;
  }

  try {
    const { data, error } = await sb.from('core_dailyreport')
      .select('id, date, shift_type, created_at')
      .order('date', { ascending: false })
      .limit(300);
    if (error) throw error;

    (data || []).forEach(r => {
      state.items.push({
        id: `daily-${r.id}`,
        source: 'core_dailyreport',
        formCode: 'BR-FR-HS-38-00',
        formName: getFormName('BR-FR-HS-38-00'),
        processCode: null,
        patientId: null,
        visitId: null,
        examId: null,
        data: { date: r.date, shiftType: r.shift_type, _legacy: true },
        createdAt: r.created_at || r.date,
        createdBy: '',
        workerName: '',
        personnelNumber: '',
        nationalCode: '',
      });
    });
  } catch (e) {
    console.warn('[ARCHIVE] core_dailyreport failed:', e);
  }

  state.items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  state.loading = false;
}

// ═══════════════════════════════════════════════════════
// نرمال‌سازی و فیلتر
// ═══════════════════════════════════════════════════════
function normalize(s) {
  if (!s) return '';
  return faToEn(String(s))
    .replace(/[يى]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/\u200c/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getDateRange() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  let start = null;
  switch (state.datePreset) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      break;
    case 'week':
      start = new Date(end.getTime() - 7 * 86400000);
      break;
    case 'month':
      start = new Date(end.getTime() - 30 * 86400000);
      break;
    case 'custom': {
      const gFrom = state.dateFrom ? jalaliToGregorian(state.dateFrom) : null;
      const gTo = state.dateTo ? jalaliToGregorian(state.dateTo) : null;
      if (gFrom) start = new Date(gFrom + 'T00:00:00');
      if (gTo) end.setTime(new Date(gTo + 'T23:59:59').getTime());
      break;
    }
    default:
      return { start: null, end: null };
  }
  return { start, end };
}

function applyFilters() {
  const nq = normalize(state.query);
  const { start, end } = getDateRange();

  return state.items.filter(it => {
    if (state.formTypeFilter !== 'all' && it.formCode !== state.formTypeFilter) {
      return false;
    }

    if (state.patientFilter) {
      if (String(it.patientId) !== String(state.patientFilter.id)) return false;
    }

    if (start || end) {
      const d = new Date(it.createdAt || 0);
      if (start && d < start) return false;
      if (end && d > end) return false;
    }

    if (nq) {
      const hay = [
        it.workerName,
        it.personnelNumber,
        it.nationalCode,
        it.formName,
        it.formCode,
        it.createdBy,
        Object.values(it.data || {}).filter(v => typeof v === 'string').join(' ')
      ].map(normalize).join(' | ');
      if (!hay.includes(nq)) return false;
    }

    return true;
  });
}

// ═══════════════════════════════════════════════════════
// نمایش لیست
// ═══════════════════════════════════════════════════════
function renderPatientChip() {
  const el = $('archivePatientChip');
  if (!el) return;
  if (!state.patientFilter) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `
    <div class="archive-patient-chip">
      <i class="bi bi-person-fill"></i>
      <span>فقط فرم‌های: <strong>${escapeHtml(state.patientFilter.name)}</strong></span>
      <button id="archivePatientChipClear"><i class="bi bi-x-lg"></i></button>
    </div>`;
  const btn = el.querySelector('#archivePatientChipClear');
  if (btn) btn.onclick = () => {
    state.patientFilter = null;
    renderPatientChip();
    renderList();
  };
}

function renderList() {
  const list = $('archiveList');
  const stats = $('archiveStats');
  const more = $('archiveLoadMore');
  if (!list) return;

  if (state.loading) {
    list.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
    if (stats) stats.innerHTML = '';
    if (more) more.innerHTML = '';
    return;
  }

  const filtered = applyFilters();

  const filterSummary = [];
  if (state.formTypeFilter !== 'all') {
    filterSummary.push(getFormName(state.formTypeFilter));
  }
  if (state.patientFilter) {
    filterSummary.push(`فرد: ${state.patientFilter.name}`);
  }
  if (state.datePreset !== 'all') {
    filterSummary.push({
      today: 'امروز', week: '۷ روز اخیر', month: '۳۰ روز اخیر', custom: 'بازه دلخواه'
    }[state.datePreset]);
  }

  if (stats) {
    stats.innerHTML = `
      <div class="archive-stat">
        <i class="bi bi-list-check"></i>
        <span>${faNum(filtered.length)} فرم</span>
      </div>
      ${filterSummary.length ? `
        <div class="archive-stat active">
          <i class="bi bi-funnel-fill"></i>
          <span>${escapeHtml(filterSummary.join(' • '))}</span>
          <button class="archive-stat-clear" id="archiveClearAllFilters" title="حذف همه فیلترها">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>` : ''}
    `;
    const clearAll = stats.querySelector('#archiveClearAllFilters');
    if (clearAll) clearAll.onclick = clearAllFilters;
  }

  if (!filtered.length) {
    list.innerHTML = `
      <div class="archive-empty">
        <i class="bi bi-inbox"></i>
        <div>فرمی یافت نشد</div>
        <div class="muted small">${state.items.length ? 'فیلترها را تغییر دهید' : 'هنوز فرمی ثبت نشده است'}</div>
      </div>`;
    if (more) more.innerHTML = '';
    return;
  }

  list.innerHTML = filtered.slice(0, 200).map(it => {
    const icon = getFormIcon(it.formCode);
    const isLegacy = it.source === 'core_dailyreport';
    return `
      <div class="archive-item" data-id="${escapeHtml(String(it.id))}">
        <div class="archive-item-icon" style="background:${icon.bg};color:${icon.color};">
          <i class="bi ${icon.icon}"></i>
        </div>
        <div class="archive-item-body">
          <div class="archive-item-title">
            ${escapeHtml(it.formName)}
            ${isLegacy ? '<span class="badge-soft warning ms-1">قدیمی</span>' : ''}
          </div>
          <div class="archive-item-code-row">
            <span class="archive-item-code" dir="ltr">${escapeHtml(it.formCode)}</span>
          </div>
          <div class="archive-item-meta">
            <span><i class="bi bi-calendar3"></i> ${escapeHtml(formatDate(it.createdAt))}</span>
            ${it.workerName ? `<span class="archive-worker-name"><i class="bi bi-person-fill"></i> ${escapeHtml(it.workerName)}</span>` : ''}
          </div>
        </div>
        <i class="bi bi-chevron-left archive-item-arrow"></i>
      </div>`;
  }).join('');

  if (more) {
    if (filtered.length > 200) {
      more.innerHTML = `<div class="text-center muted small py-3">نمایش ۲۰۰ از ${faNum(filtered.length)} — فیلتر را دقیق‌تر کنید</div>`;
    } else {
      more.innerHTML = '';
    }
  }

  list.querySelectorAll('.archive-item').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.id;
      const it = filtered.find(x => String(x.id) === id);
      if (it) openArchiveItem(it);
    };
  });
}

function clearAllFilters() {
  state.formTypeFilter = 'all';
  state.patientFilter = null;
  state.query = '';
  state.dateFrom = '';
  state.dateTo = '';
  state.datePreset = 'all';

  const wrap = $('formsArchiveContent');
  if (wrap) {
    const q = wrap.querySelector('#archiveQuery');
    if (q) q.value = '';
    const clearBtn = wrap.querySelector('#archiveClear');
    if (clearBtn) clearBtn.style.display = 'none';
    const preset = wrap.querySelector('#archiveDatePreset');
    if (preset) preset.value = 'all';
    const custom = wrap.querySelector('#archiveCustomDate');
    if (custom) custom.style.display = 'none';
  }

  renderPatientChip();
  renderFormTypeChips();
  renderList();
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    const g = d.toISOString().slice(0, 10);
    const j = gregorianToJalali(g);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${j} - ${hh}:${mm}`;
  } catch (e) { return iso; }
}

// ═══════════════════════════════════════════════════════
// مودال جزئیات — با برچسب و مقدار فارسی
// ═══════════════════════════════════════════════════════
function openArchiveItem(it) {
  const icon = getFormIcon(it.formCode);
  const workerName = it.workerName || '—';

  const HIDDEN_KEYS = new Set([
    '_legacy', '_hospitals', '_shiftHistory', '_userOptions',
    'processCode', 'createdBy',
  ]);

  const detailRows = Object.entries(it.data || {})
    .filter(([k, v]) => {
      if (HIDDEN_KEYS.has(k)) return false;
      if (k.startsWith('__')) return false;
      if (v === '' || v == null) return false;
      if (typeof v === 'object') return false;
      return true;
    })
    .map(([k, v]) => {
      const label = getPersianLabel(it.formCode, k);
      const val = translateValue(it.formCode, k, v);
      return `<tr>
        <td class="detail-key">${escapeHtml(label)}</td>
        <td class="detail-val">${escapeHtml(val)}</td>
      </tr>`;
    })
    .join('');

  const sheet = document.createElement('div');
  sheet.className = 'archive-sheet';
  sheet.innerHTML = `
    <div class="archive-sheet-handle"></div>
    <div class="archive-sheet-head">
      <div class="archive-sheet-icon" style="background:${icon.bg};color:${icon.color};">
        <i class="bi ${icon.icon}"></i>
      </div>
      <div>
        <div class="archive-sheet-title">${escapeHtml(it.formName)}</div>
        <div class="archive-sheet-sub">کد فرم: <bdi dir="ltr">${escapeHtml(it.formCode)}</bdi></div>
      </div>
    </div>

    <div class="archive-sheet-meta">
      <div class="archive-meta-item"><i class="bi bi-calendar3"></i><span>${escapeHtml(formatDate(it.createdAt))}</span></div>
      ${workerName !== '—' ? `<div class="archive-meta-item"><i class="bi bi-person-fill"></i><span>${escapeHtml(workerName)}</span></div>` : ''}
      ${it.personnelNumber ? `<div class="archive-meta-item"><i class="bi bi-hash"></i><span>پرسنلی: <bdi dir="ltr">${escapeHtml(it.personnelNumber)}</bdi></span></div>` : ''}
    </div>

    <div class="archive-sheet-body">
      <div class="archive-sheet-section-title">اطلاعات ثبت‌شده</div>
      ${detailRows ? `<table class="archive-detail-table"><tbody>${detailRows}</tbody></table>`
                   : '<div class="archive-sheet-empty">داده‌ی نمایش‌دادنی موجود نیست</div>'}
    </div>

    <div class="archive-sheet-actions">
      <button class="btn btn-primary w-100" id="archiveReprintBtn">
        <i class="bi bi-printer-fill"></i> چاپ مجدد فرم
      </button>
      ${it.patientId ? `
        <button class="btn btn-outline-primary w-100 mt-2" id="archiveFilterPersonBtn">
          <i class="bi bi-person-lines-fill"></i> همه فرم‌های این فرد
        </button>` : ''}
      <button class="btn btn-light w-100 mt-2" id="archiveCloseBtn">بستن</button>
    </div>
  `;

  const backdrop = document.createElement('div');
  backdrop.className = 'archive-backdrop';
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);

  const close = () => { backdrop.classList.add('closing'); setTimeout(() => backdrop.remove(), 200); };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  sheet.querySelector('#archiveCloseBtn').onclick = close;
  sheet.querySelector('#archiveReprintBtn').onclick = () => { close(); reprintForm(it); };

  const filterPersonBtn = sheet.querySelector('#archiveFilterPersonBtn');
  if (filterPersonBtn) {
    filterPersonBtn.onclick = () => {
      close();
      state.patientFilter = { id: it.patientId, name: it.workerName || 'کارگر' };
      renderPatientChip();
      renderList();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }
}

// ═══════════════════════════════════════════════════════
// چاپ مجدد
// ═══════════════════════════════════════════════════════
function reprintForm(item) {
  if (item.source === 'core_dailyreport') {
    toast('گزارش‌های قدیمی از این طریق چاپ نمی‌شوند', 'info');
    return;
  }
  const form = FORMS[item.formCode];
  if (!form || typeof form.render !== 'function') {
    toast('امکان چاپ مجدد این فرم وجود ندارد', 'warning');
    return;
  }

  let area = document.getElementById('formPrintArea');
  if (!area) {
    area = document.createElement('div');
    area.id = 'formPrintArea';
    document.body.appendChild(area);
  }

  const rendered = form.render(item.data) || '';
  const hasSheet = /class=["'][^"']*form-sheet/.test(rendered);
  area.innerHTML = hasSheet ? rendered : `<div class="form-sheet">${rendered}</div>`;

  fitAndPrint(area, { delay: 150 });
}
