// js/process/guide.js
// ═══════════════════════════════════════════════════════
// صفحه‌ی «راهنمای فرآیندها»
// ═══════════════════════════════════════════════════════
import { sb } from '../sb.js';
import { $, faNum, escapeHtml, gregorianToJalali } from '../utils.js';
import { showScreen } from '../ui.js';
import {
  PROCEDURES, FORMS_CATALOG, findForm, formLabel,
  findSubprocess, normalizeFa
} from './processes.js';
import { openFormCardModal } from './sample.js';

let state = { tab: 'processes', query: '' };

export function openGuide() {
  showScreen('Guide');
  state.tab = 'processes';
  state.query = '';
  render();
}

function render() {
  const c = $('guideContent');
  c.innerHTML = `
    <div class="guide-tabs">
      <button class="guide-tab ${state.tab === 'processes' ? 'active' : ''}" data-tab="processes">
        <i class="bi bi-diagram-3"></i> فرآیندها
      </button>
      <button class="guide-tab ${state.tab === 'forms' ? 'active' : ''}" data-tab="forms">
        <i class="bi bi-file-earmark-text"></i> فرم‌ها
      </button>
    </div>

    <div class="mb-3">
      <input type="text" class="form-control" id="guideSearch"
        placeholder="جستجو در عنوان، مراحل، کد فرم..."
        value="${escapeHtml(state.query)}">
    </div>

    <div id="guideBody"></div>
  `;

  c.querySelectorAll('.guide-tab').forEach(b => {
    b.onclick = () => {
      state.tab = b.dataset.tab;
      render();
    };
  });

  const input = $('guideSearch');
  let timer = null;
  input.addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.query = e.target.value.trim();
      renderBody();
    }, 250);
  });

  renderBody();
  setTimeout(() => input.focus(), 200);
}

function renderBody() {
  const body = $('guideBody');
  if (!body) return;
  if (state.tab === 'processes') {
    body.innerHTML = renderProcesses(state.query);
    bindProcessEvents(body);
  } else {
    body.innerHTML = renderForms(state.query);
    bindFormsEvents(body);
  }
}

// ═══════════════════════════════════════════════════════
// تب فرآیندها
// ═══════════════════════════════════════════════════════
function renderProcesses(query) {
  const q = normalizeFa(query);
  let html = '';

  PROCEDURES.forEach(p => {
    const subs = p.subprocesses.filter(sp => {
      if (!q) return true;
      if (normalizeFa(sp.title).includes(q)) return true;
      if (normalizeFa(sp.code).includes(q)) return true;
      if (sp.forms.some(f => normalizeFa(formLabel(f)).includes(q))) return true;
      if (sp.steps.some(st => normalizeFa(st.text).includes(q))) return true;
      return false;
    });
    if (!subs.length) return;

    html += `<div class="guide-procedure">
      <div class="guide-procedure-title">${escapeHtml(p.title)}</div>
      <div class="guide-procedure-code" dir="ltr">${escapeHtml(p.code)} — تاریخ تهیه اولیه: ${escapeHtml(p.revision)}</div>
    </div>`;

    subs.forEach(sp => {
      html += `
        <div class="guide-subprocess" data-sub-code="${escapeHtml(sp.code)}">
          <div class="guide-sub-header">
            <div style="flex:1;">
              <div style="font-weight:800;">${escapeHtml(sp.title)}</div>
              <div class="small muted" dir="ltr">${escapeHtml(sp.code)}</div>
            </div>
            <div class="guide-sub-toggle">▼</div>
          </div>
          <div class="guide-sub-body" style="display:none;">
            <div class="guide-quick-answer">
              <strong>جواب ۳۰ ثانیه‌ای:</strong>
              ${escapeHtml(sp.quickAnswer)}
            </div>
            <div class="guide-forms-chips">
              ${sp.forms.map(fc => `
                <button class="process-chip" data-form-open="${escapeHtml(fc)}">
                  ${escapeHtml(formLabel(fc))}
                </button>
              `).join('')}
            </div>
            <div class="guide-steps">
              ${sp.steps.map(s => `
                <div class="guide-step" style="padding-right:10px;border-right:3px solid ${s.form ? '#0d6efd' : '#e2e8f0'};">
                  <div class="d-flex justify-content-between">
                    <div><strong>${faNum(s.n)}.</strong> ${escapeHtml(s.text)}</div>
                    <span class="badge-soft primary" style="font-size:0.65rem;">${escapeHtml(s.role)}</span>
                  </div>
                  ${s.condition ? `<div class="small muted mt-1"><i class="bi bi-info-circle"></i> ${escapeHtml(s.condition)}</div>` : ''}
                  ${s.form ? `<button class="process-chip mt-1" data-form-open="${escapeHtml(s.form)}">
                    ${escapeHtml(formLabel(s.form))}
                  </button>` : ''}
                </div>
              `).join('')}
            </div>
            <button class="btn btn-outline-secondary btn-sm mt-3" data-load-records="${escapeHtml(sp.code)}">
              <i class="bi bi-clock-history"></i> سوابق
            </button>
            <div class="guide-records mt-2" id="rec_${escapeHtml(sp.code)}"></div>
            <div class="small muted mt-2" style="font-size:0.72rem;">
              مرجع: ${escapeHtml(p.code)} — تاریخ تهیه اولیه ${escapeHtml(p.revision)}. در بازرسی با نسخه‌ی امضاشده تطبیق دهید.
            </div>
          </div>
        </div>
      `;
    });
  });

  if (!html.trim()) html = '<div class="text-center muted py-4">نتیجه‌ای یافت نشد</div>';
  return html;
}

