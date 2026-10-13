// js/alert-center.js
// ═══════════════════════════════════════════════════════
// مرکز هشدارها (زنگوله + تاریخچه)
// ═══════════════════════════════════════════════════════
import { sb } from './sb.js';
import { $, escapeHtml, gregorianToJalali } from './utils.js';

let currentUserUuid = null;
let alertCenterChannel = null;

// ═══════════════════════════════════════════════════════
// راه‌اندازی
// ═══════════════════════════════════════════════════════
export async function initAlertCenter() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    currentUserUuid = user.id;
    await refreshBellBadge();

    const btn = $('btnAlertBell');
    if (btn) btn.onclick = openAlertCenter;

    if (alertCenterChannel) {
      await sb.removeChannel(alertCenterChannel);
    }
    alertCenterChannel = sb.channel('alert_center_live')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'incident_alerts' },
        () => refreshBellBadge()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'visit_referral_alerts',
          filter: `target_user_uuid=eq.${currentUserUuid}` },
        () => refreshBellBadge()
      )
      .subscribe();

  } catch (e) {
    console.error('[AlertCenter] init failed:', e);
  }
}

// ═══════════════════════════════════════════════════════
// شمارش و آپدیت بج
// ═══════════════════════════════════════════════════════
export async function refreshBellBadge() {
  try {
    const { count: incidentCount } = await sb
      .from('incident_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)
      .neq('triggered_by', currentUserUuid);

    const { count: referralCount } = await sb
      .from('visit_referral_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('target_user_uuid', currentUserUuid)
      .eq('is_read', false);

    const total = (incidentCount || 0) + (referralCount || 0);

    const badge = $('alertBellBadge');
    if (badge) {
      if (total > 0) {
        badge.textContent = total > 99 ? '99+' : String(total);
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch (e) {
    console.warn('[AlertCenter] refresh badge failed:', e);
  }
}

// ═══════════════════════════════════════════════════════
// باز کردن پنل
// ═══════════════════════════════════════════════════════
async function openAlertCenter() {
  const existing = $('alertCenterModal');
  if (existing) existing.remove();

  const modalHtml = `
    <div class="modal fade" id="alertCenterModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header" style="background:linear-gradient(135deg,#0d6efd,#4c1d95);color:#fff;">
            <h5 class="modal-title"><i class="bi bi-bell-fill"></i> مرکز هشدارها</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" style="padding:0;">
            <div class="alert-tabs">
              <button class="alert-tab active" data-tab="incident">
                🚨 حادثه <span class="tab-badge" id="tabIncidentBadge">0</span>
              </button>
              <button class="alert-tab" data-tab="referral">
                📩 ارجاع <span class="tab-badge" id="tabReferralBadge">0</span>
              </button>
            </div>
            <div id="alertCenterContent" style="min-height:300px;padding:12px;">
              <div class="text-center py-5"><div class="spinner-border spinner-border-sm text-primary"></div></div>
            </div>
          </div>
          <div class="modal-footer" style="justify-content:space-between;">
            <button class="btn btn-outline-danger btn-sm" id="btnMarkAllRead">
              <i class="bi bi-check2-all"></i> خواندن همه
            </button>
            <button class="btn btn-light" data-bs-dismiss="modal">بستن</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  if (!document.getElementById('alertCenterStyle')) {
    const style = document.createElement('style');
    style.id = 'alertCenterStyle';
    style.textContent = `
      .alert-tabs {
        display: flex;
        border-bottom: 2px solid #e2e8f0;
        background: #f8fafc;
      }
      .alert-tab {
        flex: 1;
        padding: 14px 8px;
        background: transparent;
        border: none;
        font-weight: 700;
        font-size: 0.9rem;
        color: #64748b;
        cursor: pointer;
        border-bottom: 3px solid transparent;
        transition: all 0.2s;
        font-family: inherit;
      }
      .alert-tab.active {
        color: #0d6efd;
        border-bottom-color: #0d6efd;
        background: #fff;
      }
      .tab-badge {
        background: #dc2626;
        color: #fff;
        font-size: 0.65rem;
        padding: 1px 7px;
        border-radius: 10px;
        margin-right: 4px;
        font-weight: 700;
        display: none;
      }
      .tab-badge.show { display: inline-block; }
      .alert-item {
        background: #fff;
        border-radius: 12px;
        padding: 12px 14px;
        margin-bottom: 8px;
        border-right: 4px solid #cbd5e1;
        cursor: pointer;
        transition: all 0.15s;
      }
      .alert-item:hover { background: #f8fafc; }
      .alert-item.unread {
        border-right-color: #dc2626;
        background: #fef2f2;
      }
      .alert-item.unread.referral {
        border-right-color: #0d6efd;
        background: #eff6ff;
      }
      .alert-item-title {
        font-weight: 700;
        font-size: 0.9rem;
      }
      .alert-item-meta {
        font-size: 0.72rem;
        color: #64748b;
        margin-top: 3px;
      }
      .alert-item-time {
        font-size: 0.68rem;
        color: #94a3b8;
        margin-top: 5px;
      }
      .unread-dot {
        width: 8px; height: 8px;
        background: #dc2626;
        border-radius: 50%;
        display: inline-block;
        margin-right: 6px;
        animation: pulseDot 1.5s infinite;
      }
      @keyframes pulseDot {
        0%,100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
    `;
    document.head.appendChild(style);
  }

  const modalEl = $('alertCenterModal');
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());

  let currentTab = 'incident';
  document.querySelectorAll('.alert-tab').forEach(tab => {
    tab.onclick = () => {
      currentTab = tab.dataset.tab;
      document.querySelectorAll('.alert-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadTab(currentTab);
    };
  });

  $('btnMarkAllRead').onclick = async () => {
    try {
      if (currentTab === 'incident') {
        await sb.from('incident_alerts')
          .update({ is_read: true })
          .eq('is_read', false)
          .neq('triggered_by', currentUserUuid);
      } else {
        await sb.from('visit_referral_alerts')
          .update({ is_read: true })
          .eq('target_user_uuid', currentUserUuid)
          .eq('is_read', false);
      }
      await refreshBellBadge();
      await loadTab(currentTab);
      await refreshTabBadges();
    } catch (e) {
      console.error(e);
    }
  };

  await refreshTabBadges();
  await loadTab(currentTab);
}

async function refreshTabBadges() {
  const { count: ic } = await sb.from('incident_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false).neq('triggered_by', currentUserUuid);
  const { count: rc } = await sb.from('visit_referral_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('target_user_uuid', currentUserUuid).eq('is_read', false);

  const icBadge = $('tabIncidentBadge');
  if (icBadge) {
    icBadge.textContent = ic || 0;
    icBadge.classList.toggle('show', (ic || 0) > 0);
  }
  const rcBadge = $('tabReferralBadge');
  if (rcBadge) {
    rcBadge.textContent = rc || 0;
    rcBadge.classList.toggle('show', (rc || 0) > 0);
  }
}

async function loadTab(tab) {
  const content = $('alertCenterContent');
  if (!content) return;
  content.innerHTML = '<div class="text-center py-5"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

  try {
    if (tab === 'incident') {
      const { data } = await sb.from('incident_alerts')
        .select('*')
        .neq('triggered_by', currentUserUuid)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!data?.length) {
        content.innerHTML = `
          <div class="text-center muted py-5">
            <i class="bi bi-bell-slash" style="font-size:2.5rem;opacity:0.4;"></i>
            <div class="mt-2">هیچ هشدار حادثه‌ای ثبت نشده</div>
          </div>`;
        return;
      }

      content.innerHTML = data.map(a => `
        <div class="alert-item ${!a.is_read ? 'unread' : ''}" data-alert-id="${a.id}" data-alert-type="incident">
          <div class="alert-item-title">
            🚨 اعلام حادثه ${!a.is_read ? '<span class="unread-dot"></span>' : ''}
          </div>
          <div class="alert-item-meta">
            توسط: <strong>${escapeHtml(a.triggered_name || 'کاربر')}</strong>
          </div>
          ${a.patient_name ? `
            <div class="alert-item-meta">
              بیمار: <strong>${escapeHtml(a.patient_name)}</strong>
            </div>
          ` : ''}
          ${a.location ? `
            <div class="alert-item-meta">
              📍 ${escapeHtml(a.location)}
            </div>
          ` : ''}
          <div class="alert-item-time">
            ${gregorianToJalali(a.created_at)} - ${new Date(a.created_at).toLocaleTimeString('fa-IR', {hour:'2-digit',minute:'2-digit'})}
          </div>
        </div>
      `).join('');

    } else {
      const { data } = await sb.from('visit_referral_alerts')
        .select('*')
        .eq('target_user_uuid', currentUserUuid)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!data?.length) {
        content.innerHTML = `
          <div class="text-center muted py-5">
            <i class="bi bi-inbox" style="font-size:2.5rem;opacity:0.4;"></i>
            <div class="mt-2">هیچ ارجاعی دریافت نکرده‌اید</div>
          </div>`;
        return;
      }

      content.innerHTML = data.map(a => `
        <div class="alert-item ${!a.is_read ? 'unread referral' : ''}" data-alert-id="${a.id}" data-alert-type="referral" data-visit-id="${a.visit_id || ''}">
          <div class="alert-item-title">
            📩 ویزیت ارجاعی ${!a.is_read ? '<span class="unread-dot"></span>' : ''}
          </div>
          <div class="alert-item-meta">
            از طرف: <strong>${escapeHtml(a.referred_by_name || 'کاربر')}</strong>
          </div>
          ${a.patient_name ? `
            <div class="alert-item-meta">
              بیمار: <strong>${escapeHtml(a.patient_name)}</strong>
            </div>
          ` : ''}
          <div class="alert-item-time">
            ${gregorianToJalali(a.created_at)} - ${new Date(a.created_at).toLocaleTimeString('fa-IR', {hour:'2-digit',minute:'2-digit'})}
          </div>
        </div>
      `).join('');
    }

    content.querySelectorAll('.alert-item').forEach(el => {
      el.onclick = async () => {
        const id = parseInt(el.dataset.alertId);
        const type = el.dataset.alertType;
        const visitId = el.dataset.visitId;

        if (type === 'incident') {
          await sb.from('incident_alerts').update({ is_read: true }).eq('id', id);
        } else {
          await sb.from('visit_referral_alerts').update({ is_read: true }).eq('id', id);
        }
        el.classList.remove('unread');
        await refreshBellBadge();
        await refreshTabBadges();

        if (type === 'referral' && visitId) {
          bootstrap.Modal.getInstance($('alertCenterModal'))?.hide();
          setTimeout(async () => {
            $('alertCenterModal')?.remove();
            const { openVisits } = await import('./modules/visit/index.js');
            const { openDetail } = await import('./modules/visit/detail.js');
            await openVisits();
            setTimeout(() => openDetail(parseInt(visitId)), 150);
          }, 300);
        }
      };
    });

  } catch (e) {
    console.error('[AlertCenter] load tab failed:', e);
    content.innerHTML = '<div class="text-center text-danger py-5">خطا در بارگذاری</div>';
  }
}
