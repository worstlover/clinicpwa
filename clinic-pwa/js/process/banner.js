// js/process/banner.js
// ═══════════════════════════════════════════════════════
// نوار زمینه — نمایش فرآیند و فرم‌های مرتبط
// ═══════════════════════════════════════════════════════
import { escapeHtml } from '../utils.js';
import { findSubprocess, formLabel } from './processes.js';
import { openFormCardModal } from './sample.js';

export function mountProcessBanner(container, contextKey, ctxState = {}) {
  if (!container) return;
  try {
    let sub = null;
    let extraChips = [];

    if (contextKey === 'visit-create') {
      sub = findSubprocess('BR-HS-07-01').subprocess;
      extraChips = [
        { code: 'BR-FR-HS-35-00', note: 'همان ثبت ویزیت' }
      ];
      if (ctxState.isIncident) extraChips.push({ code: 'BR-FR-HS-36-00' });
      if (ctxState.isAdmitted) extraChips.push({ code: 'BR-FR-HS-34-00' });
      if (ctxState.isDispatch || ctxState.isReferral) extraChips.push({ code: 'BR-FR-HS-37-00' });
      if (ctxState.onStep === 5 || ctxState.onStep === 6) extraChips.push({ code: 'BR-FR-HS-40-00' });
    } else if (contextKey === 'visit-detail') {
      sub = findSubprocess('BR-HS-07-01').subprocess;
    } else if (contextKey === 'shift-report') {
      sub = findSubprocess('BR-HS-07-01').subprocess;
    } else if (contextKey === 'occupational') {
      const kindMap = {
        pre_employment: 'BR-HS-10-01',
        periodic:       'BR-HS-10-02',
        return_to_work: 'BR-HS-10-03',
        job_change:     'BR-HS-10-04'
      };
      const spCode = kindMap[ctxState.examKind] || 'BR-HS-10-02';
      sub = findSubprocess(spCode).subprocess;
      extraChips = [
        { code: 'BR-FR-HS-48-00' },
        { code: 'BR-FR-HS-49-00' },
        { code: 'BR-FR-HS-50-00' }
      ];
    } else if (contextKey?.startsWith('form:')) {
      const code = contextKey.slice(5);
      const found = findSubprocessByFormSafe(code);
      if (found) sub = found.subprocess;
    } else {
      return;
    }

    if (!sub) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'process-banner';
    wrapper.innerHTML = `
      <div class="process-banner-header" role="button" tabindex="0">
        <div class="process-banner-summary">
          📋 فرآیند: <strong>${escapeHtml(sub.title)}</strong>
          · فرم نهایی: <strong>${escapeHtml(formLabel(sub.forms[sub.forms.length - 1]))}</strong>
        </div>
        <div class="process-banner-toggle">▼</div>
      </div>
      <div class="process-banner-body" style="display:none;">
        <div class="process-quick-answer">${escapeHtml(sub.quickAnswer)}</div>
        <div class="process-chips">
          ${extraChips.map(c => `
            <button class="process-chip" data-process-form="${escapeHtml(c.code)}">
              ${escapeHtml(formLabel(c.code))}
              ${c.note ? `<span class="chip-note">${escapeHtml(c.note)}</span>` : ''}
            </button>
          `).join('')}
        </div>
        <div class="process-ref-small">مرجع: ${escapeHtml(sub.procedureCode)}</div>
      </div>
    `;

    const header = wrapper.querySelector('.process-banner-header');
    const body = wrapper.querySelector('.process-banner-body');
    const toggle = wrapper.querySelector('.process-banner-toggle');
    let open = false;
    const toggleFn = () => {
      open = !open;
      body.style.display = open ? 'block' : 'none';
      toggle.textContent = open ? '▲' : '▼';
    };
    header.addEventListener('click', toggleFn);
    header.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') toggleFn(); });

    wrapper.querySelectorAll('.process-chip').forEach(chip => {
      chip.onclick = (e) => {
        e.stopPropagation();
        const code = chip.dataset.processForm;
        openFormCardModal(code, ctxState);
      };
    });

    container.innerHTML = '';
    container.appendChild(wrapper);
  } catch (e) {
    console.warn('[banner] mount failed', e);
  }
}

function findSubprocessByFormSafe(code) {
  try {
    const mod = require('./processes.js');
    return mod.findSubprocessByForm(code);
  } catch { return null; }
}