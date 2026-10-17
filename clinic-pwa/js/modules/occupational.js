// js/modules/occupational.js
import { sb } from '../sb.js';
import { $, toast, escapeHtml, faNum, gregorianToJalali } from '../utils.js';
import { showScreen } from '../ui.js';

const state = {
  exams: [],
  loading: false,
  filterKind: 'all',   // فیلتر نوع معاینه
  filterStatus: 'all', // فیلتر نتیجه معاینه
  query: ''
};

export async function openOccupational() {
  showScreen('Occupational');
  const wrap = $('occupationalContent');
  if (!wrap) return;

  wrap.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="mb-0"><i class="bi bi-clipboard2-pulse text-primary"></i> مدیریت معاینات طب کار</h4>
    </div>

    <!-- ⭐ بخش فیلترها -->
    <div class="card mb-3 border-0 shadow-sm">
      <div class="card-body p-3">
        <div class="row g-2">
          <div class="col-12 col-md-4">
            <div class="input-group">
              <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
              <input type="text" class="form-control" id="occSearch" placeholder="جستجوی نام یا کد ملی...">
            </div>
          </div>
          <div class="col-6 col-md-3">
            <select class="form-select" id="occFilterKind">
              <option value="all">همه انواع معاینه</option>
              <option value="pre_employment">بدو استخدام</option>
              <option value="periodic">دوره‌ای</option>
              <option value="return_to_work">بازگشت به کار</option>
              <option value="job_change">جابجایی شغلی</option>
            </select>
          </div>
          <div class="col-6 col-md-3">
            <select class="form-select" id="occFilterStatus">
              <option value="all">همه نتایج</option>
              <option value="full">صحت و سلامت کامل</option>
              <option value="relative">سلامت نسبی</option>
              <option value="conditional">مشروط</option>
            </select>
          </div>
          <div class="col-12 col-md-2">
            <button class="btn btn-primary w-100" id="occApplyFilter"><i class="bi bi-funnel"></i> فیلتر</button>
          </div>
        </div>
      </div>
    </div>

    <div id="occListContainer">
      <div class="text-center py-5"><div class="spinner-border text-primary"></div></div>
    </div>
  `;

  // اتصال رویدادها
  $('occApplyFilter').onclick = () => {
    state.query = $('occSearch').value.trim();
    state.filterKind = $('occFilterKind').value;
    state.filterStatus = $('occFilterStatus').value;
    loadExams();
  };
  $('occSearch').onkeydown = (e) => { if (e.key === 'Enter') $('occApplyFilter').click(); };

  await loadExams();
}

// ═══════════════════════════════════════════════════════
// بارگذاری لیست معاینات
// ═══════════════════════════════════════════════════════
async function loadExams() {
  const c = $('occListContainer');
  c.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

  try {
    // واکشی معاینات همراه با اطلاعات بیمار
    let q = sb.from('lab_results_periodicexamination')
      .select(`
        id, exam_date, exam_type, final_opinion_text, 
        patient:core_patient(id, first_name, last_name, national_code, personnel_number)
      `)
      .order('exam_date', { ascending: false })
      .limit(100);

    const { data, error } = await q;
    if (error) throw error;

    // اعمال فیلترها در سمت کلاینت (چون دیتابیس شما ساختار ثابتی برای این فیلدها ندارد، از کلاینت استفاده می‌کنیم)
    let list = data || [];
    
    if (state.query) {
      const ql = state.query.toLowerCase();
      list = list.filter(ex => {
        const name = `${ex.patient?.first_name || ''} ${ex.patient?.last_name || ''}`.toLowerCase();
        return name.includes(ql) || (ex.patient?.national_code || '').includes(ql);
      });
    }

    if (state.filterKind !== 'all') {
      list = list.filter(ex => ex.exam_type === state.filterKind);
    }

    // برای فیلتر نتیجه، از فیلد `final_opinion_text` که در فرم ۴۹ ذخیره می‌شود استفاده می‌کنیم
    if (state.filterStatus !== 'all') {
      list = list.filter(ex => {
        // نگاشت ساده برای تشخیص متن نتیجه
        if (state.filterStatus === 'full' && ex.final_opinion_text?.includes('کامل')) return true;
        if (state.filterStatus === 'relative' && ex.final_opinion_text?.includes('نسبی')) return true;
        if (state.filterStatus === 'conditional' && (ex.final_opinion_text?.includes('مشروط') || ex.final_opinion_text?.includes('شرط'))) return true;
        return false;
      });
    }

    state.exams = list;
    renderList();

  } catch (e) {
    console.error('[OCC] load error:', e);
    c.innerHTML = `<div class="alert alert-danger">خطا در خواندن لیست: ${escapeHtml(e.message)}</div>`;
  }
}

function renderList() {
  const c = $('occListContainer');
  if (!state.exams.length) {
    c.innerHTML = '<div class="text-center py-5 text-muted">موردی یافت نشد.</div>';
    return;
  }

  c.innerHTML = `<div class="row g-3">` + state.exams.map(ex => {
    const name = ex.patient ? `${ex.patient.first_name || ''} ${ex.patient.last_name || ''}`.trim() : '—';
    const jd = gregorianToJalali(ex.exam_date);
    const typeFa = {
      pre_employment: 'بدو استخدام',
      periodic: 'دوره‌ای',
      return_to_work: 'بازگشت به کار',
      job_change: 'جابجایی شغلی'
    }[ex.exam_type] || ex.exam_type;

    return `
      <div class="col-12 col-md-6">
        <div class="card h-100 border-0 shadow-sm">
          <div class="card-body p-3">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <h6 class="fw-bold text-primary mb-0">${escapeHtml(name)}</h6>
              <span class="badge bg-light text-dark border">${jd}</span>
            </div>
            <div class="small text-muted mb-2">
              <i class="bi bi-person-vcard"></i> کد ملی: ${escapeHtml(ex.patient?.national_code || '—')} <br>
              <i class="bi bi-tag"></i> نوع: ${typeFa}
            </div>
            <div class="mb-3">
              <span class="small text-muted">نتیجه ثبت‌شده:</span>
              <div class="fw-bold small text-dark">${escapeHtml(ex.final_opinion_text || 'ثبت نشده')}</div>
            </div>
            <!-- ⭐ دکمه اقدام اصلاحی -->
            <button class="btn btn-sm btn-outline-primary w-100" onclick="window._openCorrectiveAction(${ex.id}, ${ex.patient?.id})">
              <i class="bi bi-tools"></i> اقدام اصلاحی / تاریخچه
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('') + `</div>`;

  // تعریف تابع گلوبال برای دسترسی دکمه‌ها
  window._openCorrectiveAction = (examId, patientId) => {
    openCorrectiveActionModal(examId, patientId);
  };
}

