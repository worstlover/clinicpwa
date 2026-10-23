// js/quick-incident.js
import { sb } from './sb.js';
import { $, toast } from './utils.js';
import { broadcastIncidentAlert } from './incident-alert.js';

export function initQuickIncidentButton() {
  const btn = $('btnQuickIncident');
  if (btn) btn.onclick = openQuickIncidentModal;
}

function openQuickIncidentModal() {
  const existing = $('quickIncidentModal');
  if (existing) existing.remove();

  const modalHtml = `
    <div class="modal fade" id="quickIncidentModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header" style="background:linear-gradient(135deg,#dc2626,#991b1b);color:#fff;">
            <h5 class="modal-title"><i class="bi bi-exclamation-triangle-fill"></i> اعلام حادثه سریع</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-danger small mb-3">
              <i class="bi bi-info-circle"></i>
              با تایید، هشدار صوتی + تصویری به همه کادر درمان، ایمنی و سوپروایزرها ارسال می‌شود.
            </div>
            <div class="mb-3">
              <label class="form-label small">محل حادثه (اختیاری)</label>
              <input type="text" class="form-control" id="qiLocation" placeholder="مثال: خط تولید ۳، انبار..." autocomplete="off">
            </div>
            <div class="mb-3">
              <label class="form-label small">توضیح کوتاه (اختیاری)</label>
              <input type="text" class="form-control" id="qiNote" placeholder="مثال: سقوط از ارتفاع..." autocomplete="off">
            </div>
            <div class="form-check form-switch mt-3">
              <input class="form-check-input" type="checkbox" id="qiSendLocation" checked>
              <label class="form-check-label small" for="qiSendLocation">
                ارسال موقعیت مکانی دقیق (GPS) برای ردیابی
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-light" data-bs-dismiss="modal">انصراف</button>
            <button class="btn btn-danger" id="qiConfirm">
              <i class="bi bi-megaphone-fill"></i> اعلام حادثه
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modalEl = $('quickIncidentModal');
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());

  $('qiConfirm').onclick = async () => {
    const location = $('qiLocation').value.trim();
    const note = $('qiNote').value.trim();
    const wantsLocation = $('qiSendLocation').checked;

    const btn = $('qiConfirm');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ارسال...';

    let lat = null;
    let lng = null;

    // ⭐️ گرفتن موقعیت مکانی (بدون نیاز به API بین‌المللی)
    if (wantsLocation && navigator.geolocation) {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 7000, enableHighAccuracy: true });
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch (err) {
        console.warn('Geolocation failed:', err);
        toast('دریافت موقعیت مکانی ناموفق بود، بدون موقعیت ارسال می‌شود', 'warning');
      }
    }

    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error('کاربر یافت نشد');

      const userName = user.user_metadata?.full_name || user.email || 'کاربر';
      const fullLocation = [location, note].filter(Boolean).join(' | ');

      // ⭐️ ثبت در دیتابیس همراه با موقعیت
      const { error } = await sb.from('incident_alerts').insert({
        triggered_by:   user.id,
        triggered_name: userName,
        patient_id:     null,
        patient_name:   null,
        visit_id:       null,
        location:       fullLocation || null,
        alert_type:     'quick', // ⭐️ نوع هشدار: سریع
        latitude:       lat,
        longitude:      lng
      });

      if (error) throw error;

      toast('🚨 هشدار حادثه به همه ارسال شد', 'success');
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      modal.hide();

    } catch (e) {
      console.error(e);
      alert('❌ خطا: ' + e.message);
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-megaphone-fill"></i> اعلام حادثه';
    }
  };
}
