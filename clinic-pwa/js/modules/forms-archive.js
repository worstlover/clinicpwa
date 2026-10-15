// js/modules/forms-archive.js
import { sb } from '../sb.js';
import { $, toast, escapeHtml } from '../utils.js';
import { showScreen } from '../ui.js';
import { todayJalali, jalaliToGregorian, gregorianToJalali } from '../utils.js';

// ═══════════════════════════════════════════════════════
// نام فرم‌ها
// ═══════════════════════════════════════════════════════
const FORM_NAMES = {
  'BR-FR-HS-34-00': 'فرم بستری موقت مراجعه کننده',
  'BR-FR-HS-36-00': 'فرم گزارش مراجعات حوادث ناشی از کار',
  'BR-FR-HS-37-00': 'فرم اعزام / ارجاع به مرکز درمانی',
  'BR-FR-HS-38-00': 'فرم گزارش شیفت بهداری',
  'BR-FR-HS-39-00': 'فرم تحویل Safety box / پسماند عفونی',
  'BR-FR-HS-48-00': 'فرم ارجاع به متخصص',
  'BR-FR-HS-49-00': 'فرم اعلام نتایج معاینات طب کار',
  'BR-FR-HS-50-00': 'فرم تعهدنامه شروع به کار / ادامه همکاری',
};

const FORM_ICONS = {
  'BR-FR-HS-34-00': { bg:'#dbeafe', color:'#2563eb', icon:'bi-hospital-fill' },
  'BR-FR-HS-36-00': { bg:'#fee2e2', color:'#dc2626', icon:'bi-exclamation-triangle-fill' },
  'BR-FR-HS-37-00': { bg:'#fef3c7', color:'#d97706', icon:'bi-send-fill' },
  'BR-FR-HS-38-00': { bg:'#d1fae5', color:'#059669', icon:'bi-calendar-check-fill' },
  'BR-FR-HS-39-00': { bg:'#cffafe', color:'#0891b2', icon:'bi-shield-fill-check' },
  'BR-FR-HS-48-00': { bg:'#ede9fe', color:'#7c3aed', icon:'bi-person-badge-fill' },
  'BR-FR-HS-49-00': { bg:'#e0e7ff', color:'#4f46e5', icon:'bi-clipboard2-pulse-fill' },
  'BR-FR-HS-50-00': { bg:'#fce7f3', color:'#db2777', icon:'bi-file-earmark-check-fill' },
};

// ═══════════════════════════════════════════════════════
// دسته‌بندی سریع
// ═══════════════════════════════════════════════════════
const CATEGORIES = [
  { id: 'all',          label: 'همه',              icon: 'bi-collection-fill' },
  { id: 'shift',        label: 'گزارش شیفت',       icon: 'bi-calendar-check-fill', codes: ['BR-FR-HS-38-00'] },
  { id: 'safety',       label: 'Safety box',       icon: 'bi-shield-fill-check',   codes: ['BR-FR-HS-39-00'] },
  { id: 'referral',     label: 'ارجاع و اعزام',    icon: 'bi-send-fill',           codes: ['BR-FR-HS-37-00', 'BR-FR-HS-48-00'] },
  { id: 'incident',     label: 'حوادث',            icon: 'bi-exclamation-triangle-fill', codes: ['BR-FR-HS-36-00'] },
  { id: 'occupational', label: 'طب کار',           icon: 'bi-clipboard2-pulse-fill', codes: ['BR-FR-HS-49-00', 'BR-FR-HS-50-00'] },
  { id: 'admission',    label: 'بستری موقت',       icon: 'bi-hospital-fill',       codes: ['BR-FR-HS-34-00'] },
];

// ═══════════════════════════════════════════════════════
// وضعیت
// ═══════════════════════════════════════════════════════
const state = {
  items: [],
  category: 'all',
  query: '',
  dateFrom: '',
  dateTo: '',
  datePreset: 'all',
  loading: false,
  loaded: false,
};

