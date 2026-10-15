// js/modules/fine-reward.js
import { sb } from '../sb.js';
import { $, toast, escapeHtml, gregorianToJalali } from '../utils.js';
import { showScreen } from '../ui.js';

function showScreenDirect(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen' + name);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
}

export function openFineReward() {
  showScreenDirect('FineReward');
  const wrap = $('fineRewardContent');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="fine-reward-page">
      <div class="fine-reward-header">
        <div class="fine-reward-title">مدیریت جریمه و تشویقی</div>
        <div class="fine-reward-sub">ثبت و مشاهده سوابق ایمنی پرسنل</div>
      </div>
      <div class="fine-reward-tabs">
        <button class="fine-reward-tab active" data-tab="list">لیست سوابق</button>
        <button class="fine-reward-tab" data-tab="add">ثبت جدید</button>
      </div>
      <div id="fineRewardBody"></div>
    </div>
  `;

  wrap.querySelectorAll('.fine-reward-tab').forEach(btn => {
    btn.onclick = () => {
      wrap.querySelectorAll('.fine-reward-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.tab === 'list') renderList();
      else renderAddForm();
    };
  });

  renderList();
}

async function renderList() {
  const body = $('fineRewardBody');
  body.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>';
  try {
    const { data, error } = await sb.from('safety_finereward')
      .select('*, patient:core_patient(first_name, last_name)')
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    if (!data.length) { body.innerHTML = '<div class="alert alert-info">سابقه‌ای ثبت نشده</div>'; return; }

    body.innerHTML = `
      <div class="fine-reward-list">
        ${data.map(item => `
          <div class="fine-reward-item ${item.record_type}">
            <div class="fine-reward-item-head">
              <span class="fine-reward-type">${item.record_type === 'fine' ? 'جریمه' : item.record_type === 'reward' ? 'تشویقی' : 'اخطار'}</span>
              <span class="fine-reward-date">${escapeHtml(gregorianToJalali(item.incident_datetime?.split('T')[0]) || '—')}</span>
            </div>
            <div class="fine-reward-worker">${escapeHtml(item.patient?.first_name || '')} ${escapeHtml(item.patient?.last_name || '')}</div>
            <div class="fine-reward-reason">${escapeHtml(item.reason || '—')}</div>
            ${item.amount ? `<div class="fine-reward-amount">${item.amount.toLocaleString('fa-IR')} ریال</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) {
    body.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
  }
}

function renderAddForm() {
  const body = $('fineRewardBody');
  body.innerHTML = `
    <div class="fine-reward-form">
      <div class="mb-3">
        <label class="form-label">نوع</label>
        <select class="form-select" id="frType">
          <option value="fine">جریمه</option>
          <option value="reward">تشویقی</option>
          <option value="warning">اخطار</option>
        </select>
      </div>
      <div class="mb-3">
        <label class="form-label">نام کارگر</label>
        <input type="text" class="form-control" id="frWorkerName" placeholder="جستجوی نام...">
        <div id="frWorkerResults" class="mt-1"></div>
      </div>
      <div class="mb-3">
        <label class="form-label">محل ثبت</label>
        <input type="text" class="form-control" id="frLocation">
      </div>
      <div class="mb-3">
        <label class="form-label">تاریخ و ساعت رویداد</label>
        <input type="text" class="form-control" id="frDatetime" placeholder="1404/01/01 12:00" dir="ltr">
      </div>
      <div class="mb-3">
        <label class="form-label">علت</label>
        <textarea class="form-control" id="frReason" rows="3"></textarea>
      </div>
      <div class="mb-3">
        <label class="form-label">مبلغ (ریال)</label>
        <input type="number" class="form-control" id="frAmount" value="0" dir="ltr">
      </div>
      <button class="btn btn-primary w-100" id="frSave">ثبت</button>
    </div>
  `;

  // جستجوی کارگر
  let timer = null;
  $('frWorkerName').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = e.target.value.trim();
      if (q.length < 2) { $('frWorkerResults').innerHTML = ''; return; }
      const { data } = await sb.from('core_patient')
        .select('id, first_name, last_name, personnel_number')
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
        .limit(5);
      $('frWorkerResults').innerHTML = (data || []).map(p => `
        <div class="worker-result" data-id="${p.id}" data-name="${escapeHtml(p.first_name + ' ' + p.last_name)}">
          ${escapeHtml(p.first_name + ' ' + p.last_name)} — ${escapeHtml(p.personnel_number || '—')}
        </div>
      `).join('');
      $('frWorkerResults').querySelectorAll('.worker-result').forEach(el => {
        el.onclick = () => {
          $('frWorkerName').value = el.dataset.name;
          $('frWorkerName').dataset.workerId = el.dataset.id;
          $('frWorkerResults').innerHTML = '';
        };
      });
    }, 300);
  });

  $('frSave').onclick = async () => {
    const workerId = $('frWorkerName').dataset.workerId;
    if (!workerId) { toast('کارگر را از لیست انتخاب کنید', 'warning'); return; }
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from('safety_finereward').insert({
      worker_id: parseInt(workerId),
      record_type: $('frType').value,
      location: $('frLocation').value,
      incident_datetime: $('frDatetime').value, // بهتره تبدیل بشه
      reason: $('frReason').value,
      amount: parseInt($('frAmount').value) || 0,
      recorded_by: user?.id,
    });
    if (error) { toast('خطا در ثبت: ' + error.message, 'danger'); return; }
    toast('✅ ثبت شد', 'success');
    renderList();
  };
}