// ═══════════════════════════════════════════════════════
// مودال اقدام اصلاحی و تاریخچه
// ═══════════════════════════════════════════════════════
async function openCorrectiveActionModal(examId, patientId) {
  const modalId = 'correctiveActionModal';
  document.getElementById(modalId)?.remove();

  // ساختار مودال
  const modalHtml = `
    <div class="modal fade" id="${modalId}" tabindex="-1" data-bs-backdrop="static">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title"><i class="bi bi-tools"></i> اقدام اصلاحی و تاریخچه</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <!-- فرم ثبت/ویرایش اقدام -->
            <div class="mb-4">
              <label class="form-label fw-bold">متن اقدام اصلاحی:</label>
              <textarea class="form-control" id="caText" rows="3" placeholder="اقدامات اصلاحی مورد نیاز برای این پرسنل..."></textarea>
              <div class="d-flex gap-2 mt-2">
                <button class="btn btn-success flex-grow-1" id="caSaveBtn"><i class="bi bi-check2"></i> ذخیره اقدام</button>
                <button class="btn btn-warning" id="caCompleteBtn" style="display:none;"><i class="bi bi-check-circle"></i> علامت‌گذاری به عنوان انجام شده</button>
              </div>
            </div>

            <!-- تاریخچه -->
            <h6 class="fw-bold border-bottom pb-2 mb-3">تاریخچه تغییرات</h6>
            <div id="caHistoryContainer" style="max-height: 300px; overflow-y: auto;">
              <div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modal = new bootstrap.Modal(document.getElementById(modalId));
  modal.show();

  const textarea = $('caText');
  const saveBtn = $('caSaveBtn');
  const completeBtn = $('caCompleteBtn');
  const historyContainer = $('caHistoryContainer');

  // دریافت اقدامات فعلی و تاریخچه
  let currentAction = null;

  try {
    // ۱. خواندن اقدام فعلی
    const { data: actions, error: e1 } = await sb.from('occupational_corrective_actions')
      .select('*').eq('exam_id', examId).order('created_at', { ascending: false }).limit(1);
    
    if (e1) throw e1;

    if (actions && actions.length > 0) {
      currentAction = actions[0];
      textarea.value = currentAction.action_text || '';
      if (currentAction.status === 'pending') {
        completeBtn.style.display = 'inline-block';
      } else {
        completeBtn.style.display = 'none';
      }
    }

    // ۲. خواندن تاریخچه
    const { data: history, error: e2 } = await sb.from('occupational_corrective_actions_history')
      .select('*').eq('exam_id', examId).order('changed_at', { ascending: false });

    if (e2) throw e2;
    renderHistory(history || []);

  } catch (e) {
    console.error('[CA] load error:', e);
    historyContainer.innerHTML = `<div class="alert alert-danger small">خطا: ${escapeHtml(e.message)}</div>`;
  }

  // ذخیره (ثبت جدید یا ویرایش)
  saveBtn.onclick = async () => {
    const text = textarea.value.trim();
    if (!text) { toast('متن اقدام را وارد کنید', 'warning'); return; }

    saveBtn.disabled = true; saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> ذخیره...';

    try {
      const { data: { user } } = await sb.auth.getUser();
      const userEmail = user?.email || 'نامشخص';

      if (currentAction) {
        // ویرایش
        if (currentAction.action_text === text) { toast('تغییری اعمال نشد', 'info'); return; }
        
        const oldData = { action_text: currentAction.action_text, status: currentAction.status };
        const newData = { action_text: text, status: currentAction.status };

        const { error: eUpd } = await sb.from('occupational_corrective_actions')
          .update({ action_text: text, updated_at: new Date().toISOString() })
          .eq('id', currentAction.id);
        if (eUpd) throw eUpd;

        // ثبت در تاریخچه
        await sb.from('occupational_corrective_actions_history').insert({
          action_id: currentAction.id,
          exam_id: examId,
          change_type: 'update',
          old_data: oldData,
          new_data: newData,
          changed_by: userEmail
        });
        toast('✅ اقدام اصلاحی ویرایش شد', 'success');
        currentAction.action_text = text;
      } else {
        // ثبت جدید
        const { data: newAction, error: eIns } = await sb.from('occupational_corrective_actions').insert({
          exam_id: examId,
          patient_id: patientId,
          action_text: text,
          status: 'pending',
          created_by: userEmail
        }).select().single();
        if (eIns) throw eIns;

        // ثبت در تاریخچه
        await sb.from('occupational_corrective_actions_history').insert({
          action_id: newAction.id,
          exam_id: examId,
          change_type: 'create',
          old_data: null,
          new_data: { action_text: text, status: 'pending' },
          changed_by: userEmail
        });
        toast('✅ اقدام اصلاحی ثبت شد', 'success');
        currentAction = newAction;
        completeBtn.style.display = 'inline-block';
      }

      // رفرش تاریخچه
      const { data: history } = await sb.from('occupational_corrective_actions_history')
        .select('*').eq('exam_id', examId).order('changed_at', { ascending: false });
      renderHistory(history || []);

    } catch (e) {
      console.error(e);
      toast('خطا در ذخیره: ' + e.message, 'danger');
    } finally {
      saveBtn.disabled = false; saveBtn.innerHTML = '<i class="bi bi-check2"></i> ذخیره اقدام';
    }
  };

  // علامت‌گذاری به عنوان انجام شده
  completeBtn.onclick = async () => {
    if (!currentAction) return;
    if (!confirm('آیا این اقدام اصلاحی انجام شده است؟')) return;

    completeBtn.disabled = true;
    try {
      const { data: { user } } = await sb.auth.getUser();
      const userEmail = user?.email || 'نامشخص';

      const oldData = { action_text: currentAction.action_text, status: currentAction.status };
      const newData = { action_text: currentAction.action_text, status: 'completed' };

      const { error: eUpd } = await sb.from('occupational_corrective_actions')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', currentAction.id);
      if (eUpd) throw eUpd;

      await sb.from('occupational_corrective_actions_history').insert({
        action_id: currentAction.id,
        exam_id: examId,
        change_type: 'status_change',
        old_data: oldData,
        new_data: newData,
        changed_by: userEmail
      });

      toast('✅ وضعیت به انجام شده تغییر یافت', 'success');
      currentAction.status = 'completed';
      completeBtn.style.display = 'none';
      
      const { data: history } = await sb.from('occupational_corrective_actions_history')
        .select('*').eq('exam_id', examId).order('changed_at', { ascending: false });
      renderHistory(history || []);

    } catch (e) {
      toast('خطا: ' + e.message, 'danger');
    } finally {
      completeBtn.disabled = false;
    }
  };
}

// ═══════════════════════════════════════════════════════
// رندر تاریخچه
// ═══════════════════════════════════════════════════════
function renderHistory(history) {
  const container = $('caHistoryContainer');
  if (!container) return;

  if (!history.length) {
    container.innerHTML = '<div class="text-center text-muted small py-3">تاریخچه‌ای ثبت نشده است.</div>';
    return;
  }

  container.innerHTML = `<div class="list-group list-group-flush">` + history.map(h => {
    const date = new Date(h.changed_at).toLocaleString('fa-IR');
    let title = '';
    let desc = '';

    if (h.change_type === 'create') {
      title = 'ثبت اولیه';
      desc = `متن: ${escapeHtml(h.new_data?.action_text || '')}`;
    } else if (h.change_type === 'update') {
      title = 'ویرایش متن';
      desc = `از: ${escapeHtml(h.old_data?.action_text || '')} <br> به: ${escapeHtml(h.new_data?.action_text || '')}`;
    } else if (h.change_type === 'status_change') {
      title = 'تغییر وضعیت';
      desc = `از ${h.old_data?.status === 'pending' ? 'در انتظار' : 'انجام شده'} به ${h.new_data?.status === 'completed' ? 'انجام شده' : 'در انتظار'}`;
    }

    return `
      <div class="list-group-item px-0 py-2">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="fw-bold small text-primary">${title}</span>
          <span class="small text-muted">${date}</span>
        </div>
        <div class="small text-dark mb-1">${desc}</div>
        <div class="small text-muted"><i class="bi bi-person"></i> ${escapeHtml(h.changed_by || 'نامشخص')}</div>
      </div>
    `;
  }).join('') + `</div>`;
}
