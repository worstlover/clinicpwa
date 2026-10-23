// js/quick-incident.js
import { sb } from './sb.js';
import { $, toast } from './utils.js';

export function initQuickIncidentButton() {
  const btn = $('btnQuickIncident');
  if (btn) btn.onclick = openQuickIncidentModal;
}

// ⭐️ تابع جدید: جستجوی اطلاعات تکمیلی در پس‌زمینه
async function fetchSupplementalInfo(user) {
  console.log('[SUPPLEMENTAL] Started fetching extra info for quick incident...');
  let phone = user.phone || user.user_metadata?.phone || user.user_metadata?.mobile || null;
  let lat = null;
  let lng = null;
  let anyFailed = false;

  // ۱. جستجوی هوشمند شماره تلفن کارمند
  if (!phone) {
    console.log('[SUPPLEMENTAL] Phone not in user object, checking auth.users table...');
    try {
      const { data, error } = await sb.from('users').select('phone').eq('id', user.id).maybeSingle();
      if (!error && data && data.phone) {
        phone = data.phone;
      }
    } catch (e) {
      console.warn('[SUPPLEMENTAL] Could not query users table:', e);
    }
  }
  
  if (phone) {
    console.log('[SUPPLEMENTAL] Employee phone found:', phone);
  } else {
    console.warn('[SUPPLEMENTAL] Could not find employee phone number anywhere.');
    anyFailed = true;
  }

  // ۲. گرفتن لوکیشن (GPS)
  if (navigator.geolocation) {
    console.log('[SUPPLEMENTAL] Requesting GPS location...');
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, enableHighAccuracy: true });
      });
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
      console.log('[SUPPLEMENTAL] Location found:', lat, lng);
    } catch (e) {
      console.warn('[SUPPLEMENTAL] Geolocation failed or timed out.', e);
      anyFailed = true;
    }
  } else {
    anyFailed = true;
  }

  return { phone, lat, lng, anyFailed };
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

    const btn = $('qiConfirm');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> ارسال...';

    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error('کاربر یافت نشد');

      const userName = user.user_metadata?.full_name || user.email || 'کاربر';
      const fullLocation = [locationText, note].filter(Boolean).join(' | ');

      // ⭐️ ۱. ارسال فوری هشدار (بدون شماره و لوکیشن)
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

      // ⭐️ ۲. دریافت و آپدیت اطلاعات تکمیلی در پس‌زمینه
      if (alertData?.id) {
        fetchSupplementalInfo(user).then(async (info) => {
          console.log('[QuickIncident] Background info result:', info);
          
          const updatePayload = {};
          if (info.phone) updatePayload.triggered_phone = info.phone;
          if (info.lat) updatePayload.latitude = info.lat;
          if (info.lng) updatePayload.longitude = info.lng;

          if (Object.keys(updatePayload).length > 0) {
            await sb.from('incident_alerts').update(updatePayload).eq('id', alertData.id);
            console.log('[QuickIncident] ✅ Supplemental info updated in DB.');
          }

          // ⭐️ اطلاع‌رسانی به کاربر در صورت ناقص بودن اطلاعات
          if (info.anyFailed || !info.phone) {
            toast('⚠️ نتوانستیم همه اطلاعات تکمیلی (شماره تلفن یا لوکیشن) را دریافت کنیم.', 'warning', 5000);
          }
        }).catch(err => {
          console.error('[QuickIncident] Supplemental failed entirely:', err);
          toast('⚠️ خطا در دریافت اطلاعات تکمیلی', 'warning');
        });
      }

    } catch (e) {
      console.error(e);
      alert('❌ خطا: ' + e.message);
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-megaphone-fill"></i> اعلام حادثه';
    }
  };
}