// ═══════════════════════════════════════════════════════
// ورودی
// ═══════════════════════════════════════════════════════
export async function openFormsArchive() {
  showScreen('FormsArchive');
  const wrap = $('formsArchiveContent');
  if (!wrap) return;

  if (!state.loaded && !state.loading) {
    wrap.innerHTML = renderShell(true);
    bindShellEvents();
    await loadAll();
    state.loaded = true;
  } else {
    wrap.innerHTML = renderShell(false);
    bindShellEvents();
  }

  renderList();
}

// ═══════════════════════════════════════════════════════
// اسکلت
// ═══════════════════════════════════════════════════════
function renderShell(loading) {
  const preset = state.datePreset;
  const today = todayJalali();

  return `
    <div class="archive-page">

      <div class="archive-header">
        <div class="archive-header-title">آرشیو فرم‌ها</div>
        <div class="archive-header-sub">جستجو و مشاهده فرم‌های ثبت‌شده</div>
      </div>

      <!-- جستجو -->
      <div class="archive-search">
        <i class="bi bi-search archive-search-icon"></i>
        <input
          type="text"
          id="archiveSearchInput"
          class="archive-search-input"
          placeholder="نام کارگر، کد پرسنلی، بیمارستان..."
          autocomplete="off"
          value="${escapeHtml(state.query)}">
        <button id="archiveClearBtn" class="archive-search-clear ${state.query ? '' : 'hidden'}">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>

      <!-- فیلتر تاریخ -->
      <div class="archive-dates">
        <div class="archive-date-presets">
          <button class="archive-date-preset ${preset === 'all' ? 'active' : ''}" data-preset="all">همه</button>
          <button class="archive-date-preset ${preset === 'today' ? 'active' : ''}" data-preset="today">امروز</button>
          <button class="archive-date-preset ${preset === '7d' ? 'active' : ''}" data-preset="7d">۷ روز</button>
          <button class="archive-date-preset ${preset === '30d' ? 'active' : ''}" data-preset="30d">۳۰ روز</button>
          <button class="archive-date-preset ${preset === 'custom' ? 'active' : ''}" data-preset="custom">سفارشی</button>
        </div>

        <div class="archive-date-custom ${preset === 'custom' ? '' : 'hidden'}" id="archiveDateCustom">
          <div class="archive-date-field">
            <label>از تاریخ</label>
            <input type="text" id="archiveDateFrom" placeholder="1404/01/01" dir="ltr"
              value="${escapeHtml(state.dateFrom)}">
          </div>
          <div class="archive-date-field">
            <label>تا تاریخ</label>
            <input type="text" id="archiveDateTo" placeholder="1404/12/29" dir="ltr"
              value="${escapeHtml(state.dateTo)}">
          </div>
        </div>
      </div>

      <!-- دسته‌بندی -->
      <div class="archive-cats" id="archiveCats">
        ${CATEGORIES.map(c => `
          <button class="archive-cat ${state.category === c.id ? 'active' : ''}" data-cat="${c.id}">
            <i class="bi ${c.icon}"></i>
            <span>${escapeHtml(c.label)}</span>
          </button>
        `).join('')}
      </div>

      <div class="archive-count" id="archiveCount"></div>

      <div id="archiveList" class="archive-list">
        ${loading ? renderSkeleton() : ''}
      </div>
    </div>
  `;
}

