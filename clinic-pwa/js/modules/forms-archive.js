// js/modules/forms-archive.js
import { sb } from '../sb.js';
import { $, toast, escapeHtml, faNum, faToEn, gregorianToJalali, jalaliToGregorian } from '../utils.js';
import { showScreen } from '../ui.js';
import { FORMS } from '../forms/registry.js';

const FORM_NAMES = {
  // اگر در پروژه شما مقادیر واقعی جایگزین شده، همان را نگه دارید
  'BR-FR-HS-38-00': 'گزارش روزانه',
};
const FORM_ICONS = {
  'BR-FR-HS-38-00': { bg:'#dbeafe', color:'#2563eb', icon:'bi-clipboard2-check-fill' },
};

const state = {
  items: [],
  category: 'all',
  query: '',
  dateFrom: '',
  dateTo: '',
  datePreset: 'all',
  loading: false,
  loaded: false,
  patientFilter: null,   // { id, name } - برای فیلتر «همه فرم‌های این فرد»
};

// ⭐ نمایش صفحه بدون وابستگی به ui.js
function showScreenDirect(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen' + name);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
}

// ═══════════════════════════════════════════════════════════
// ورودی اصلی
// ═══════════════════════════════════════════════════════════
export async function openFormsArchive() {
  showScreenDirect('FormsArchive');
  const wrap = $('formsArchiveContent');
  if (!wrap) return;

  // هر بار صفحه باز می‌شود، داده دوباره خوانده می‌شود
  state.loaded = false;
  state.items = [];
  state.patientFilter = null;
  state.query = '';
  state.dateFrom = '';
  state.dateTo = '';
  state.datePreset = 'all';

  wrap.innerHTML = renderShell();
  bindShellEvents();
  await loadAll();
  state.loaded = true;
  renderList();
}

// ═══════════════════════════════════════════════════════════
// Shell (هدر + جستجو + فیلتر + لیست)
// ═══════════════════════════════════════════════════════════
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
        <input type="text" id="archiveQuery" placeholder="نام کارگر، کد پرسنلی، کد ملی، نام فرم..." autocomplete="off">
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
        <button class="archive-filter-btn" id="archiveRefresh">
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
    // برگشت به منوی فرم‌ها
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
      applyAndRender();
    }, 250);
  };
  q.onkeydown = (e) => { if (e.key === 'Enter') q.blur(); };

  clearBtn.onclick = () => {
    q.value = '';
    clearBtn.style.display = 'none';
    state.query = '';
    state.patientFilter = null;
    renderPatientChip();
    applyAndRender();
  };

  wrap.querySelector('#archiveDatePreset').onchange = (e) => {
    state.datePreset = e.target.value;
    const custom = wrap.querySelector('#archiveCustomDate');
    custom.style.display = state.datePreset === 'custom' ? 'flex' : 'none';
    if (state.datePreset !== 'custom') {
      state.dateFrom = '';
      state.dateTo = '';
      applyAndRender();
    }
  };

  wrap.querySelector('#archiveApplyDate').onclick = () => {
    state.dateFrom = wrap.querySelector('#archiveDateFrom').value.trim();
    state.dateTo = wrap.querySelector('#archiveDateTo').value.trim();
    applyAndRender();
  };

  wrap.querySelector('#archiveRefresh').onclick = async () => {
    await loadAll();
    applyAndRender();
  };
}

