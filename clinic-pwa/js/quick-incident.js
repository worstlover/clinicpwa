// js/quick-incident.js
import { sb } from './sb.js';
import { $, toast } from './utils.js';

const QUEUE_KEY = 'incident_location_queue';

export function initQuickIncidentButton() {
  const btn = $('btnQuickIncident');
  if (btn) btn.onclick = openQuickIncidentModal;
}

// مدیریت صف آفلاین
function addToQueue(alertId, lat, lng, accuracy) {
  try {
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    queue.push({ alertId, lat, lng, accuracy, time: Date.now() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) { console.error('Queue error:', e); }
}

export async function processOfflineQueue() {
  try {
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    if (!queue.length) return;
    
    const remaining = [];
    for (const item of queue) {
      const { error } = await sb.from('incident_alerts').update({
        latitude: item.lat,
        longitude: item.lng,
        accuracy_m: item.accuracy,
        location_updated_at: new Date(item.time).toISOString(),
        location_source: 'gps_offline_sync'
      }).eq('id', item.alertId);

      if (error) remaining.push(item); // اگر خطا داد، در صف بماند
    }
    
    if (remaining.length > 0) {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    } else {
      localStorage.removeItem(QUEUE_KEY);
    }
  } catch (e) { console.error(e); }
}

// وقتی اینترنت وصل شد، صف را خالی کن
window.addEventListener('online', processOfflineQueue);

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
              با تایید، هشدار فوراً ارسال می‌شود. موقعیت مکانی در پس‌زمینه دقیق‌تر خواهد شد.
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

      // ⭐️ ۱. ارسال فوری هشدار بدون معطلی برای لوکیشن
      const { data: alertData, error } = await sb.from('incident_alerts').insert({
        triggered_by:    user.id,
        triggered_name:  userName,
        location:        fullLocation || null,
        alert_type:      'quick'
      }).select('id').single();

      if (error) throw error;
      modal.hide();

      toast('🚨 هشدار ارسال شد. در حال دریافت موقعیت دقیق...', 'success');
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

      // ⭐️ ۲. دریافت لوکیشن در پس‌زمینه (اول سریع، بعد دقیق)
      if (alertData?.id) {
        const alertId = alertData.id;
        let watchId = null;
        let bestAccuracy = Infinity;

        const updateLocation = async (lat, lng, accuracy, source) => {
          if (accuracy > bestAccuracy) return; // اگر دقتش بدتر از قبلیه، آپدیت نکن
          bestAccuracy = accuracy;
          
          const payload = {
            latitude: lat,
            longitude: lng,
            accuracy_m: accuracy,
            location_updated_at: new Date().toISOString(),
            location_source: source
          };

          const { error: upErr } = await sb.from('incident_alerts').update(payload).eq('id', alertId);
          if (upErr) addToQueue(alertId, lat, lng, accuracy);
        };

        // فاز اول: Fix سریع و کم‌دقت (برای اینکه سریع جواب بگیریم)
        navigator.geolocation.getCurrentPosition(
          (pos) => updateLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, 'gps_fast'),
          (err) => console.warn('Fast GPS failed:', err),
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
        );

        // فاز دوم: WatchPosition با دقت بالا (تا ۳۰ ثانیه)
        if (navigator.geolocation) {
          watchId = navigator.geolocation.watchPosition(
            (pos) => updateLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, 'gps_high_accuracy'),
            (err) => console.warn('High acc GPS failed:', err),
            { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
          );

          setTimeout(() => {
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
          }, 30000);
        }
      }
    } catch (e) {
      console.error(e);
      alert('❌ خطا: ' + e.message);
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-megaphone-fill"></i> اعلام حادثه';
    }
  };
}