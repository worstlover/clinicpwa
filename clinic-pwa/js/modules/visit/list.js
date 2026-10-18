// js/modules/visit/list.js
import { sb } from '../../sb.js';
import { $, faNum, escapeHtml, gregorianToJalali, toast, beep } from '../../utils.js';
import { state, loadUserMapFromVisits } from './state.js';
import { getMyDjangoId, isSuperuser, isSafetyOrSupervisor, getUserName, getTimeStr, getIncLabel } from './helpers.js';
import { openCreate } from './create.js';
import { openForm } from '../../forms/engine.js';
import { logChange } from './changelog.js'; // ⭐ برای ثبت لاگ تکمیل

export async function renderList() {
  const c = $('visitContent');
  c.innerHTML = `
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

    <!-- ⭐ دکمه تکمیل گروهی -->
    <button class="btn btn-warning w-100 py-2 mb-3" id="btnBulkComplete" style="display: ${state.filter !== 'completed' ? 'block' : 'none'};">
      <i class="bi bi-check2-all"></i> تکمیل گروهی ویزیت‌های باز
    </button>

    <div id="visitList">
      <div class="text-center py-5"><div class="spinner-border text-primary"></div></div>
    </div>
  `;

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

  // 🌟 تابع تکمیل از داخل لیست (بدون هدایت به صفحه جزئیات)
  window._completeVisitFromList = async (visitId, btn, e) => {
    if (e) e.stopPropagation();
    if (!confirm('ویزیت تکمیل شود؟ موجودی انبار کسر می‌شود.')) return;

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> بررسی...';

    try {
      // ۱. دریافت اقلام ویزیت
      const { data: items, error: e0 } = await sb.from('visits_visititem')
        .select('drug_id, quantity, drug:drugs_drug(name)').eq('visit_id', visitId);
      if (e0) throw e0;

      // اگر دارویی ندارد، فقط تکمیل شود
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

      // ۲. بررسی موجودی
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

      // ۳. کسر موجودی
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

      // ۴. تکمیل ویزیت
      const myId = getMyDjangoId();
      const { error: e2 } = await sb.from('visits_visit').update({
        status: 'completed', completed_at: new Date().toISOString(), completed_by_id: myId
      }).eq('id', visitId);
      if (e2) throw e2;

      await logChange(visitId, 'complete', [], `تکمیل ویزیت (${items.length} دارو کسر شد)`);
      toast('✅ ویزیت تکمیل شد', 'success');
      beep();
      
      // رفرش لیست (تا ویزیت تکمیل شده از لیست در انتظار حذف شود)
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

    let q = sb.from('visits_visit').select(`
      id, visit_date, status, is_incident, incident_type,
      blood_pressure, heart_rate, doctor_id, assigned_to_id,
      patient:core_patient(id, first_name, last_name, national_code, personnel_number),
      reason:visits_reasonforvisit(name),
      result:visits_treatmentresult(name)
    `).order('visit_date', { ascending: false }).limit(200);

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

    const { data, error } = await q;
    if (error) throw error;
    state.visits = data || [];

    await loadUserMapFromVisits();

    const list = $('visitList');
    if (!state.visits.length) {
      list.innerHTML = `
        <div class="card text-center py-5 muted">
          <i class="bi bi-inbox" style="font-size:2.5rem;opacity:0.5;"></i>
          <div class="mt-2">ویزیتی یافت نشد</div>
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

      // 🌟 اضافه شدن دکمه تکمیل در کنار فرم بستری
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

// ⭐ تابع تکمیل گروهی (با چک موجودی و کسر FIFO دقیقاً مثل تکمیل تکی)
async function bulkCompleteVisits() {
  const btn = $('btnBulkComplete');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال بررسی موجودی...';

  try {
    // ۱. دریافت تمام ویزیت‌های باز
    const { data: visits, error: e0 } = await sb.from('visits_visit')
      .select('id')
      .in('status', ['pending', 'referred']);

    if (e0) throw e0;
    if (!visits || visits.length === 0) {
      toast('هیچ ویزیت بازی وجود ندارد', 'info');
      return;
    }

    // ۲. بررسی داروها و موجودی برای هر ویزیت
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

    // ۳. اگر کسری موجودی وجود داشت، به کاربر هشدار بده
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

    // ۴. اجرای کسر FIFO و تکمیل ویزیت‌ها
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال تکمیل...';
    const myId = getMyDjangoId();
    let successCount = 0;
    let errorCount = 0;

    for (const v of readyToComplete) {
      try {
        // الف) کسر موجودی داروها (FIFO)
        for (const it of v.items) {
          const { error: eRpc } = await sb.rpc('deduct_stock_fifo', {
            p_drug_id: it.drug_id, p_quantity: it.quantity
          });
          if (eRpc) throw new Error(`داروی ${it.drug?.name}: ${eRpc.message}`);
        }

        // ب) تغییر وضعیت ویزیت به completed
        const { error: e2 } = await sb.from('visits_visit').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by_id: myId
        }).eq('id', v.id);

        if (e2) throw e2;

        // ج) ثبت لاگ
        await logChange(v.id, 'complete', [], `تکمیل گروهی (${v.items.length} دارو کسر شد)`);
        successCount++;

      } catch (err) {
        console.error(`خطا در تکمیل ویزیت #${v.id}:`, err);
        errorCount++;
      }
    }

    // ۵. نمایش نتیجه
    if (errorCount > 0) {
      toast(`⚠️ ${faNum(successCount)} ویزیت تکمیل شد، ${faNum(errorCount)} ویزیت با خطا مواجه شد.`, 'warning');
    } else {
      toast(`✅ ${faNum(successCount)} ویزیت با موفقیت تکمیل شد.`, 'success');
      beep();
    }

    // ۶. رفرش لیست
    await renderList();

  } catch (e) {
    console.error('[BULK COMPLETE] Error:', e);
    toast('خطا در عملیات گروهی: ' + e.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check2-all"></i> تکمیل گروهی ویزیت‌های باز';
  }
}
