// js/alert-center.js
import { sb } from './sb.js';
import { $, escapeHtml, gregorianToJalali, toast } from './utils.js';

let currentUserUuid = null;
let alertCenterChannel = null;
let mapInstance = null;
let incidentChannel = null;
let locationPollInterval = null;
let liveMarker = null; 

// ⭐️ محاسبه فاصله به متر
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export async function initAlertCenter() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    currentUserUuid = user.id;
    await refreshBellBadge();

    const btn = $('btnAlertBell');
    if (btn) btn.onclick = openAlertCenter;

    if (alertCenterChannel) await sb.removeChannel(alertCenterChannel);
    alertCenterChannel = sb.channel('alert_center_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_alerts' }, () => refreshBellBadge())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visit_referral_alerts', filter: `target_user_uuid=eq.${currentUserUuid}` }, () => refreshBellBadge())
      .subscribe();
  } catch (e) { console.error(e); }
}

export async function refreshBellBadge() {
  try {
    const { count: ic } = await sb.from('incident_alerts').select('id', { count: 'exact', head: true }).eq('is_read', false).neq('triggered_by', currentUserUuid);
    const { count: rc } = await sb.from('visit_referral_alerts').select('id', { count: 'exact', head: true }).eq('target_user_uuid', currentUserUuid).eq('is_read', false);
    
    const total = (ic || 0) + (rc || 0);
    const badge = $('alertBellBadge');
    if (badge) {
      badge.textContent = total > 99 ? '99+' : String(total);
      badge.style.display = total > 0 ? 'flex' : 'none';
    }
  } catch (e) { }
}

function purgeAllModals() {
  document.querySelectorAll('.modal').forEach(el => el.remove());
  document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
}