function renderSkeleton() {
  return Array.from({ length: 4 }).map(() => `
    <div class="archive-item skeleton">
      <div class="skeleton-line" style="width:60%"></div>
      <div class="skeleton-line" style="width:40%;margin-top:8px"></div>
      <div class="skeleton-line" style="width:75%;margin-top:8px"></div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════
// رویدادها
// ═══════════════════════════════════════════════════════
function bindShellEvents() {
  const input = $('archiveSearchInput');
  const clearBtn = $('archiveClearBtn');
  const catsWrap = $('archiveCats');
  const presetWrap = document.querySelector('.archive-date-presets');
  const customWrap = $('archiveDateCustom');
  const dateFromEl = $('archiveDateFrom');
  const dateToEl = $('archiveDateTo');

  // جستجو
  if (input) {
    let t = null;
    input.addEventListener('input', (e) => {
      state.query = e.target.value.trim();
      if (clearBtn) clearBtn.classList.toggle('hidden', !state.query);
      clearTimeout(t);
      t = setTimeout(() => renderList(), 220);
    });
  }

  if (clearBtn) {
    clearBtn.onclick = () => {
      state.query = '';
      if (input) input.value = '';
      clearBtn.classList.add('hidden');
      renderList();
    };
  }

  // دسته‌بندی
  if (catsWrap) {
    catsWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      state.category = btn.dataset.cat;
      catsWrap.querySelectorAll('.archive-cat').forEach(el => {
        el.classList.toggle('active', el.dataset.cat === state.category);
      });
      renderList();
    });
  }

  // پریست تاریخ
  if (presetWrap) {
    presetWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-preset]');
      if (!btn) return;
      state.datePreset = btn.dataset.preset;

      presetWrap.querySelectorAll('.archive-date-preset').forEach(el => {
        el.classList.toggle('active', el.dataset.preset === state.datePreset);
      });

      // نمایش/مخفی کردن ورودی سفارشی
      if (customWrap) {
        customWrap.classList.toggle('hidden', state.datePreset !== 'custom');
      }

      // اگر پریست غیر سفارشی انتخاب شد، تاریخ‌ها رو خودکار پر کن
      if (state.datePreset !== 'custom') {
        computePresetDates();
      }

      renderList();
    });
  }

  // ورودی‌های تاریخ
  if (dateFromEl) {
    dateFromEl.addEventListener('input', (e) => {
      state.dateFrom = e.target.value.trim();
      state.datePreset = 'custom';
      if (presetWrap) presetWrap.querySelectorAll('.archive-date-preset').forEach(el => {
        el.classList.toggle('active', el.dataset.preset === 'custom');
      });
      renderList();
    });
  }

  if (dateToEl) {
    dateToEl.addEventListener('input', (e) => {
      state.dateTo = e.target.value.trim();
      state.datePreset = 'custom';
      if (presetWrap) presetWrap.querySelectorAll('.archive-date-preset').forEach(el => {
        el.classList.toggle('active', el.dataset.preset === 'custom');
      });
      renderList();
    });
  }

  // اگر پریست غیر از custom بود، تاریخ‌ها رو حساب کن
  if (state.datePreset !== 'custom' && state.datePreset !== 'all') {
    computePresetDates();
  }
}

// ═══════════════════════════════════════════════════════
// محاسبه‌ی بازه‌ی تاریخ بر اساس پریست
// ═══════════════════════════════════════════════════════
function computePresetDates() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let from = null;

  if (state.datePreset === 'today') {
    from = today;
  } else if (state.datePreset === '7d') {
    from = new Date(today);
    from.setDate(from.getDate() - 6);
  } else if (state.datePreset === '30d') {
    from = new Date(today);
    from.setDate(from.getDate() - 29);
  } else if (state.datePreset === 'all') {
    state.dateFrom = '';
    state.dateTo = '';
    return;
  }

  if (from) {
    state.dateFrom = gregorianToJalali(from.toISOString().split('T')[0]);
    state.dateTo = gregorianToJalali(today.toISOString().split('T')[0]);
  }

  // آپدیت ورودی‌ها
  const fromEl = $('archiveDateFrom');
  const toEl = $('archiveDateTo');
  if (fromEl) fromEl.value = state.dateFrom;
  if (toEl) toEl.value = state.dateTo;
}

// ═══════════════════════════════════════════════════════
// بارگذاری داده‌ها
// ═══════════════════════════════════════════════════════
async function loadAll() {
  state.loading = true;
  state.items = [];

  // ۱) form_records
  try {
    const { data, error } = await sb.from('form_records')
      .select('id, form_code, data, created_at, created_by')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    (data || []).forEach(r => {
      state.items.push({
        id: r.id,
        source: 'form_records',
        formCode: r.form_code,
        formName: FORM_NAMES[r.form_code] || r.form_code,
        data: r.data || {},
        createdAt: r.created_at,
        createdBy: r.created_by,
      });
    });
  } catch (e) {
    console.warn('[ARCHIVE] form_records failed:', e);
  }

  // ۲) core_dailyreport (فرم ۳۸)
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
        formName: FORM_NAMES['BR-FR-HS-38-00'],
        data: {
          date: r.date,
          shiftType: r.shift_type,
        },
        createdAt: r.created_at || r.date,
      });
    });
  } catch (e) {
    console.warn('[ARCHIVE] core_dailyreport failed:', e);
  }

  // مرتب‌سازی نزولی بر اساس تاریخ
  state.items.sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });

  state.loading = false;
}

// ═══════════════════════════════════════════════════════
// فیلتر و رندر
// ═══════════════════════════════════════════════════════
function renderList() {
  const listEl = $('archiveList');
  const countEl = $('archiveCount');
  if (!listEl) return;

  if (state.loading) {
    listEl.innerHTML = renderSkeleton();
    return;
  }

  // ۱) دسته
  const cat = CATEGORIES.find(c => c.id === state.category);
  let filtered = state.items;
  if (cat && cat.codes) {
    filtered = filtered.filter(it => cat.codes.includes(it.formCode));
  }

  // ۲) جستجو
  if (state.query) {
    const q = state.query.toLowerCase();
    filtered = filtered.filter(it => {
      const hay = [
        it.formName,
        it.formCode,
        it.data?._patientName,
        it.data?.patientName,
        it.data?._personnelNumber,
        it.data?.personnelNumber,
        it.data?.hospitalName,
        it.data?.deliverer,
        it.data?.receiver,
        it.data?.shiftType,
        it.data?.referralSpecialty,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  // ۳) تاریخ
  const fromTs = toTimestamp(state.dateFrom, false);
  const toTs = toTimestamp(state.dateTo, true);

  if (fromTs || toTs) {
    filtered = filtered.filter(it => {
      const t = new Date(it.createdAt || 0).getTime();
      if (fromTs && t < fromTs) return false;
      if (toTs && t > toTs) return false;
      return true;
    });
  }

  // شمارش
  if (countEl) {
    countEl.textContent = filtered.length
      ? `${filtered.length.toLocaleString('fa-IR')} فرم یافت شد`
      : '';
  }

  // رندر
  if (!filtered.length) {
    listEl.innerHTML = renderEmpty();
    return;
  }

  listEl.innerHTML = filtered.map(it => renderItem(it)).join('');

  // کلیک
  listEl.querySelectorAll('[data-archive-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.archiveId;
      const item = filtered.find(x => String(x.id) === String(id));
      if (item) openArchiveItem(item);
    });
  });
}

function toTimestamp(jalaliDate, isEndOfDay) {
  if (!jalaliDate) return null;
  const greg = jalaliToGregorian(jalaliDate);
  if (!greg) return null;
  const d = new Date(greg + (isEndOfDay ? 'T23:59:59' : 'T00:00:00'));
  return isNaN(d.getTime()) ? null : d.getTime();
}

function renderEmpty() {
  const isFiltered = state.query || state.category !== 'all' ||
                     state.dateFrom || state.dateTo;
  return `
    <div class="archive-empty">
      <i class="bi bi-inbox"></i>
      <div class="archive-empty-title">
        ${isFiltered ? 'فرمی با این مشخصات یافت نشد' : 'هنوز فرمی ثبت نشده'}
      </div>
      <div class="archive-empty-sub">
        ${isFiltered
          ? 'فیلترها یا جستجو را تغییر دهید'
          : 'فرم‌های تکمیل‌شده در این بخش نمایش داده می‌شوند'}
      </div>
    </div>
  `;
}

function renderItem(it) {
  const icon = FORM_ICONS[it.formCode] || { bg:'#f1f5f9', color:'#475569', icon:'bi-file-earmark-text-fill' };
  const workerName = it.data?._patientName || it.data?.patientName || '';
  const personnel = it.data?._personnelNumber || it.data?.personnelNumber || '';
  const hospital = it.data?.hospitalName || '';
  const shift = it.data?.shiftType || '';
  const date = formatDate(it.createdAt);

  return `
    <button class="archive-item" data-archive-id="${escapeHtml(String(it.id))}">
      <div class="archive-item-icon" style="background:${icon.bg};color:${icon.color};">
        <i class="bi ${icon.icon}"></i>
      </div>
      <div class="archive-item-body">
        <div class="archive-item-head">
          <span class="archive-item-code">${escapeHtml(it.formCode)}</span>
          <span class="archive-item-date">${escapeHtml(date)}</span>
        </div>
        <div class="archive-item-name">${escapeHtml(it.formName)}</div>
        ${workerName ? `<div class="archive-item-worker"><i class="bi bi-person-fill"></i> ${escapeHtml(workerName)}</div>` : ''}
        <div class="archive-item-meta">
          ${personnel ? `<span><i class="bi bi-hash"></i> ${escapeHtml(personnel)}</span>` : ''}
          ${hospital ? `<span><i class="bi bi-hospital"></i> ${escapeHtml(hospital)}</span>` : ''}
          ${shift ? `<span><i class="bi bi-clock"></i> ${escapeHtml(shift)}</span>` : ''}
        </div>
      </div>
      <i class="bi bi-chevron-left archive-item-arrow"></i>
    </button>
  `;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return '';
    const j = new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(dt);
    const t = new Intl.DateTimeFormat('fa-IR', {
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(dt);
    return `${j} — ${t}`;
  } catch {
    return '';
  }
}

// ═══════════════════════════════════════════════════════
// نمایش جزئیات
// ═══════════════════════════════════════════════════════
function openArchiveItem(it) {
  const icon = FORM_ICONS[it.formCode] || { bg:'#f1f5f9', color:'#475569', icon:'bi-file-earmark-text-fill' };
  const workerName = it.data?._patientName || it.data?.patientName || '—';
  const personnel = it.data?._personnelNumber || it.data?.personnelNumber || '';

  const detailRows = Object.entries(it.data || {})
    .filter(([k, v]) => !k.startsWith('_') && v !== '' && v != null && typeof v !== 'object')
    .map(([k, v]) => `
      <tr>
        <td class="detail-key">${escapeHtml(k)}</td>
        <td class="detail-val">${escapeHtml(String(v))}</td>
      </tr>
    `).join('');

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
        <div class="archive-sheet-sub">
          کد فرم: <bdi dir="ltr">${escapeHtml(it.formCode)}</bdi>
        </div>
      </div>
    </div>

    <div class="archive-sheet-meta">
      <div class="archive-meta-item">
        <i class="bi bi-calendar3"></i>
        <span>${escapeHtml(formatDate(it.createdAt))}</span>
      </div>
      ${workerName !== '—' ? `
        <div class="archive-meta-item">
          <i class="bi bi-person-fill"></i>
          <span>${escapeHtml(workerName)}</span>
        </div>` : ''}
      ${personnel ? `
        <div class="archive-meta-item">
          <i class="bi bi-hash"></i>
          <span dir="ltr">${escapeHtml(personnel)}</span>
        </div>` : ''}
    </div>

    <div class="archive-sheet-body">
      <div class="archive-sheet-section-title">اطلاعات ثبت‌شده</div>
      ${detailRows ? `
        <table class="archive-detail-table">
          <tbody>${detailRows}</tbody>
        </table>
      ` : `
        <div class="archive-sheet-empty">داده‌ی نمایش‌دادنی موجود نیست</div>
      `}
    </div>

    <div class="archive-sheet-actions">
      <button class="btn btn-primary w-100" id="archiveReprintBtn">
        <i class="bi bi-printer-fill"></i> چاپ مجدد فرم
      </button>
      <button class="btn btn-light w-100 mt-2" id="archiveCloseBtn">بستن</button>
    </div>
  `;

  const backdrop = document.createElement('div');
  backdrop.className = 'archive-backdrop';
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);

  const close = () => {
    backdrop.classList.add('closing');
    setTimeout(() => backdrop.remove(), 200);
  };

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  sheet.querySelector('#archiveCloseBtn').onclick = close;

  sheet.querySelector('#archiveReprintBtn').onclick = () => {
    toast('قابلیت چاپ مجدد به‌زودی فعال می‌شود', 'info');
    // TODO: رندر مجدد فرم با data
  };
}