function bindProcessEvents(body) {
  body.querySelectorAll('.guide-subprocess').forEach(el => {
    const header = el.querySelector('.guide-sub-header');
    const bodyEl = el.querySelector('.guide-sub-body');
    const toggle = el.querySelector('.guide-sub-toggle');
    header.addEventListener('click', () => {
      const open = bodyEl.style.display !== 'none';
      bodyEl.style.display = open ? 'none' : 'block';
      toggle.textContent = open ? '▼' : '▲';
    });
  });

  body.querySelectorAll('[data-form-open]').forEach(b => {
    b.onclick = (e) => { e.stopPropagation(); openFormCardModal(b.dataset.formOpen, {}); };
  });

  body.querySelectorAll('[data-load-records]').forEach(b => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const code = b.dataset.loadRecords;
      const box = document.getElementById('rec_' + code);
      box.innerHTML = '<div class="spinner-border spinner-border-sm text-primary"></div>';
      try {
        const { data, error } = await sb.from('form_records')
          .select('id, form_code, created_at, patient_id')
          .eq('process_code', code)
          .order('created_at', { ascending: false })
          .limit(5);
        if (error) throw error;
        if (!data?.length) {
          box.innerHTML = '<div class="muted small">هنوز سابقه‌ای ذخیره نشده است.</div>';
          return;
        }
        const rows = await Promise.all(data.map(async r => {
          let name = '';
          if (r.patient_id) {
            try {
              const { data: p } = await sb.from('core_patient')
                .select('first_name, last_name').eq('id', r.patient_id).maybeSingle();
              if (p) name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
            } catch {}
          }
          return { ...r, patientName: name };
        }));
        box.innerHTML = rows.map(r => `
          <div class="guide-record">
            <div><strong>${escapeHtml(formLabel(r.form_code))}</strong></div>
            <div class="small muted">${gregorianToJalali(r.created_at)} ${r.patientName ? `— ${escapeHtml(r.patientName)}` : ''}</div>
          </div>
        `).join('');
      } catch (err) {
        console.error(err);
        box.innerHTML = `<div class="text-danger small">خطا: ${escapeHtml(err.message)}</div>`;
      }
    };
  });
}

// ═══════════════════════════════════════════════════════
// تب فرم‌ها
// ═══════════════════════════════════════════════════════
function renderForms(query) {
  const q = normalizeFa(query);
  const list = FORMS_CATALOG.filter(f => {
    if (!q) return true;
    return normalizeFa(f.title).includes(q)
        || normalizeFa(f.code).includes(q)
        || normalizeFa(f.shortCode).includes(q);
  });

  if (!list.length) return '<div class="text-center muted py-4">نتیجه‌ای یافت نشد</div>';

  return list.map(f => {
    const usages = [];
    PROCEDURES.forEach(p => p.subprocesses.forEach(sp => {
      if (sp.forms.includes(f.code)) usages.push(sp.title);
    }));
    return `
      <button class="form-list-item" data-form-card="${escapeHtml(f.code)}">
        <div class="d-flex justify-content-between align-items-center">
          <div class="flex-grow-1 text-end">
            <div style="font-weight:700;font-size:0.95rem;">${escapeHtml(f.title)}</div>
            <div class="small muted" dir="ltr" style="font-size:0.72rem;">${escapeHtml(f.code)}</div>
            ${usages.length ? `<div class="small muted mt-1" style="font-size:0.72rem;">در: ${usages.map(escapeHtml).join('، ')}</div>` : ''}
          </div>
          <i class="bi bi-chevron-left" style="font-size:1.4rem;color:#94a3b8;"></i>
        </div>
      </button>
    `;
  }).join('');
}

function bindFormsEvents(body) {
  body.querySelectorAll('[data-form-card]').forEach(b => {
    b.onclick = () => openFormCardModal(b.dataset.formCard, {});
  });
}