async function openAlertCenter() {
  purgeAllModals();

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
              <button class="alert-tab active" data-tab="incident">🚨 حادثه</button>
              <button class="alert-tab" data-tab="referral">📩 ارجاع</button>
            </div>
            <div id="alertCenterContent" style="min-height:300px;padding:12px;"></div>
          </div>
          <div class="modal-footer" style="justify-content:space-between;">
            <button class="btn btn-outline-danger btn-sm" id="btnMarkAllRead">خواندن همه</button>
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
      .alert-tabs { display: flex; border-bottom: 2px solid #e2e8f0; background: #f8fafc; }
      .alert-tab { flex: 1; padding: 14px 8px; background: transparent; border: none; font-weight: 700; font-size: 0.9rem; color: #64748b; cursor: pointer; border-bottom: 3px solid transparent; transition: all 0.2s; font-family: inherit; }
      .alert-tab.active { color: #0d6efd; border-bottom-color: #0d6efd; background: #fff; }
      .alert-item { background: #fff; border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; border-right: 4px solid #cbd5e1; cursor: pointer; transition: all 0.15s; }
      .alert-item:hover { background: #f8fafc; }
      .alert-item.unread { border-right-color: #dc2626; background: #fef2f2; }
      .alert-item.unread.referral { border-right-color: #0d6efd; background: #eff6ff; }
      .alert-item-title { font-weight: 700; font-size: 0.9rem; }
      .alert-item-meta { font-size: 0.72rem; color: #64748b; margin-top: 3px; }
      .alert-item-time { font-size: 0.68rem; color: #94a3b8; margin-top: 5px; }
    `;
    document.head.appendChild(style);
  }

  const modalEl = $('alertCenterModal');
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  
  modalEl.addEventListener('hidden.bs.modal', () => { modalEl.remove(); purgeAllModals(); });

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
    if (currentTab === 'incident') {
      await sb.from('incident_alerts').update({ is_read: true }).eq('is_read', false).neq('triggered_by', currentUserUuid);
    } else {
      await sb.from('visit_referral_alerts').update({ is_read: true }).eq('target_user_uuid', currentUserUuid).eq('is_read', false);
    }
    await refreshBellBadge();
    await loadTab(currentTab);
  };

  await loadTab(currentTab);
}

async function loadTab(tab) {
  const content = $('alertCenterContent');
  if (!content) return;
  content.innerHTML = '<div class="text-center py-5"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

  if (tab === 'incident') {
    const { data } = await sb.from('incident_alerts').select('*').neq('triggered_by', currentUserUuid).order('created_at', { ascending: false }).limit(50);
    if (!data?.length) { content.innerHTML = '<div class="text-center muted py-5">هیچ حادثه‌ای ثبت نشده</div>'; return; }
    
    content.innerHTML = data.map(a => `
      <div class="alert-item ${!a.is_read ? 'unread' : ''}" data-alert-id="${a.id}">
        <div class="alert-item-title">🚨 اعلام حادثه ${a.alert_type === 'visit' ? '(ویزیت)' : '(سریع)'}</div>
        <div class="alert-item-meta">توسط: <strong>${escapeHtml(a.triggered_name || 'کاربر')}</strong></div>
        ${a.patient_name ? `<div class="alert-item-meta">بیمار: <strong>${escapeHtml(a.patient_name)}</strong></div>` : ''}
        <div class="alert-item-time">${gregorianToJalali(a.created_at)} - ${new Date(a.created_at).toLocaleTimeString('fa-IR', {hour:'2-digit',minute:'2-digit'})}</div>
      </div>
    `).join('');

    content.querySelectorAll('.alert-item').forEach(el => {
      el.onclick = async () => {
        const id = parseInt(el.dataset.alertId);
        await sb.from('incident_alerts').update({ is_read: true }).eq('id', id);
        el.classList.remove('unread');
        await refreshBellBadge();
        bootstrap.Modal.getInstance($('alertCenterModal'))?.hide();
        purgeAllModals();
        setTimeout(() => openIncidentScreen(id), 300);
      };
    });
  } else {
    content.innerHTML = '<div class="text-center muted py-5">بخش ارجاع در دسترس است.</div>';
  }
}

export async function openIncidentScreen(alertId) {
  purgeAllModals();
  
  // ⭐️ حذف هرگونه صفحه قبلی که باز مانده باشد
  const oldOverlay = document.getElementById('incidentScreen');
  if (oldOverlay) oldOverlay.remove();

  liveMarker = null; 

  const { data: alert, error } = await sb.from('incident_alerts').select('*').eq('id', alertId).single();
  if (error || !alert) return toast('خطا در بارگذاری حادثه', 'danger');

  // جستجوی مکان ثبت‌شده (شعاع ۵۰ متر)
  let knownLocationName = null;
  if (alert.latitude && alert.longitude) {
    const { data: knownLocs } = await sb.from('known_locations').select('*');
    if (knownLocs && knownLocs.length > 0) {
      for (const loc of knownLocs) {
        const dist = getDistanceInMeters(alert.latitude, alert.longitude, loc.latitude, loc.longitude);
        if (dist <= 50) {
          knownLocationName = loc.name;
          break;
        }
      }
    }
  }

  const overlay = document.createElement('div');
  overlay.id = 'incidentScreen';
  overlay.style.cssText = `position: fixed; inset: 0; z-index: 99999; background: #f8fafc; display: flex; flex-direction: column; direction: rtl; height: 100dvh;`;

  const topBar = `
    <div style="padding: 16px; background: linear-gradient(135deg, #dc2626, #991b1b); color: #fff; display: flex; justify-content: space-between; align-items: center; padding-top: max(16px, env(safe-area-inset-top));">
      <div style="font-weight: 700; font-size: 1.1rem;">🚨 جزئیات حادثه</div>
      <button id="btnCloseIncident" style="background: rgba(255,255,255,0.2); border: none; color: #fff; width: 36px; height: 36px; border-radius: 50%; font-size: 1.2rem; cursor: pointer;"><i class="bi bi-x-lg"></i></button>
    </div>
  `;

  let locationBanner = '';
  if (knownLocationName) {
    locationBanner = `
      <div style="background: #d1fae5; color: #065f46; padding: 10px; border-radius: 8px; margin-bottom: 12px; font-weight: bold; border: 1px solid #10b981; display: flex; align-items: center; gap: 8px;">
        <i class="bi bi-geo-alt-fill" style="font-size: 1.2rem;"></i> 
        <span>مکان ثبت‌شده: ${escapeHtml(knownLocationName)}</span>
      </div>`;
  } else if (alert.location && alert.latitude && alert.longitude) {
    locationBanner = `
      <div style="background: #fef3c7; color: #92400e; padding: 10px; border-radius: 8px; margin-bottom: 12px; border: 1px solid #fbbf24; display: flex; justify-content: space-between; align-items: center;">
        <div><i class="bi bi-info-circle"></i> این مکان در سیستم ثبت نشده است.</div>
        <button id="btnSaveLocation" style="background: #d97706; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-family: inherit; font-size: 0.8rem; font-weight: bold; cursor: pointer;">📌 ثبت این مکان</button>
      </div>`;
  }

  const contentDiv = `
    <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
      <div id="incidentMap" style="flex: 1; background: #e2e8f0; z-index: 1;"></div>
      <div style="padding: 16px; background: #fff; border-top: 1px solid #e2e8f0; box-shadow: 0 -4px 12px rgba(0,0,0,0.05); padding-bottom: max(16px, env(safe-area-inset-bottom));">
        ${locationBanner}
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <strong>گزارش‌دهنده:</strong> <span>${escapeHtml(alert.triggered_name || 'کاربر')}</span>
        </div>
        ${alert.patient_name ? `<div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><strong>بیمار:</strong> <span>${escapeHtml(alert.patient_name)}</span></div>` : ''}
        <div id="liveLocationInfo" style="margin-top: 8px; padding: 10px; background: #f1f5f9; border-radius: 8px; font-size: 0.9rem; display: none; line-height: 1.5;"></div>
        
        <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
          ${alert.triggered_phone ? `<a href="tel:${alert.triggered_phone}" style="flex: 1; min-width:100px; text-align: center; background: #10b981; color: #fff; padding: 10px; border-radius: 8px; text-decoration: none; font-weight: bold;">📞 تماس</a>` : ''}
          <a href="https://nshn.ir/?lat=${alert.latitude || 32.120055}&lng=${alert.longitude || 55.750778}" target="_blank" style="flex: 1; min-width:100px; text-align: center; background: #0d6efd; color: #fff; padding: 10px; border-radius: 8px; text-decoration: none; font-weight: bold;">🌐 نقشه آنلاین</a>
          <button id="btnMyLocation" style="flex: 1; min-width:100px; background: #3b82f6; color: #fff; border: none; padding: 10px; border-radius: 8px; font-weight: bold; font-family: inherit;"><i class="bi bi-geo-alt-fill"></i> موقعیت من</button>
          <button id="btnCenterIncident" style="flex: 1; min-width:100px; background: #64748b; color: #fff; border: none; padding: 10px; border-radius: 8px; font-weight: bold; font-family: inherit;"><i class="bi bi-crosshair"></i> مرکز حادثه</button>
        </div>
      </div>
    </div>
  `;

  overlay.innerHTML = topBar + contentDiv;
  document.body.appendChild(overlay);

  $('btnCloseIncident').onclick = () => {
    if (mapInstance) { mapInstance.remove(); mapInstance = null; }
    if (incidentChannel) sb.removeChannel(incidentChannel);
    if (locationPollInterval) clearInterval(locationPollInterval);
    overlay.remove();
  };

  if (!knownLocationName && alert.location && alert.latitude && alert.longitude) {
    $('btnSaveLocation').onclick = async () => {
      const btn = $('btnSaveLocation');
      btn.disabled = true;
      btn.innerHTML = 'در حال ثبت...';
      
      const { error: insErr } = await sb.from('known_locations').insert({
        name: alert.location,
        latitude: alert.latitude,
        longitude: alert.longitude,
        radius_m: 50, // ⭐️ شعاع ۵۰ متر
        created_by: currentUserUuid
      });

      if (insErr) {
        toast('خطا در ثبت مکان: ' + insErr.message, 'danger');
        btn.disabled = false;
        btn.innerHTML = '📌 ثبت این مکان';
      } else {
        toast('✅ مکان با موفقیت ثبت شد', 'success');
        btn.parentElement.style.background = '#d1fae5';
        btn.parentElement.style.color = '#065f46';
        btn.parentElement.style.borderColor = '#10b981';
        btn.parentElement.innerHTML = `<i class="bi bi-geo-alt-fill"></i> مکان ثبت‌شده: ${escapeHtml(alert.location)}`;
      }
    };
  }

  initIncidentMap(alert);
  listenToIncidentUpdates(alertId);
}

// ⭐️ نقشه و کاشی‌های آفلاین
function initIncidentMap(alert) {
  const defaultLat = alert.latitude || 32.120055;
  const defaultLng = alert.longitude || 55.750778;
  
  mapInstance = L.map('incidentMap', { 
    zoomControl: false, 
    preferCanvas: true,
    minZoom: 13,
    maxZoom: 18
  }).setView([defaultLat, defaultLng], 15);

  L.control.zoom({ position: 'topright' }).addTo(mapInstance);

  L.tileLayer('./map-tiles/{z}/{x}/{y}.png', {
    minZoom: 13,
    maxZoom: 18,
    maxNativeZoom: 18,
    errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  }).addTo(mapInstance);

  L.marker([defaultLat, defaultLng]).addTo(mapInstance)
    .bindPopup(`<b>📍 ${escapeHtml(alert.location || 'محل حادثه')}</b>`).openPopup();

  let routeLine = null;

  $('btnMyLocation').onclick = () => {
    if (!navigator.geolocation) return toast('GPS پشتیبانی نمی‌شود', 'warning');
    
    $('btnMyLocation').innerHTML = '<div class="spinner-border spinner-border-sm text-white"></div>';
    
    navigator.geolocation.getCurrentPosition(pos => {
      $('btnMyLocation').innerHTML = '<i class="bi bi-geo-alt-fill"></i> موقعیت من';
      
      const uLat = pos.coords.latitude;
      const uLng = pos.coords.longitude;
      
      if (liveMarker) {
        liveMarker.setLatLng([uLat, uLng]);
      } else {
        liveMarker = L.circleMarker([uLat, uLng], { color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.8, radius: 8 }).addTo(mapInstance);
      }
      
      if (routeLine) mapInstance.removeLayer(routeLine);
      routeLine = L.polyline([[uLat, uLng], [defaultLat, defaultLng]], { color: '#dc2626', dashArray: '5, 10', weight: 3 }).addTo(mapInstance);
      
      const distance = getDistanceInMeters(uLat, uLng, defaultLat, defaultLng);
      const Δλ = (defaultLng-uLng) * Math.PI/180;
      const y = Math.sin(Δλ) * Math.cos(defaultLat * Math.PI/180);
      const x = Math.cos(uLat * Math.PI/180)*Math.sin(defaultLat * Math.PI/180) - Math.sin(uLat * Math.PI/180)*Math.cos(defaultLat * Math.PI/180)*Math.cos(Δλ);
      const brng = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      
      const dirs = ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب'];
      const dirName = dirs[Math.round(brng / 45) % 8];

      $('liveLocationInfo').style.display = 'block';
      $('liveLocationInfo').innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>فاصله تا حادثه:</span>
          <strong style="color:#dc2626; font-size:1.1rem;">${distance} متر</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:4px;">
          <span>جهت:</span>
          <strong>${dirName}</strong>
        </div>
        <div style="font-size:0.75rem; color:#64748b; margin-top:4px;">دقت GPS: ±${Math.round(pos.coords.accuracy)} متر</div>
      `;
      
      mapInstance.setView([uLat, uLng], 16);
      
    }, err => {
      $('btnMyLocation').innerHTML = '<i class="bi bi-geo-alt-fill"></i> موقعیت من';
      toast('خطا در دریافت موقعیت: ' + err.message, 'danger');
    }, { enableHighAccuracy: true, timeout: 10000 });
  };

  $('btnCenterIncident').onclick = () => {
    mapInstance.setView([defaultLat, defaultLng], 15);
  };

  // ⭐️ رفع باگ نمایش نقشه در صفحه‌های جدید
  setTimeout(() => {
    if (mapInstance) mapInstance.invalidateSize();
  }, 300);
}

function listenToIncidentUpdates(alertId) {
  if (incidentChannel) sb.removeChannel(incidentChannel);
  
  incidentChannel = sb.channel('incident_live_' + alertId)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'incident_alerts', filter: `id=eq.${alertId}` }, (payload) => {
      const newData = payload.new;
      if (newData.latitude && newData.longitude) {
        updateMapLocation(newData.latitude, newData.longitude, newData.accuracy_m);
      }
    })
    .subscribe();

  if (locationPollInterval) clearInterval(locationPollInterval);
  locationPollInterval = setInterval(async () => {
    const { data } = await sb.from('incident_alerts').select('latitude, longitude, accuracy_m').eq('id', alertId).single();
    if (data && data.latitude) updateMapLocation(data.latitude, data.longitude, data.accuracy_m);
  }, 5000);
}

// ⭐️ آپدیت مختصات گیرنده بدون پرش نقشه
function updateMapLocation(lat, lng, acc) {
  if (!mapInstance) return;
  
  // فقط مارکرِ موقعیت گیرنده را جابه‌جا کن، نه کل نقشه را (نقشه دیگر پرش و زوم نمی‌کند)
  if (liveMarker) {
    liveMarker.setLatLng([lat, lng]);
  } else {
    liveMarker = L.circleMarker([lat, lng], { color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.8, radius: 8 }).addTo(mapInstance);
  }

  if (acc) {
    $('liveLocationInfo').innerHTML = `<div class="alert alert-info py-1 mb-0 small">موقعیت گیرنده ثبت شد (دقت ±${Math.round(acc)} متر)</div>`;
    $('liveLocationInfo').style.display = 'block';
  }
}