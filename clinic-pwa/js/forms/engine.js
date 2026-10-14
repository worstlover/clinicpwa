// js/forms/engine.js
// ═══════════════════════════════════════════════════════
// موتور فرم‌ها: صفحه‌ی لیست فرم‌ها + فرم‌ساز + پیش‌نمایش + چاپ + ذخیره‌ی آرشیو
// پشتیبانی از source: 'exam' | 'visit' | 'shift' | 'none'
// ═══════════════════════════════════════════════════════
import { sb } from '../sb.js';
import { $, faNum, faToEn, escapeHtml, todayJalali, gregorianToJalali, toast, beep } from '../utils.js';
import { showScreen } from '../ui.js';
import { FORMS, listForms, resolveProcessCode } from './registry.js';
import {
  savePatientExtra, saveVisitExtra, saveExamExtra,
  loadPatientExtra, loadExamExtra, loadVisitExtra
} from '../modules/extra-data.js';

// ═══════════════════════════════════════════════════════
// state
// ═══════════════════════════════════════════════════════
let state = {
  view: 'list',            // 'list' | 'picker-exam' | 'picker-visit' | 'form'
  formCode: null,
  ctx: {},
  data: {},
  meta: {},
  dirty: false
};

// ═══════════════════════════════════════════════════════
// نقطه‌ی ورود از منو
// ═══════════════════════════════════════════════════════
export function openForms() {
  showScreen('Forms');
  state.view = 'list';
  state.formCode = null;
  state.ctx = {};
  state.data = {};
  state.meta = {};
  renderListScreen();
}

