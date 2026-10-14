// js/process/sample.js
// ═══════════════════════════════════════════════════════
// مودال «کارت فرم» — نمونه‌ی خام، چاپ، دانلود، پر کردن
// ═══════════════════════════════════════════════════════
import { escapeHtml, toast } from '../utils.js';
import { FORMS } from '../forms/registry.js';
import { findForm, formLabel, findSubprocessByForm } from './processes.js';
import { openForm } from '../forms/engine.js';

export async function openFormCardModal(code, ctxState = {}) {
  const existing = document.getElementById('formCardModal');
  if (existing) existing.remove();

  const cat = findForm(code);
  if (!cat) return;

  const implemented = FORMS[code];
  const subInfo = findSubprocessByForm(code);

  // بررسی وجود فایل اصلی
  let originalOk = false;
  if (cat.original) {
    try {
      const res = await fetch(cat.original, { method: 'HEAD' });
      originalOk = res.ok;
    } catch { originalOk = false; }
  }

  const modalHtml = `
    <div class="modal fade" id="formCardModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
        <div class="modal-content">
          <div class="modal-header" style="background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff;">
            <div style="flex:1;">
              <div style="font-weight:800;font-size:1rem;">${escapeHtml(cat.title)}</div>
              <div style="font-size:0.75rem;opacity:0.9;" dir="ltr">${escapeHtml(cat.code)}</div>
            </div>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            ${subInfo ? `<div class="alert alert-light small mb-3" style="border:1px solid #e2e8f0;">
              <i class="bi bi-diagram-3"></i>
              این فرم در <strong>${escapeHtml(subInfo.subprocess.title)}</strong> پر می‌شود.
            </div>` : ''}

            ${implemented ? `
              <div class="form-preview-wrap" style="max-height:400px;overflow:auto;">
                <div class="form-preview-scale" id="samplePreviewScale" style="width:745px;padding:20px 24px;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.08);">
                  <div class="form-sheet" id="sampleSheet"></div>
                </div>
              </div>
            ` : cat.implemented === 'digital' ? `
              <div class="alert alert-info text-center">
                <i class="bi bi-info-circle" style="font-size:2rem;"></i>
                <div class="mt-2">ثبت ویزیت در برنامه جایگزین این فرم است.</div>
              </div>
            ` : `
              <div class="alert alert-warning text-center">
                <i class="bi bi-hourglass" style="font-size:2rem;"></i>
                <div class="mt-2">نمونه‌ی خام این فرم هنوز در برنامه نیست.</div>
              </div>
            `}
          </div>
          <div class="modal-footer" style="flex-wrap:wrap;gap:6px;">
            ${implemented ? `
              <button class="btn btn-primary btn-sm" id="samplePrintBtn">
                <i class="bi bi-printer"></i> چاپ نمونه‌ی خام
              </button>
            ` : ''}
            ${originalOk ? `
              <a class="btn btn-outline-secondary btn-sm" href="${escapeHtml(cat.original)}" download>
                <i class="bi bi-download"></i> دانلود فایل اصلی
              </a>
            ` : ''}
            ${implemented ? `
              <button class="btn btn-success btn-sm" id="sampleFillBtn">
                <i class="bi bi-pencil"></i> پر کردن این فرم
              </button>
            ` : ''}
            ${cat.implemented === 'digital' ? `
              <button class="btn btn-success btn-sm" id="sampleFillBtn2">
                <i class="bi bi-clipboard2-pulse"></i> باز کردن ثبت ویزیت
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  const modalEl = document.getElementById('formCardModal');
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());

  if (implemented) {
    const sheet = document.getElementById('sampleSheet');
    try {
      sheet.innerHTML = implemented.render({}) || '';
    } catch (e) {
      console.error('sample render failed', e);
      sheet.innerHTML = `<div class="text-danger">خطا: ${escapeHtml(e.message)}</div>`;
    }

    const scaleEl = document.getElementById('samplePreviewScale');
    const wrap = modalEl.querySelector('.form-preview-wrap');
    if (wrap && scaleEl) {
      const w = wrap.clientWidth - 16;
      const scale = Math.min(1, w / 745);
      scaleEl.style.transform = `scale(${scale})`;
      scaleEl.style.transformOrigin = 'top center';
      setTimeout(() => {
        wrap.style.height = (scaleEl.scrollHeight * scale + 24) + 'px';
      }, 50);
    }

    document.getElementById('samplePrintBtn').onclick = () => {
      let area = document.getElementById('formPrintArea');
      if (!area) {
        area = document.createElement('div');
        area.id = 'formPrintArea';
        document.body.appendChild(area);
      }
      try {
        area.innerHTML = `<div class="form-sheet">${implemented.render({}) || ''}</div>`;
        setTimeout(() => {
          window.print();
          setTimeout(() => { area.innerHTML = ''; }, 1500);
        }, 100);
      } catch (e) {
        toast('خطا در ساخت نمونه', 'danger');
      }
    };

    document.getElementById('sampleFillBtn').onclick = () => {
      modal.hide();
      const code = cat.code;
      if (['BR-FR-HS-48-00','BR-FR-HS-49-00','BR-FR-HS-50-00'].includes(code)) {
        if (ctxState.examId && ctxState.patientId) {
          setTimeout(() => openForm(code, { examId: ctxState.examId, patientId: ctxState.patientId }), 300);
        } else {
          toast('ابتدا فرد و معاینه را انتخاب کنید', 'info');
          setTimeout(() => {
            import('../ui.js').then(m => m.showScreen('Forms'));
            setTimeout(() => import('./guide.js').then(m => m.openGuide()), 200);
          }, 300);
        }
      } else if (['BR-FR-HS-34-00','BR-FR-HS-36-00','BR-FR-HS-37-00'].includes(code)) {
        if (ctxState.visitId && ctxState.patientId) {
          setTimeout(() => openForm(code, { visitId: ctxState.visitId, patientId: ctxState.patientId }), 300);
        } else {
          toast('ابتدا ویزیت را انتخاب کنید', 'info');
          setTimeout(() => {
            import('../ui.js').then(m => m.showScreen('Forms'));
            setTimeout(() => import('./guide.js').then(m => m.openGuide()), 200);
          }, 300);
        }
      } else if (['BR-FR-HS-38-00','BR-FR-HS-39-00'].includes(code)) {
        setTimeout(() => openForm(code, {}), 300);
      }
    };
  }

  const fillDigital = document.getElementById('sampleFillBtn2');
  if (fillDigital) {
    fillDigital.onclick = async () => {
      modal.hide();
      const { openVisits } = await import('../modules/visit/index.js');
      const { openCreate } = await import('../modules/visit/create.js');
      await openVisits();
      setTimeout(() => openCreate(), 200);
    };
  }
}