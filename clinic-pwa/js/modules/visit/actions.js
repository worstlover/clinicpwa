// js/modules/visit/actions.js
import { sb } from '../../sb.js';
import { $, faNum, escapeHtml, toast, beep } from '../../utils.js';
import { state } from './state.js';
import { getMyDjangoId, getUserName } from './helpers.js';
import { logChange } from './changelog.js';
import { openDetail } from './detail.js';
import { renderList } from './list.js';

// ═══════════════════════════════════════════════════════
// ارجاع
// ═══════════════════════════════════════════════════════
export async function openReferralModal(visit) {
  const existing = document.getElementById('referralModal');
  if (existing) existing.remove();

  const myId = getMyDjangoId();
  let users = [];
  try {
    const { data } = await sb.from('auth_user')
      .select('id, first_name, last_name, username')
      .eq('is_active', true).neq('id', myId).order('first_name');
    users = data || [];
  } catch (e) { toast('خطا در لود کاربران', 'danger'); return; }

  const modalHtml = `
    <div class="modal fade" id="referralModal" tabindex="-1" data-bs-backdrop="static">
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-info text-white">
            <h5 class="modal-title"><i class="bi bi-share-fill"></i> ارجاع ویزیت</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-warning small">
              <i class="bi bi-exclamation-triangle"></i>
              <strong>توجه:</strong> بعد از ارجاع، شما دیگر نمی‌توانید این ویزیت را ویرایش کنید.
            </div>
            <div class="mb-3">
              <label class="form-label">جستجوی کاربر:</label>
              <input type="text" class="form-control" id="refSearch" placeholder="نام یا یوزرنیم..." autocomplete="off">
            </div>
            <div id="refUsersList" style="max-height:320px;overflow-y:auto;">
              ${users.slice(0, 30).map(u => {
                const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
                return `<button type="button" class="btn btn-light w-100 text-end mb-1 py-2"
                  data-ref-user="${u.id}" data-ref-name="${escapeHtml(name)}"
                  style="border:1px solid #e2e8f0;border-radius:10px;">
                  <i class="bi bi-person"></i> <strong>${escapeHtml(name)}</strong>
                </button>`;
              }).join('')}
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-light" data-bs-dismiss="modal">انصراف</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modal = new bootstrap.Modal(document.getElementById('referralModal'));
  modal.show();

  const searchInput = document.getElementById('refSearch');
  const usersList = document.getElementById('refUsersList');
  searchInput.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = users.filter(u => {
      const name = `${u.first_name || ''} ${u.last_name || ''} ${u.username}`.toLowerCase();
      return name.includes(q);
    });
    usersList.innerHTML = filtered.length
      ? filtered.slice(0, 30).map(u => {
          const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
          return `<button type="button" class="btn btn-light w-100 text-end mb-1 py-2"
            data-ref-user="${u.id}" data-ref-name="${escapeHtml(name)}"
            style="border:1px solid #e2e8f0;border-radius:10px;">
            <i class="bi bi-person"></i> <strong>${escapeHtml(name)}</strong>
          </button>`;
        }).join('')
      : '<div class="text-center muted small py-3">یافت نشد</div>';
  });

  document.getElementById('referralModal').addEventListener('click', async e => {
    const btn = e.target.closest('[data-ref-user]');
    if (!btn) return;
    const userId = parseInt(btn.dataset.refUser);
    const userName = btn.dataset.refName;

    if (!confirm(`ویزیت به "${userName}" ارجاع داده شود؟`)) return;

    try {
      const { error } = await sb.from('visits_visit').update({
        assigned_to_id: userId, status: 'referred'
      }).eq('id', visit.id);
      if (error) throw error;

      await logChange(visit.id, 'refer',
        [{ field: 'assigned_to_id', label: 'مسئول', old: getUserName(visit.assigned_to_id), new: userName }],
        `ارجاع به ${userName}`);

      toast(`✅ ویزیت به "${userName}" ارجاع شد`, 'success');
      beep();
      modal.hide();
      setTimeout(() => {
        document.getElementById('referralModal')?.remove();
        openDetail(visit.id);
      }, 300);
    } catch (err) {
      console.error(err);
      alert('❌ خطا: ' + err.message);
    }
  });

  document.getElementById('referralModal').addEventListener('hidden.bs.modal', () => {
    document.getElementById('referralModal')?.remove();
  });
}

// ═══════════════════════════════════════════════════════
// تکمیل
// ═══════════════════════════════════════════════════════
export async function completeVisit(visitId) {
  if (!confirm('ویزیت تکمیل شود؟ موجودی انبار کسر می‌شود.')) return;
  const btn = $('vCompleteBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> بررسی...'; }

  try {
    const { data: items, error: e0 } = await sb.from('visits_visititem')
      .select('drug_id, quantity, drug:drugs_drug(name)').eq('visit_id', visitId);
    if (e0) throw e0;

    if (!items?.length) {
      const myId = getMyDjangoId();
      const { error: e2 } = await sb.from('visits_visit').update({
        status: 'completed', completed_at: new Date().toISOString(), completed_by_id: myId
      }).eq('id', visitId);
      if (e2) throw e2;
      await logChange(visitId, 'complete', [], 'تکمیل ویزیت (بدون دارو)');
      toast('✅ ویزیت تکمیل شد', 'success');
      beep(); openDetail(visitId); return;
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
      alert(`⚠️ ویزیت تکمیل نشد\n\nموجودی داروهای زیر کافی نیست:\n\n${lines}\n\n` +
        `این ویزیت در وضعیت «در حال بررسی» باقی می‌ماند.`);
      toast('⚠️ موجودی کافی نیست', 'warning');
      beep(300); openDetail(visitId); return;
    }

    if (btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> کسر...';

    const errors = [], succeeded = [];
    for (const it of items) {
      const { error: e } = await sb.rpc('deduct_stock_fifo', {
        p_drug_id: it.drug_id, p_quantity: it.quantity
      });
      if (e) errors.push(`${it.drug?.name}: ${e.message}`);
      else succeeded.push(it.drug?.name);
    }

    if (errors.length) {
      alert(`❌ خطا:\n\n${errors.join('\n')}`);
      if (btn) { btn.disabled = false; btn.innerHTML = 'تلاش مجدد'; }
      return;
    }

    const myId = getMyDjangoId();
    const { error: e2 } = await sb.from('visits_visit').update({
      status: 'completed', completed_at: new Date().toISOString(), completed_by_id: myId
    }).eq('id', visitId);
    if (e2) throw e2;

    await logChange(visitId, 'complete', [], `تکمیل ویزیت (${succeeded.length} دارو کسر شد)`);

    toast(`✅ ویزیت تکمیل شد`, 'success');
    beep(); openDetail(visitId);
  } catch (e) {
    console.error(e);
    alert('❌ ' + e.message);
    if (btn) { btn.disabled = false; btn.innerHTML = 'تکمیل ویزیت'; }
  }
}