// ═══════════════════════════════════════════════════════
// باز کردن مستقیم یک فرم با context (از detail.js یا occupational.js)
// ═══════════════════════════════════════════════════════
export async function openForm(code, ctx = {}) {
  const form = FORMS[code];
  if (!form) {
    toast('فرم ناشناخته: ' + code, 'danger');
    return;
  }
  showScreen('Forms');
  state.view = 'form';
  state.formCode = code;
  state.ctx = ctx || {};
  state.dirty = false;

  const c = $('formsContent');
  c.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

  try {
    let loadResult = { data: {}, meta: {} };
    if (typeof form.load === 'function') {
      try {
        loadResult = (await form.load(state.ctx)) || { data: {}, meta: {} };
      } catch (e) {
        console.warn('[form] load failed:', e);
        toast('خطا در بارگذاری اطلاعات فرم: ' + (e.message || ''), 'warning');
      }
    }
    state.data = loadResult.data || {};
    state.meta = loadResult.meta || {};
    renderFormScreen();
  } catch (e) {
    console.error(e);
    c.innerHTML = `<div class="alert alert-danger">خطا: ${escapeHtml(e.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════
// صفحه‌ی لیست فرم‌ها
// ═══════════════════════════════════════════════════════
function renderListScreen() {
  const c = $('formsContent');
  const forms = listForms();

  const sourceLabel = {
    exam:  'طب کار',
    visit: 'ویزیت',
    shift: 'گزارش شیفت',
    none:  'بدون نیاز به انتخاب فرد'
  };

  c.innerHTML = `
    <div class="card">
      <div class="card-head" style="background:linear-gradient(135deg,#0ea5e9,#0284c7);">
        <i class="bi bi-file-earmark-text"></i> فرم‌ها
      </div>
      <div class="card-body">
        <p class="small muted mb-0">
          فرم مورد نظر را انتخاب کنید. پس از انتخاب، فرد/ویزیت/شیفت را تعیین می‌کنید.
        </p>
      </div>
    </div>
    <div class="mt-3">
      ${forms.map(f => `
        <button type="button" class="form-list-item" data-pick-form="${f.code}">
          <div class="d-flex justify-content-between align-items-center">
            <div class="flex-grow-1 text-end">
              <div style="font-weight:700;font-size:0.95rem;">${escapeHtml(f.title)}</div>
              <div class="small muted" dir="ltr" style="font-size:0.72rem;">
                ${escapeHtml(f.code)}
                <span class="badge-soft primary" style="font-size:0.65rem;margin-right:6px;">${escapeHtml(sourceLabel[f.source] || f.source)}</span>
              </div>
            </div>
            <i class="bi bi-chevron-left" style="font-size:1.4rem;color:#94a3b8;"></i>
          </div>
        </button>
      `).join('')}
    </div>
  `;

  if (!document.getElementById('formListStyle')) {
    const style = document.createElement('style');
    style.id = 'formListStyle';
    style.textContent = `
      .form-list-item {
        display: block; width: 100%; text-align: right;
        background: #fff; border: 1.5px solid #e2e8f0;
        border-radius: 12px; padding: 14px 16px;
        margin-bottom: 8px; cursor: pointer;
        font-family: inherit; transition: all 0.15s;
      }
      .form-list-item:active { transform: scale(0.98); }
      .form-list-item:hover { background: #f8fafc; }
    `;
    document.head.appendChild(style);
  }

  c.querySelectorAll('[data-pick-form]').forEach(b => {
    b.onclick = () => openFormPicker(b.dataset.pickForm);
  });
}

// ═══════════════════════════════════════════════════════
// انتخاب منبع (exam / visit / shift / none)
// ═══════════════════════════════════════════════════════
async function openFormPicker(code) {
  const form = FORMS[code];
  if (!form) return;

  if (form.source === 'none') {
    return openForm(code, {});
  }
  if (form.source === 'shift') {
    return openForm(code, {});
  }
  if (form.source === 'exam') {
    state.view = 'picker-exam';
    state.formCode = code;
    return renderExamPicker(code);
  }
  if (form.source === 'visit') {
    state.view = 'picker-visit';
    state.formCode = code;
    return renderVisitPicker(code);
  }
  toast('منبع ناشناخته', 'warning');
}

// ═══════════════════════════════════════════════════════
// Picker: انتخاب فرد + آخرین معاینه (source: exam)
// ═══════════════════════════════════════════════════════
async function renderExamPicker(code) {
  const c = $('formsContent');
  c.innerHTML = `
    <div class="card">
      <div class="card-head">
        <i class="bi bi-person-search"></i> انتخاب فرد برای فرم ${escapeHtml(code)}
      </div>
      <div class="card-body">
        <input type="text" class="form-control mb-3" id="formPickerSearch"
          placeholder="نام، کد ملی یا شماره پرسنلی...">
        <div id="formPickerResults" class="text-center muted small py-3">
          حداقل ۲ حرف تایپ کنید
        </div>
      </div>
    </div>
    <button class="btn btn-outline-secondary w-100 mt-3" id="formPickerBack">
      <i class="bi bi-arrow-right"></i> بازگشت
    </button>
  `;

  $('formPickerBack').onclick = () => { state.view = 'list'; renderListScreen(); };

  const input = $('formPickerSearch');
  let timer = null;
  input.addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => searchExams(e.target.value.trim()), 350);
  });
  setTimeout(() => input.focus(), 200);
}

async function searchExams(q) {
  const box = $('formPickerResults');
  if (!box) return;
  q = faToEn(q);
  if (!q || q.length < 2) {
    box.innerHTML = 'حداقل ۲ حرف تایپ کنید';
    return;
  }
  box.innerHTML = '<div class="spinner-border spinner-border-sm text-primary"></div>';

  try {
    const { data: patients, error: pErr } = await sb.from('core_patient')
      .select('id, first_name, last_name, national_code, personnel_number')
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,national_code.ilike.%${q}%,personnel_number.ilike.%${q}%`)
      .limit(20);
    if (pErr) throw pErr;

    if (!patients?.length) {
      box.innerHTML = '<div class="muted small py-3">فردی یافت نشد</div>';
      return;
    }

    const ids = patients.map(p => p.id);
    const { data: exams } = await sb.from('lab_results_periodicexamination')
      .select('id, exam_date, patient_id, final_opinion_text')
      .in('patient_id', ids)
      .order('exam_date', { ascending: false });

    const latestByPatient = {};
    (exams || []).forEach(e => {
      if (!latestByPatient[e.patient_id]) latestByPatient[e.patient_id] = e;
    });

    box.innerHTML = patients.map(p => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
      const latest = latestByPatient[p.id];
      const dateStr = latest?.exam_date ? gregorianToJalali(latest.exam_date) : '—';
      const opinion = latest?.final_opinion_text || '—';
      return `
        <button type="button" class="btn btn-light w-100 text-end mb-2 py-2" data-pick-exam="${latest?.id || ''}" data-pick-patient="${p.id}"
          style="border:1px solid #e2e8f0;border-radius:10px;">
          <div style="font-weight:700;">${escapeHtml(name)}</div>
          <div class="small muted">
            ${p.national_code ? `<span dir="ltr">${escapeHtml(p.national_code)}</span> · ` : ''}
            آخرین معاینه: ${dateStr} — ${escapeHtml(opinion)}
          </div>
        </button>
      `;
    }).join('');

    box.querySelectorAll('[data-pick-exam]').forEach(b => {
      b.onclick = () => {
        const examId = b.dataset.pickExam;
        const patientId = parseInt(b.dataset.pickPatient);
        if (!examId) {
          toast('برای این فرد معاینه‌ای ثبت نشده', 'warning');
          return;
        }
        openForm(state.formCode, { examId: parseInt(examId), patientId });
      };
    });
  } catch (e) {
    console.error(e);
    box.innerHTML = `<div class="text-danger small py-3">خطا: ${escapeHtml(e.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════
// Picker: انتخاب فرد + ویزیت (source: visit)
// ═══════════════════════════════════════════════════════
async function renderVisitPicker(code) {
  const c = $('formsContent');
  c.innerHTML = `
    <div class="card">
      <div class="card-head">
        <i class="bi bi-person-search"></i> انتخاب ویزیت برای فرم ${escapeHtml(code)}
      </div>
      <div class="card-body">
        <input type="text" class="form-control mb-3" id="formVisitSearch"
          placeholder="نام، کد ملی یا شماره پرسنلی...">
        <div id="formVisitResults" class="text-center muted small py-3">
          حداقل ۲ حرف تایپ کنید
        </div>
      </div>
    </div>
    <button class="btn btn-outline-secondary w-100 mt-3" id="formVisitBack">
      <i class="bi bi-arrow-right"></i> بازگشت
    </button>
  `;

  $('formVisitBack').onclick = () => { state.view = 'list'; renderListScreen(); };

  const input = $('formVisitSearch');
  let timer = null;
  input.addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => searchVisits(e.target.value.trim()), 350);
  });
  setTimeout(() => input.focus(), 200);
}

async function searchVisits(q) {
  const box = $('formVisitResults');
  if (!box) return;
  q = faToEn(q);
  if (!q || q.length < 2) {
    box.innerHTML = 'حداقل ۲ حرف تایپ کنید';
    return;
  }
  box.innerHTML = '<div class="spinner-border spinner-border-sm text-primary"></div>';

  try {
    const { data: patients, error: pErr } = await sb.from('core_patient')
      .select('id, first_name, last_name, national_code, personnel_number')
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,national_code.ilike.%${q}%,personnel_number.ilike.%${q}%`)
      .limit(20);
    if (pErr) throw pErr;

    if (!patients?.length) {
      box.innerHTML = '<div class="muted small py-3">فردی یافت نشد</div>';
      return;
    }

    const ids = patients.map(p => p.id);
    const { data: visits } = await sb.from('visits_visit')
      .select(`id, visit_date, patient_id, status,
        reason:visits_reasonforvisit(name),
        result:visits_treatmentresult(name)`)
      .in('patient_id', ids)
      .order('visit_date', { ascending: false })
      .limit(200);

    const visitsByPatient = {};
    (visits || []).forEach(v => {
      if (!visitsByPatient[v.patient_id]) visitsByPatient[v.patient_id] = [];
      visitsByPatient[v.patient_id].push(v);
    });

    let html = '';
    patients.forEach(p => {
      const list = (visitsByPatient[p.id] || []).slice(0, 5);
      if (!list.length) return;
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
      html += `<div style="margin-bottom:10px;">
        <div style="font-weight:700;font-size:0.92rem;color:#0d6efd;margin-bottom:4px;">${escapeHtml(name)}</div>
        ${list.map(v => {
          const jd = gregorianToJalali(v.visit_date);
          const status = v.status === 'completed' ? '✓' : '⏳';
          return `
            <button type="button" class="btn btn-light w-100 text-end mb-1 py-2" data-pick-visit="${v.id}" data-pick-patient="${p.id}"
              style="border:1px solid #e2e8f0;border-radius:10px;">
              <div><span style="font-weight:700;">${jd}</span> ${status}</div>
              <div class="small muted">${escapeHtml(v.reason?.name || '—')} — ${escapeHtml(v.result?.name || '—')}</div>
            </button>`;
        }).join('')}
      </div>`;
    });

    if (!html) {
      box.innerHTML = '<div class="muted small py-3">ویزیتی یافت نشد</div>';
      return;
    }
    box.innerHTML = html;

    box.querySelectorAll('[data-pick-visit]').forEach(b => {
      b.onclick = () => {
        openForm(state.formCode, {
          visitId: parseInt(b.dataset.pickVisit),
          patientId: parseInt(b.dataset.pickPatient)
        });
      };
    });
  } catch (e) {
    console.error(e);
    box.innerHTML = `<div class="text-danger small py-3">خطا: ${escapeHtml(e.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════
// صفحه‌ی فرم (ویرایش + پیش‌نمایش)
// ═══════════════════════════════════════════════════════
function renderFormScreen() {
  const form = FORMS[state.formCode];
  if (!form) return;

  const c = $('formsContent');
  const editables = (form.fields || []).filter(f => f.editable);

  c.innerHTML = `
    <div class="card">
      <div class="card-head" style="background:linear-gradient(135deg,#0ea5e9,#0284c7);">
        <i class="bi bi-pencil-square"></i> ${escapeHtml(form.title)}
      </div>
      <div class="card-body">
        <div class="small muted mb-2" dir="ltr">${escapeHtml(form.code)}</div>

        ${editables.length ? `
          <div class="row g-2">
            ${editables.map(f => renderFieldInput(f)).join('')}
          </div>
        ` : '<div class="muted small">این فرم فیلد ویرایشی ندارد.</div>'}
      </div>
    </div>

    <div class="card mt-3">
      <div class="card-head"><i class="bi bi-eye"></i> پیش‌نمایش فرم</div>
      <div class="card-body p-0">
        <div class="form-preview-wrap">
          <div class="form-preview-scale" id="formPreviewScale">
            <div class="form-sheet" id="formPreviewSheet"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="d-grid gap-2 mt-3 mb-5">
      <button class="btn btn-primary btn-lg py-3" id="formPrintBtn">
        <i class="bi bi-printer"></i> چاپ / ذخیره PDF
      </button>
      <button class="btn btn-success btn-lg py-3" id="formArchiveBtn">
        <i class="bi bi-archive"></i> ذخیره در آرشیو
      </button>
      <button class="btn btn-outline-secondary" id="formBackBtn">
        <i class="bi bi-arrow-right"></i> بازگشت
      </button>
    </div>
  `;

  // بایند فیلدها
  editables.forEach(f => {
    const el = document.getElementById('fld_' + f.key);
    if (!el) return;
    const handler = () => {
      state.data[f.key] = (el.type === 'checkbox') ? el.checked : el.value;
      state.dirty = true;
      updatePreview();
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });

  // دکمه‌ها
  $('formPrintBtn').onclick = () => doPrint(true);
  $('formArchiveBtn').onclick = () => doArchive(false);
  $('formBackBtn').onclick = () => {
    if (state.dirty && !confirm('تغییرات ذخیره نشده است. بازگشت؟')) return;
    state.view = 'list';
    renderListScreen();
  };

  updatePreview();
  requestAnimationFrame(scalePreview);
  window.addEventListener('resize', scalePreview, { once: true });
}

function renderFieldInput(f) {
  const v = state.data[f.key] ?? '';
  const common = `id="fld_${f.key}" class="form-control"`;
  let input = '';
  if (f.type === 'textarea') {
    input = `<textarea ${common} rows="${f.rows || 2}">${escapeHtml(String(v))}</textarea>`;
  } else if (f.type === 'checkbox') {
    input = `<div class="form-check"><input type="checkbox" id="fld_${f.key}" class="form-check-input" ${v ? 'checked' : ''}>
             <label class="form-check-label small" for="fld_${f.key}">${escapeHtml(f.label)}</label></div>`;
    return `<div class="col-12 col-md-${f.col || 6}">${input}</div>`;
  } else if (f.type === 'select') {
    input = `<select ${common}>${(f.options || []).map(o =>
      `<option value="${escapeHtml(o.value)}" ${String(v) === String(o.value) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
    ).join('')}</select>`;
  } else {
    input = `<input type="${f.type || 'text'}" ${common} value="${escapeHtml(String(v))}" ${f.dir ? `dir="${f.dir}"` : ''}>`;
  }
  return `
    <div class="col-12 col-md-${f.col || 6}">
      <label class="form-label small">${escapeHtml(f.label)}</label>
      ${input}
    </div>
  `;
}

function updatePreview() {
  const form = FORMS[state.formCode];
  if (!form) return;
  const sheet = $('formPreviewSheet');
  if (!sheet) return;
  try {
    sheet.innerHTML = form.render(state.data) || '';
  } catch (e) {
    console.error('[form] render failed:', e);
    sheet.innerHTML = `<div class="text-danger">خطا در پیش‌نمایش: ${escapeHtml(e.message)}</div>`;
  }
}

function scalePreview() {
  const wrap = document.querySelector('.form-preview-wrap');
  const scaleEl = $('formPreviewScale');
  if (!wrap || !scaleEl) return;
  const wrapW = wrap.clientWidth - 16;
  const scale = Math.min(1, wrapW / 745);
  scaleEl.style.transform = `scale(${scale})`;
  const sheetH = scaleEl.scrollHeight || 1050;
  wrap.style.height = (sheetH * scale + 24) + 'px';
}

// ═══════════════════════════════════════════════════════
// چاپ
// ═══════════════════════════════════════════════════════
async function doPrint(autoArchive) {
  const form = FORMS[state.formCode];
  if (!form) return;

  if (autoArchive && state.dirty) {
    try { await doArchive(true); } catch (e) { console.warn('archive before print failed', e); }
  }

  let area = document.getElementById('formPrintArea');
  if (!area) {
    area = document.createElement('div');
    area.id = 'formPrintArea';
    document.body.appendChild(area);
  }
  try {
    area.innerHTML = `<div class="form-sheet">${form.render(state.data) || ''}</div>`;
  } catch (e) {
    toast('خطا در ساخت فرم', 'danger');
    return;
  }
  setTimeout(() => {
    window.print();
    setTimeout(() => { area.innerHTML = ''; }, 1500);
  }, 100);
}

// ═══════════════════════════════════════════════════════
// آرشیو
// ═══════════════════════════════════════════════════════
async function doArchive(silent = false) {
  const form = FORMS[state.formCode];
  if (!form) return;

  let email = null;
  try {
    const { data: { user } } = await sb.auth.getUser();
    email = user?.email || null;
  } catch {}

  // ⭐️ اگر فرم saveArchive سفارشی دارد (مثل ۳۸)، همان را صدا بزن
  if (typeof form.saveArchive === 'function') {
    try {
      await form.saveArchive(state.data, state.ctx);
      if (!silent) toast('✅ گزارش در سیستم ذخیره شد', 'success');
      beep();
    } catch (e) {
      console.error('[form38] saveArchive failed:', e);
      if (!silent) toast('ذخیره در سیستم ناموفق بود — فقط در آرشیو ذخیره می‌شود', 'warning');
    }
  }

  // process_code
  let examExtra = null;
  if (state.ctx.examId) {
    try {
      const { data } = await loadExamExtra(state.ctx.examId);
      examExtra = data;
    } catch {}
  }
  const processCode = resolveProcessCode(state.formCode, examExtra);

  // ⭐️ persist به جداول کمکی
  const persistGroups = {};
  (form.fields || []).forEach(f => {
    if (!f.persist) return;
    const val = state.data[f.key];
    if (val === undefined || val === null || val === '') return;
    const t = f.persist.table;
    if (!persistGroups[t]) persistGroups[t] = {};
    persistGroups[t][f.persist.column] = val;
  });

  try {
    if (persistGroups.patient_extra && state.ctx.patientId) {
      await savePatientExtra(state.ctx.patientId, persistGroups.patient_extra);
    }
    if (persistGroups.visit_extra && state.ctx.visitId) {
      await saveVisitExtra(state.ctx.visitId, persistGroups.visit_extra);
    }
    if (persistGroups.exam_extra && state.ctx.examId) {
      await saveExamExtra(state.ctx.examId, persistGroups.exam_extra);
    }
  } catch (e) {
    console.warn('[form] persist failed:', e);
  }

  // ⭐️ ذخیره در form_records
  try {
    const baseQuery = sb.from('form_records')
      .select('id, data')
      .eq('form_code', state.formCode)
      .order('created_at', { ascending: false })
      .limit(1);
    if (state.ctx.patientId) baseQuery.eq('patient_id', state.ctx.patientId);
    if (state.ctx.examId) baseQuery.eq('exam_id', state.ctx.examId);
    if (state.ctx.visitId) baseQuery.eq('visit_id', state.ctx.visitId);

    const { data: existing } = await baseQuery.maybeSingle();

    const sameData = existing &&
      JSON.stringify(existing.data || {}) === JSON.stringify(state.data || {});

    if (sameData) {
      if (!silent) toast('اطلاعات تغییری نکرده — همان ردیف قبلی', 'info');
      state.dirty = false;
      return;
    }

    const { error } = await sb.from('form_records').insert({
      form_code: state.formCode,
      process_code: processCode,
      patient_id: state.ctx.patientId || null,
      exam_id: state.ctx.examId || null,
      visit_id: state.ctx.visitId || null,
      data: state.data,
      created_by_email: email
    });
    if (error) throw error;

    if (!silent) toast('✅ فرم در آرشیو ذخیره شد', 'success');
    beep();
    state.dirty = false;
  } catch (e) {
    console.error('[form] archive failed:', e);
    toast('ذخیره در آرشیو ناموفق بود', 'warning');
  }
}
