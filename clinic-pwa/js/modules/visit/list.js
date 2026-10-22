// js/modules/visit/list.js
import { sb } from '../../sb.js';
import { $, faNum, escapeHtml, gregorianToJalali, jalaliToGregorian, toast, beep } from '../../utils.js';
import { state, loadUserMapFromVisits } from './state.js';
import { getMyDjangoId, isSuperuser, isSafetyOrSupervisor, getUserName, getTimeStr, getIncLabel } from './helpers.js';
import { openCreate } from './create.js';
import { openForm } from '../../forms/engine.js';
import { logChange } from './changelog.js';

// ═══════════════════════════════════════════════════════
// متغیرهای نگهدارنده فیلترها (برای حفظ مقادیر بین رندرها)
// ═══════════════════════════════════════════════════════
let listFilters = {
  search: '',
  dateFrom: '',
  dateTo: '',
  incidentType: 'all',
  creatorId: 'all'
};
let creatorsLoaded = false;

export async function renderList() {
  const c = $('visitContent');
  c.innerHTML = `
    <!-- فیلترها -->
    <div class="card mb-3">
      <div class="card-body py-2">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="small fw-bold text-muted"><i class="bi bi-funnel"></i> فیلتر و جستجو</span>
          <button class="btn btn-sm btn-outline-secondary py-0" id="vToggleFilters" style="font-size:0.75rem;">نمایش/مخفی</button>
        </div>
        
        <div id="vFilterBody" style="display: block;">
          <div class="row g-2">
            <div class="col-12">
              <input type="text" id="vListSearch" class="form-control form-control-sm" placeholder="جستجوی نام، کد ملی یا پرسنلی..." value="${escapeHtml(listFilters.search)}">
            </div>
            <div class="col-6">
              <input type="text" id="vListDateFrom" class="form-control form-control-sm text-center" placeholder="از تاریخ (شمسی)" dir="ltr" value="${escapeHtml(listFilters.dateFrom)}" autocomplete="off">
            </div>
            <div class="col-6">
              <input type="text" id="vListDateTo" class="form-control form-control-sm text-center" placeholder="تا تاریخ (شمسی)" dir="ltr" value="${escapeHtml(listFilters.dateTo)}" autocomplete="off">
            </div>
            <div class="col-6">
              <select id="vListIncident" class="form-select form-select-sm">
                <option value="all">همه وضعیت‌ها</option>
                <option value="none" ${listFilters.incidentType === 'none' ? 'selected' : ''}>بدون حادثه</option>
                <option value="near_miss" ${listFilters.incidentType === 'near_miss' ? 'selected' : ''}>شبه حادثه</option>
                <option value="minor" ${listFilters.incidentType === 'minor' ? 'selected' : ''}>حادثه جزئی</option>
                <option value="major" ${listFilters.incidentType === 'major' ? 'selected' : ''}>حادثه ماژور</option>
              </select>
            </div>
            <div class="col-6">
              <select id="vListCreator" class="form-select form-select-sm">
                <option value="all">همه ثبت‌کنندگان</option>
                <!-- گزینه‌ها توسط تابع پر می‌شوند -->
              </select>
            </div>
            <div class="col-12 d-flex gap-2 mt-2">
              <button class="btn btn-sm btn-primary flex-grow-1" id="vListApplyFilter"><i class="bi bi-search"></i> اعمال فیلتر</button>
              <button class="btn btn-sm btn-outline-danger" id="vListClearFilter"><i class="bi bi-x-lg"></i> حذف فیلترها</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="filter-pills">
      <button class="filter-pill ${state.filter === 'pending' ? 'active' : ''}" data-filter="pending">
        <i class="bi bi-hourglass-split"></i> در انتظار
      </button>
      <button class="filter-pill ${state.filter === 'referred' ? 'active' : ''}" data-filter="referred">
        <i class="bi bi-arrow-left-right"></i> ارجاعی
      </button>
      <button class="filter-pill ${state.filter === 'completed' ? 'active' : ''}" data-filter="completed">
        <i class="bi bi-check-circle"></i> تکمیل
      </button>
    </div>

    <button class="btn btn-primary w-100 py-3 mb-2" id="btnNewVisit">
      <i class="bi bi-plus-circle-fill"></i> ثبت ویزیت جدید
    </button>

    <!-- دکمه تکمیل گروهی -->
    <button class="btn btn-warning w-100 py-2 mb-3" id="btnBulkComplete" style="display: ${state.filter !== 'completed' ? 'block' : 'none'};">
      <i class="bi bi-check2-all"></i> تکمیل گروهی ویزیت‌های باز
    </button>

    <div id="visitList">
      <div class="text-center py-5"><div class="spinner-border text-primary"></div></div>
    </div>
  `;

  // راه‌اندازی تاریخ‌شمار (اگر jQuery موجود باشد)
  if (typeof jQuery !== 'undefined' && jQuery.fn.persianDatepicker) {
    try {
      jQuery('#vListDateFrom, #vListDateTo').persianDatepicker({
        theme: 'melon', formatDate: 'YYYY/MM/DD', cellWidth: 32, cellHeight: 25, fontSize: 13
      });
    } catch (e) {}
  }

  // رویداد دکمه‌های فیلتر
  $('vToggleFilters').onclick = () => {
    const b = $('vFilterBody');
    b.style.display = b.style.display === 'none' ? 'block' : 'none';
  };

  $('vListApplyFilter').onclick = () => {
    listFilters.search = $('vListSearch').value.trim();
    listFilters.dateFrom = $('vListDateFrom').value.trim();
    listFilters.dateTo = $('vListDateTo').value.trim();
    listFilters.incidentType = $('vListIncident').value;
    listFilters.creatorId = $('vListCreator').value;
    renderList();
  };

  $('vListClearFilter').onclick = () => {
    listFilters = { search: '', dateFrom: '', dateTo: '', incidentType: 'all', creatorId: 'all' };
    renderList();
  };

  // رویداد تب‌ها
  c.querySelectorAll('[data-filter]').forEach(b => {
    b.onclick = () => { state.filter = b.dataset.filter; renderList(); };
  });

  $('btnNewVisit').onclick = () => openCreate();
  $('btnBulkComplete').onclick = bulkCompleteVisits;

  // 🌟 توابع سراسری برای دکمه‌های داخل لیست
  window._openForm34 = (visitId, e) => {
    if (e) e.stopPropagation();
    openForm('BR-FR-HS-34-00', { visitId: visitId });
  };

  window._completeVisitFromList = async (visitId, btn, e) => {
    if (e) e.stopPropagation();
    if (!confirm('ویزیت تکمیل شود؟ موجودی انبار کسر می‌شود.')) return;

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> بررسی...';

    try {
      const { data: items, error: e0 } = await sb.from('visits_visititem')
        .select('drug_id, quantity, drug:drugs_drug(name)').eq('visit_id', visitId);
      if (e0) throw e0;

      if (!items || items.length === 0) {
        const myId = getMyDjangoId();
        const { error: e2 } = await sb.from('visits_visit').update({
          status: 'completed', completed_at: new Date().toISOString(), completed_by_id: myId
        }).eq('id', visitId);
        if (e2) throw e2;
        await logChange(visitId, 'complete', [], 'تکمیل ویزیت (بدون دارو)');
        toast('✅ ویزیت تکمیل شد', 'success');
        beep(); 
        renderList();
        return;
      }

      const shortages = [];
      for (const it of items) {
        const { data: stock } = await sb.from('v_drug_stock')
          .select('total_quantity').eq('drug_id', it.drug_id).maybeSingle();
        const available = stock?.total_quantity || 0;
        if (available < it.quantity) {
          shortages.push({
            name: it.drug?.name || `#${it.drug_id}`,
            required: it.quantity, available, missing: it.quantity - available
          });
        }
      }

      if (shortages.length) {
        const lines = shortages.map(s =>
          `• ${s.name}\n  نیاز: ${faNum(s.required)} | موجودی: ${faNum(s.available)} | کمبود: ${faNum(s.missing)}`
        ).join('\n\n');
        alert(`⚠️ ویزیت تکمیل نشد\n\nموجودی داروهای زیر کافی نیست:\n\n${lines}`);
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        return;
      }

      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> کسر...';
      const errors = [];
      for (const it of items) {
        const { error: e } = await sb.rpc('deduct_stock_fifo', {
          p_drug_id: it.drug_id, p_quantity: it.quantity
        });
        if (e) errors.push(`${it.drug?.name}: ${e.message}`);
      }

      if (errors.length) {
        alert(`❌ خطا در کسر موجودی:\n\n${errors.join('\n')}`);
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        return;
      }

      const myId = getMyDjangoId();
      const { error: e2 } = await sb.from('visits_visit').update({
        status: 'completed', completed_at: new Date().toISOString(), completed_by_id: myId
      }).eq('id', visitId);
      if (e2) throw e2;

      await logChange(visitId, 'complete', [], `تکمیل ویزیت (${items.length} دارو کسر شد)`);
      toast('✅ ویزیت تکمیل شد', 'success');
      beep();
      
      renderList();

    } catch (err) {
      console.error(err);
      alert('❌ ' + err.message);
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  };

  try {
    const myId = getMyDjangoId();
    const superuser = isSuperuser();
    const safety = isSafetyOrSupervisor();

    // ۱. ساخت کوئری پایه با فیلترها
    let q = sb.from('visits_visit').select(`
      id, visit_date, status, is_incident, incident_type,
      blood_pressure, heart_rate, doctor_id, assigned_to_id,
      patient:core_patient(id, first_name, last_name, national_code, personnel_number),
      reason:visits_reasonforvisit(name),
      result:visits_treatmentresult(name)
    `).order('visit_date', { ascending: false }).limit(200);

    // تب‌ها
    if (state.filter === 'completed') {
      q = q.eq('status', 'completed');
    } else if (state.filter === 'referred') {
      q = q.eq('status', 'referred');
      if (!superuser && myId) q = q.or(`doctor_id.eq.${myId},assigned_to_id.eq.${myId}`);
    } else {
      q = q.in('status', ['pending', 'referred']);
      if (!superuser && myId) {
        let orParts = [`doctor_id.eq.${myId}`, `assigned_to_id.eq.${myId}`];
        if (safety) orParts.push('is_incident.eq.true');
        q = q.or(orParts.join(','));
      }
    }

    // فیلتر تاریخ
    if (listFilters.dateFrom) {
      const g = jalaliToGregorian(listFilters.dateFrom);
      if (g) q = q.gte('visit_date', g + 'T00:00:00');
    }
    if (listFilters.dateTo) {
      const g = jalaliToGregorian(listFilters.dateTo);
      if (g) q = q.lte('visit_date', g + 'T23:59:59');
    }

    // فیلتر نوع حادثه
    if (listFilters.incidentType !== 'all') {
      if (listFilters.incidentType === 'none') {
        q = q.eq('is_incident', false); // یا .eq('incident_type', 'none')
      } else {
        q = q.eq('incident_type', listFilters.incidentType);
      }
    }

    // فیلتر ثبت‌کننده
    if (listFilters.creatorId !== 'all') {
      q = q.eq('doctor_id', listFilters.creatorId);
    }

    // فیلتر جستجو (نام/کد ملی)
    if (listFilters.search) {
      const s = listFilters.search;
      const { data: pts } = await sb.from('core_patient')
        .select('id')
        .or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,national_code.ilike.%${s}%,personnel_number.ilike.%${s}%`)
        .limit(100);

      if (pts && pts.length > 0) {
        q = q.in('patient_id', pts.map(p => p.id));
      } else {
        q = q.eq('patient_id', -1); // فورس کردن نتیجه خالی
      }
    }

    const { data, error } = await q;
    if (error) throw error;
    state.visits = data || [];

    await loadUserMapFromVisits();

    // پر کردن لیست ثبت‌کنندگان (فقط یکبار)
    if (!creatorsLoaded) {
      populateCreatorsDropdown();
      creatorsLoaded = true;
    } else {
      const sel = $('vListCreator');
      if (sel) sel.value = listFilters.creatorId;
    }

    const list = $('visitList');
    if (!state.visits.length) {
      list.innerHTML = `
        <div class="card text-center py-5 muted">
          <i class="bi bi-inbox" style="font-size:2.5rem;opacity:0.5;"></i>
          <div class="mt-2">ویزیتی با این مشخصات یافت نشد</div>
        </div>`;
      return;
    }

    list.innerHTML = state.visits.map(v => {
      const p = v.patient || {};
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || '—';
      const jd = gregorianToJalali(v.visit_date);
      const timeStr = getTimeStr(v.visit_date);
      const isInc = v.is_incident && v.incident_type !== 'none';
      const cls = v.status === 'completed' ? 'completed' : (v.status === 'referred' ? 'referred' : (isInc ? 'incident' : ''));

      const doctorName = getUserName(v.doctor_id);
      const assigneeName = getUserName(v.assigned_to_id);
      const isMine = v.assigned_to_id === getMyDjangoId();

      const actionButtons = v.status !== 'completed' ? `
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-sm btn-success flex-grow-1" onclick="window._completeVisitFromList(${v.id}, this, event)">
            <i class="bi bi-check-circle-fill"></i> تکمیل ویزیت
          </button>
          <button class="btn btn-sm btn-outline-danger flex-grow-1" onclick="window._openForm34(${v.id}, event)">
            <i class="bi bi-file-earmark-medical"></i> فرم بستری
          </button>
        </div>
      ` : '';

      return `
        <div class="visit-card ${cls}" data-visit-id="${v.id}">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1">
              <div class="visit-name">
                ${escapeHtml(name)}
                ${isInc ? `<span class="badge-soft danger" style="font-size:0.6rem;">${getIncLabel(v.incident_type)}</span>` : ''}
                ${isMine && v.status !== 'completed' ? `<span class="badge-soft primary" style="font-size:0.6rem;">مسئول من</span>` : ''}
              </div>
              <div class="visit-meta">
                <i class="bi bi-calendar3"></i> ${jd} - ${timeStr}
                ${v.reason?.name ? ` | ${escapeHtml(v.reason.name)}` : ''}
              </div>
              <div class="visit-meta">
                ${p.national_code ? `<span dir="ltr">${escapeHtml(p.national_code)}</span>` : ''}
                ${v.blood_pressure ? ` | <i class="bi bi-droplet"></i> ${escapeHtml(v.blood_pressure)}` : ''}
                ${v.heart_rate ? ` | <i class="bi bi-heart-pulse"></i> ${faNum(v.heart_rate)}` : ''}
              </div>
              <div class="visit-meta" style="border-top:1px dashed #e2e8f0;padding-top:5px;margin-top:5px;">
                <i class="bi bi-pencil-square"></i> ثبت: <strong>${escapeHtml(doctorName)}</strong>
                ${v.doctor_id !== v.assigned_to_id
                  ? ` | <i class="bi bi-person-check"></i> مسئول: <strong>${escapeHtml(assigneeName)}</strong>`
                  : ''}
              </div>
              ${actionButtons}
            </div>
            <i class="bi bi-chevron-left" style="font-size:1.5rem;color:#94a3b8;"></i>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-visit-id]').forEach(el => {
      el.onclick = async () => {
        const { openDetail } = await import('./detail.js');
        openDetail(parseInt(el.dataset.visitId));
      };
    });

  } catch (e) {
    console.error(e);
    $('visitList').innerHTML = `<div class="alert alert-danger">خطا: ${escapeHtml(e.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════
// پر کردن لیست کشویی ثبت‌کنندگان
// ═══════════════════════════════════════════════════════
async function populateCreatorsDropdown() {
  try {
    // دریافت کاربرانی که ویزیت ثبت کرده‌اند
    const { data } = await sb.from('visits_visit').select('doctor_id').not('doctor_id', 'is', null);
    if (!data?.length) return;
    
    const uniqueIds = [...new Set(data.map(d => d.doctor_id))];
    const sel = $('vListCreator');
    if (!sel) return;

    sel.innerHTML = '<option value="all">همه ثبت‌کنندگان</option>' + 
      uniqueIds.map(id => {
        const name = getUserName(id);
        return `<option value="${id}" ${listFilters.creatorId == id ? 'selected' : ''}>${escapeHtml(name)}</option>`;
      }).join('');
  } catch(e) {
    console.log('Error populating creators:', e);
  }
}

// ⭐ تابع تکمیل گروهی (بدون تغییر)
async function bulkCompleteVisits() {
  const btn = $('btnBulkComplete');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال بررسی موجودی...';

  try {
    const { data: visits, error: e0 } = await sb.from('visits_visit')
      .select('id')
      .in('status', ['pending', 'referred']);

    if (e0) throw e0;
    if (!visits || visits.length === 0) {
      toast('هیچ ویزیت بازی وجود ندارد', 'info');
      return;
    }

    const readyToComplete = [];
    const shortagesInfo = [];

    for (const v of visits) {
      const { data: items } = await sb.from('visits_visititem')
        .select('drug_id, quantity, drug:drugs_drug(name)').eq('visit_id', v.id);

      if (!items || items.length === 0) {
        readyToComplete.push({ id: v.id, items: [] });
        continue;
      }

      let hasShortage = false;
      let visitShortages = [];

      for (const it of items) {
        const { data: stock } = await sb.from('v_drug_stock')
          .select('total_quantity').eq('drug_id', it.drug_id).maybeSingle();
        const available = stock?.total_quantity || 0;

        if (available < it.quantity) {
          hasShortage = true;
          visitShortages.push({
            name: it.drug?.name || `#${it.drug_id}`,
            required: it.quantity,
            available: available
          });
        }
      }

      if (hasShortage) {
        shortagesInfo.push({ visitId: v.id, shortages: visitShortages });
      } else {
        readyToComplete.push({ id: v.id, items });
      }
    }

    if (shortagesInfo.length > 0) {
      let msg = `⚠️ برخی ویزیت‌ها دارای کسری موجودی دارو هستند و از لیست تکمیل گروهی حذف شدند:\n\n`;
      shortagesInfo.forEach(info => {
        msg += `ویزیت #${info.visitId}:\n`;
        info.shortages.forEach(s => {
          msg += `  - ${s.name}: نیاز ${faNum(s.required)} | موجودی ${faNum(s.available)}\n`;
        });
        msg += `\n`;
      });
      msg += `آیا مایل هستید سایر ویزیت‌ها (${faNum(readyToComplete.length)} مورد) که موجودی کافی دارند، تکمیل شوند؟`;

      if (readyToComplete.length === 0) {
        alert('هیچ ویزیتی برای تکمیل گروهی وجود ندارد (همه دارای کسری هستند).');
        return;
      }

      if (!confirm(msg)) return;
    } else {
      if (!confirm(`آیا مطمئن هستید که ${faNum(readyToComplete.length)} ویزیت تکمیل و موجودی داروهایشان کسر شود؟`)) return;
    }

    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال تکمیل...';
    const myId = getMyDjangoId();
    let successCount = 0;
    let errorCount = 0;

    for (const v of readyToComplete) {
      try {
        for (const it of v.items) {
          const { error: eRpc } = await sb.rpc('deduct_stock_fifo', {
            p_drug_id: it.drug_id, p_quantity: it.quantity
          });
          if (eRpc) throw new Error(`داروی ${it.drug?.name}: ${eRpc.message}`);
        }

        const { error: e2 } = await sb.from('visits_visit').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by_id: myId
        }).eq('id', v.id);

        if (e2) throw e2;

        await logChange(v.id, 'complete', [], `تکمیل گروهی (${v.items.length} دارو کسر شد)`);
        successCount++;

      } catch (err) {
        console.error(`خطا در تکمیل ویزیت #${v.id}:`, err);
        errorCount++;
      }
    }

    if (errorCount > 0) {
      toast(`⚠️ ${faNum(successCount)} ویزیت تکمیل شد، ${faNum(errorCount)} ویزیت با خطا مواجه شد.`, 'warning');
    } else {
      toast(`✅ ${faNum(successCount)} ویزیت با موفقیت تکمیل شد.`, 'success');
      beep();
    }

    await renderList();

  } catch (e) {
    console.error('[BULK COMPLETE] Error:', e);
    toast('خطا در عملیات گروهی: ' + e.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check2-all"></i> تکمیل گروهی ویزیت‌های باز';
  }
                                        }