// ═══════════════════════════════════════════════════════════
// بارگذاری از Supabase  ⭐ اصلی‌ترین اصلاح
// ═══════════════════════════════════════════════════════════
async function loadAll() {
  state.loading = true;
  state.items = [];

  // ─── form_records (با ستون درست: created_by_email) ───
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
        formName: FORM_NAMES[r.form_code] || r.form_code,
        processCode: r.process_code || null,
        patientId: r.patient_id || null,
        visitId: r.visit_id || null,
        examId: r.exam_id || null,
        data: d,
        createdAt: r.created_at,
        createdBy: r.created_by_email || '',
        // ⭐ کشیدن نام کارگر از اسنپ‌شات یا فیلدهای استاندارد قالب
        workerName: d._patientName || d.patientName || d.fullName || '',
        personnelNumber: d._personnelNumber || d.personnelNumber || '',
        nationalCode: d._nationalCode || d.nationalCode || '',
      });
    });
  } catch (e) {
    console.error('[ARCHIVE] form_records failed:', e);
    // ⭐ خطا را در UI هم نشان بده
    const list = $('archiveList');
    if (list) {
      list.innerHTML = `
        <div class="alert alert-danger m-3">
          <i class="bi bi-exclamation-triangle"></i>
          خواندن آرشیو ناموفق بود: ${escapeHtml(e.message || 'خطای نامشخص')}
          <button class="btn btn-sm btn-outline-danger mt-2 d-block" id="archiveRetry">تلاش مجدد</button>
        </div>`;
      const retry = list.querySelector('#archiveRetry');
      if (retry) retry.onclick = async () => { await loadAll(); applyAndRender(); };
    }
  }

  // ─── core_dailyreport (گزارش‌های قدیمی فرم ۳۸) ───
  // اگر می‌خواهید این بخش حذف شود، فقط این بلوک را پاک کنید.
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
        formName: FORM_NAMES['BR-FR-HS-38-00'] || 'گزارش روزانه (قدیمی)',
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
    // خطای این جدول را نادیده بگیر (اختیاری)
    console.warn('[ARCHIVE] core_dailyreport failed:', e);
  }

  state.items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  state.loading = false;
}

// ═══════════════════════════════════════════════════════════
// فیلتر و نرمال‌سازی
// ═══════════════════════════════════════════════════════════
function normalize(s) {
  if (!s) return '';
  return faToEn(String(s))
    .replace(/[يى]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/\u200c/g, '')   // نیم‌فاصله
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
    // فیلتر فرد
    if (state.patientFilter) {
      if (String(it.patientId) !== String(state.patientFilter.id)) return false;
    }

    // فیلتر تاریخ
    if (start || end) {
      const d = new Date(it.createdAt || 0);
      if (start && d < start) return false;
      if (end && d > end) return false;
    }

    // جستجو
    if (nq) {
      const hay = [
        it.workerName,
        it.personnelNumber,
        it.nationalCode,
        it.formName,
        it.formCode,
        it.createdBy,
        // جستجو در مقادیر متنی داخل data
        Object.values(it.data || {}).filter(v => typeof v === 'string').join(' ')
      ].map(normalize).join(' | ');
      if (!hay.includes(nq)) return false;
    }

    return true;
  });
}

function applyAndRender() {
  renderList();
}

// ═══════════════════════════════════════════════════════════
// نمایش لیست
// ═══════════════════════════════════════════════════════════
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

  if (stats) {
    stats.innerHTML = `
      <div class="archive-stat">
        <i class="bi bi-list-check"></i>
        <span>${faNum(filtered.length)} فرم</span>
      </div>`;
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
    const icon = FORM_ICONS[it.formCode] || { bg:'#f1f5f9', color:'#475569', icon:'bi-file-earmark-text-fill' };
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

  // رویداد کلیک روی آیتم‌ها
  list.querySelectorAll('.archive-item').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.id;
      const it = filtered.find(x => String(x.id) === id);
      if (it) openArchiveItem(it);
    };
  });
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

// ═══════════════════════════════════════════════════════════
// جزئیات + چاپ مجدد
// ═══════════════════════════════════════════════════════════
function openArchiveItem(it) {
  const icon = FORM_ICONS[it.formCode] || { bg:'#f1f5f9', color:'#475569', icon:'bi-file-earmark-text-fill' };
  const workerName = it.workerName || '—';

  const detailRows = Object.entries(it.data || {})
    .filter(([k, v]) => !k.startsWith('_') && v !== '' && v != null && typeof v !== 'object')
    .map(([k, v]) => `<tr><td class="detail-key">${escapeHtml(k)}</td><td class="detail-val">${escapeHtml(String(v))}</td></tr>`)
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

// ⭐ چاپ مجدد فرم با استفاده از data ذخیره‌شده
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
  if (!area) { area = document.createElement('div'); area.id = 'formPrintArea'; document.body.appendChild(area); }
  try {
    area.innerHTML = `<div class="form-sheet">${form.render(item.data) || ''}</div>`;
  } catch (e) {
    toast('خطا در ساخت فرم برای چاپ', 'danger');
    return;
  }
  setTimeout(() => {
    window.print();
    setTimeout(() => { area.innerHTML = ''; }, 1500);
  }, 100);
}
