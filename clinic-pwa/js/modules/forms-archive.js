// js/modules/forms-archive.js
import { sb } from '../sb.js';
import { $, toast, escapeHtml } from '../utils.js';
import { showScreen } from '../ui.js';
import { FORMS } from '../forms/registry.js'; // ⭐ برای دسترسی به render فرم‌ها

const FORM_NAMES = { /* ... مثل قبل ... */ };
const FORM_ICONS = { /* ... مثل قبل ... */ };
const CATEGORIES = [ /* ... مثل قبل ... */ ];

// ⭐ تابع نمایش صفحه بدون وابستگی به ui.js
function showScreenDirect(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen' + name);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
}

const state = {
  items: [], category: 'all', query: '', dateFrom: '', dateTo: '',
  datePreset: 'all', loading: false, loaded: false,
};

export async function openFormsArchive() {
  showScreenDirect('FormsArchive');
  const wrap = $('formsArchiveContent');
  if (!wrap) return;

  // ⭐ هر بار صفحه باز می‌شه، دیتا دوباره خونده می‌شه تا فرم‌های جدید هم دیده بشن
  state.loaded = false; 
  wrap.innerHTML = renderShell(true);
  bindShellEvents();
  await loadAll();
  state.loaded = true;
  renderList();
}

// ... بقیه‌ی توابع (renderShell, renderSkeleton, bindShellEvents, ...)

// ⭐ تابع loadAll: فقط data رو می‌خونه، نیازی به patient_id نیست چون data شامل _patientName هست
async function loadAll() {
  state.loading = true;
  state.items = [];
  try {
    const { data, error } = await sb.from('form_records')
      .select('id, form_code, data, created_at, created_by')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    (data || []).forEach(r => {
      state.items.push({
        id: r.id, source: 'form_records', formCode: r.form_code,
        formName: FORM_NAMES[r.form_code] || r.form_code,
        data: r.data || {}, createdAt: r.created_at, createdBy: r.created_by,
      });
    });
  } catch (e) { console.warn('[ARCHIVE] form_records failed:', e); }

  try {
    const { data, error } = await sb.from('core_dailyreport')
      .select('id, date, shift_type, created_at')
      .order('date', { ascending: false }).limit(300);
    if (error) throw error;
    (data || []).forEach(r => {
      state.items.push({
        id: `daily-${r.id}`, source: 'core_dailyreport',
        formCode: 'BR-FR-HS-38-00', formName: FORM_NAMES['BR-FR-HS-38-00'],
        data: { date: r.date, shiftType: r.shift_type },
        createdAt: r.created_at || r.date,
      });
    });
  } catch (e) { console.warn('[ARCHIVE] core_dailyreport failed:', e); }

  state.items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  state.loading = false;
}

// ⭐ تابع openArchiveItem: نمایش جزئیات + دکمه چاپ مجدد
function openArchiveItem(it) {
  const icon = FORM_ICONS[it.formCode] || { bg:'#f1f5f9', color:'#475569', icon:'bi-file-earmark-text-fill' };
  const workerName = it.data?._patientName || it.data?.patientName || '—';
  const detailRows = Object.entries(it.data || {})
    .filter(([k, v]) => !k.startsWith('_') && v !== '' && v != null && typeof v !== 'object')
    .map(([k, v]) => `<tr><td class="detail-key">${escapeHtml(k)}</td><td class="detail-val">${escapeHtml(String(v))}</td></tr>`)
    .join('');

  const sheet = document.createElement('div');
  sheet.className = 'archive-sheet';
  sheet.innerHTML = `
    <div class="archive-sheet-handle"></div>
    <div class="archive-sheet-head">
      <div class="archive-sheet-icon" style="background:${icon.bg};color:${icon.color};"><i class="bi ${icon.icon}"></i></div>
      <div>
        <div class="archive-sheet-title">${escapeHtml(it.formName)}</div>
        <div class="archive-sheet-sub">کد فرم: <bdi dir="ltr">${escapeHtml(it.formCode)}</bdi></div>
      </div>
    </div>
    <div class="archive-sheet-meta">
      <div class="archive-meta-item"><i class="bi bi-calendar3"></i><span>${escapeHtml(formatDate(it.createdAt))}</span></div>
      ${workerName !== '—' ? `<div class="archive-meta-item"><i class="bi bi-person-fill"></i><span>${escapeHtml(workerName)}</span></div>` : ''}
    </div>
    <div class="archive-sheet-body">
      <div class="archive-sheet-section-title">اطلاعات ثبت‌شده</div>
      ${detailRows ? `<table class="archive-detail-table"><tbody>${detailRows}</tbody></table>` : '<div class="archive-sheet-empty">داده‌ی نمایش‌دادنی موجود نیست</div>'}
    </div>
    <div class="archive-sheet-actions">
      <button class="btn btn-primary w-100" id="archiveReprintBtn"><i class="bi bi-printer-fill"></i> چاپ مجدد فرم</button>
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
  sheet.querySelector('#archiveReprintBtn').onclick = () => {
    close();
    reprintForm(it); // ⭐ فراخوانی تابع چاپ مجدد
  };
}

// ⭐ تابع جدید: چاپ مجدد فرم با استفاده از data ذخیره‌شده
async function reprintForm(item) {
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
    toast('خطا در ساخت فرم برای چاپ', 'danger'); return;
  }
  setTimeout(() => {
    window.print();
    setTimeout(() => { area.innerHTML = ''; }, 1500);
  }, 100);
}
