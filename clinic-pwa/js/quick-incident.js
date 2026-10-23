// js/quick-incident.js
import { sb } from './sb.js';
import { $, toast } from './utils.js';

export function initQuickIncidentButton() {
  const btn = $('btnQuickIncident');
  if (btn) btn.onclick = openQuickIncidentModal;
}

async function fetchPhoneNumber(user) {
  let phone = user.phone || user.user_metadata?.phone || user.user_metadata?.mobile || null;
  if (!phone) {
    try {
      const { data } = await sb.from('users').select('phone').eq('id', user.id).maybeSingle();
      if (data && data.phone) phone = data.phone;
    } catch (e) {}
  }
  return phone;
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
              با تایید، هشدار فوراً ارسال می‌شود. اطلاعات تکمیلی (موقعیت و شماره تماس) در پس‌زمینه ضمیمه خواهند شد.
            </div>
            <div class="mb-3">
              <label class="form-label small">محل حادثه (اختیاری)</label>
              <input type="text" class="form-control" id="qiLocation" placeholder="مثال: خط تولید ۳، انبار..." autocomplete="off">
            </div>
            <div class="mb-3">
              <label class="form-label small">توضیح کوتاه (اختیاری)</label>
              <input type="text" class="form-control" id="qiNote" placeholder="مثال: سقوط از ارتفاع..." autocomplete="off">
            </div>
            
            <!-- ⭐️ چک‌باکس لوکیشن مجدداً اضافه شد -->
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
    const locationText = $('qiLocation').value.trim();
    const note = $('qiNote').value.trim();
    const wantsLocation = $('qiSendLocation') ? $('qiSendLocation').checked : true;

    const btn = $('qiConfirm');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> ارسال...';

    // ⭐️ ۱. درخواست لوکیشن به محض کلیک (برای باز شدن پنجره اجازه مرورگر)
    let geoPromise = null;
    if (wantsLocation && navigator.geolocation) {
      console.log('[QuickIncident] Requesting GPS permission immediately...');
      geoPromise = new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000, enableHighAccuracy: true });
      });
    }

    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error('کاربر یافت نشد');

      const userName = user.user_metadata?.full_name || user.email || 'کاربر';
      const fullLocation = [locationText, note].filter(Boolean).join(' | ');

      // ⭐️ ۲. ارسال فوری هشدار (بدون معطل شدن)
      console.log('[QuickIncident] Sending FAST alert now...');
      const { data: alertData, error } = await sb.from('incident_alerts').insert({
        triggered_by:    user.id,
        triggered_name:  userName,
        location:        fullLocation || null,
        alert_type:      'quick'
      }).select('id').single();

      if (error) throw error;

      toast('🚨 هشدار ارسال شد. در حال دریافت اطلاعات تکمیلی...', 'success');
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      modal.hide();

      // ⭐️ ۳. دریافت لوکیشن و شماره در پس‌زمینه و آپدیت دیتابیس
      if (alertData?.id) {
        (async () => {
          let lat = null, lng = null;
          
          if (geoPromise) {
            try {
              const pos = await geoPromise;
              lat = pos.coords.latitude;
              lng = pos.coords.longitude;
              console.log('[QuickIncident] Location found:', lat, lng);
            } catch (e) {
              console.warn('[QuickIncident] Geolocation failed or denied:', e);
            }
          }

          const phone = await fetchPhoneNumber(user);
          console.log('[QuickIncident] Phone found:', phone);

          const updatePayload = {};
          if (phone) updatePayload.triggered_phone = phone;
          if (lat) updatePayload.latitude = lat;
          if (lng) updatePayload.longitude = lng;

          if (Object.keys(updatePayload).length > 0) {
            await sb.from('incident_alerts').update(updatePayload).eq('id', alertData.id);
            console.log('[QuickIncident] ✅ Supplemental info updated in DB.');
          }

          if (!phone || (!lat && wantsLocation)) {
            toast('⚠️ نتوانستیم همه اطلاعات تکمیلی (شماره یا لوکیشن) را دریافت کنیم.', 'warning', 5000);
          }
        })();
      }

    } catch (e) {
      console.error(e);
      alert('❌ خطا: ' + e.message);
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-megaphone-fill"></i> اعلام حادثه';
    }
  };
}
