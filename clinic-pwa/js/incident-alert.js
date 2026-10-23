// js/incident-alert.js
import { sb } from './sb.js';

const ALLOWED_ROLES = ['Nurse', 'doctor', 'safety', 'Supervisor'];
const ALERT_MP3_QUICK = './sounds/incident-alert1.mp3';
const ALERT_MP3_VISIT = './sounds/incident-alert.mp3'; 

let currentUserRole = null;
let currentUserUuid = null;
let alertChannel = null;
let isPlaying = false;
let lastAlertTime = 0;
let mp3Available = null;

let audioUnlocked = false;

function unlockAllAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.01);
  } catch (e) {}
  try {
    const silent = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    silent.volume = 0;
    silent.play().catch(() => {});
  } catch (e) {}
}

document.addEventListener('pointerdown', unlockAllAudio, { once: true });
document.addEventListener('touchstart', unlockAllAudio, { once: true });
document.addEventListener('click', unlockAllAudio, { once: true });

// ⭐️ جستجوی هوشمند بیمار
async function fetchSupplementalInfo(user, patientId = null) {
  console.log('[SUPPLEMENTAL-VISIT] Started fetching extra info for visit incident...');
  let phone = user.phone || user.user_metadata?.phone || null;
  let patientPhone = null;
  let anyFailed = false;

  if (!phone) {
    console.warn('[SUPPLEMENTAL-VISIT] Could not find employee phone number.');
    anyFailed = true;
  } else {
    console.log('[SUPPLEMENTAL-VISIT] Employee phone found:', phone);
  }

  if (patientId) {
    console.log('[SUPPLEMENTAL-VISIT] Searching patient phone in core_patient table for ID:', patientId);
    try {
      // ⭐️ استفاده از نام دقیق ستون phone_number در جدول core_patient
      const { data, error } = await sb.from('core_patient')
        .select('phone_number')
        .eq('id', patientId)
        .maybeSingle();
      
      if (!error && data) {
        patientPhone = data.phone_number || null;
        console.log('[SUPPLEMENTAL-VISIT] Patient phone found:', patientPhone);
      }
    } catch (e) {
      console.warn('[SUPPLEMENTAL-VISIT] Error fetching patient phone:', e);
    }
  }

  if (!patientPhone && patientId) {
    anyFailed = true;
  }

  return { phone, patientPhone, anyFailed };
}

export async function initIncidentAlertListener() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    currentUserUuid = user.id;
    const djangoUserId = user.user_metadata?.django_user_id;
    if (djangoUserId) {
      const { data: userGroups } = await sb.from('auth_user_groups').select('group_id').eq('user_id', djangoUserId);
      if (userGroups?.length) {
        const { data: groups } = await sb.from('auth_group').select('name').in('id', userGroups.map(r => r.group_id));
        if (groups?.length) currentUserRole = groups[0].name;
      }
    }

    if (!ALLOWED_ROLES.includes(currentUserRole)) return;
    checkMp3Availability();

    if (alertChannel) await sb.removeChannel(alertChannel);

    // گوش دادن به INSERT (هشدار جدید) و UPDATE (آپدیت لوکیشن/شماره)
    alertChannel = sb.channel('incident_alerts_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incident_alerts' }, (payload) => handleNewAlert(payload.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'incident_alerts' }, (payload) => handleUpdateAlert(payload.new))
      .subscribe();

  } catch (e) { console.error(e); }
}

async function checkMp3Availability() {
  try {
    const resQuick = await fetch(ALERT_MP3_QUICK, { method: 'HEAD' });
    const resVisit = await fetch(ALERT_MP3_VISIT, { method: 'HEAD' });
    mp3Available = resQuick.ok || resVisit.ok;
  } catch (e) { mp3Available = false; }
}

// ⭐️ هشدار ویزیت: فوراً ارسال، بعداً آپدیت
export async function broadcastIncidentAlert({ patientName, patientId, visitId, location }) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const userName = user.user_metadata?.full_name || user.email || 'کاربر';

    console.log('[IncidentAlert] Sending FAST visit alert now...');
    const { data: alertData, error } = await sb.from('incident_alerts').insert({
      triggered_by:   user.id,
      triggered_name: userName,
      patient_id:     patientId || null,
      patient_name:   patientName || null,
      visit_id:       visitId || null,
      location:       location || null,
      alert_type:     'visit'
    }).select('id').single();

    if (error) return;
    showSenderToast(userName);

    // جستجوی پس‌زمینه
    if (alertData?.id) {
      fetchSupplementalInfo(user, patientId).then(async (info) => {
        console.log('[IncidentAlert] Background info result:', info);
        const updatePayload = {};
        if (info.phone) updatePayload.triggered_phone = info.phone;
        if (info.patientPhone) updatePayload.patient_phone = info.patientPhone;

        if (Object.keys(updatePayload).length > 0) {
          await sb.from('incident_alerts').update(updatePayload).eq('id', alertData.id);
          console.log('[IncidentAlert] ✅ Supplemental info updated in DB.');
        }

        if (info.anyFailed) {
          toast('⚠️ نتوانستیم شماره تلفن بیمار یا گزارش‌دهنده را به طور کامل دریافت کنیم.', 'warning', 5000);
        }
      }).catch(err => {
        console.error('[IncidentAlert] Supplemental failed entirely:', err);
      });
    }
  } catch (e) { console.error(e); }
}

function handleNewAlert(alert) {
  if (alert.triggered_by === currentUserUuid) return;
  const now = Date.now();
  if (now - lastAlertTime < 5000) return;
  lastAlertTime = now;

  if (!audioUnlocked) unlockAllAudio();
  playIncidentAlert(alert);
}

// ⭐️ آپدیت بنر در لحظه‌ای که اطلاعات در پس‌زمینه اضافه می‌شود
function handleUpdateAlert(alert) {
  const banner = document.querySelector('.incident-alert-banner');
  if (!banner) return;

  const actionBtns = banner.querySelector('.action-btns');
  if (!actionBtns) return;

  // دکمه تماس کارمند
  if (alert.triggered_phone && !actionBtns.querySelector('.call-employee-btn')) {
    actionBtns.insertAdjacentHTML('beforeend', `
      <a href="tel:${alert.triggered_phone}" class="call-employee-btn" style="background:#10b981; color:#fff; padding:6px 12px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:0.85rem; display:inline-flex; align-items:center; gap:6px;">
        📞 تماس با گزارش‌دهنده
      </a>
    `);
  }

  // دکمه تماس بیمار
  if (alert.patient_phone && !actionBtns.querySelector('.call-patient-btn')) {
    actionBtns.insertAdjacentHTML('beforeend', `
      <a href="tel:${alert.patient_phone}" class="call-patient-btn" style="background:#3b82f6; color:#fff; padding:6px 12px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:0.85rem; display:inline-flex; align-items:center; gap:6px;">
        📞 تماس با بیمار
      </a>
    `);
  }

  // دکمه نقشه
  if (alert.latitude && alert.longitude && !actionBtns.querySelector('.map-btn')) {
    const mapUrl = `https://nshn.ir/?lat=${alert.latitude}&lng=${alert.longitude}`;
    actionBtns.insertAdjacentHTML('beforeend', `
      <a href="${mapUrl}" target="_blank" class="map-btn" style="background:#fff; color:#dc2626; padding:6px 12px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:0.85rem; display:inline-flex; align-items:center; gap:6px;">
        📍 مشاهده موقعیت
      </a>
    `);
  }
}

function playIncidentAlert(alert) {
  if (isPlaying) return;
  isPlaying = true;
  try {
    showIncidentBanner(alert);
    playLongAlarm();
    setTimeout(() => {
      if (mp3Available === true) playMp3Alert(alert);
      else playTtsAlert(alert);
    }, 4500);
  } catch (e) { isPlaying = false; }
}

function playLongAlarm() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime, cycles = 6, cycleDur = 0.75;
    for (let i = 0; i < cycles; i++) {
      const start = t0 + i * cycleDur;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(550, start);
      osc.frequency.linearRampToValueAtTime(1250, start + cycleDur * 0.5);
      osc.frequency.linearRampToValueAtTime(550, start + cycleDur);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.03);
      gain.gain.setValueAtTime(0.35, start + cycleDur - 0.05);
      gain.gain.linearRampToValueAtTime(0, start + cycleDur);
      osc.start(start); osc.stop(start + cycleDur + 0.02);
    }
  } catch (e) {}
}

function playMp3Alert(alert) {
  let targetPath = (alert.alert_type === 'visit' || alert.visit_id || alert.patient_id) ? ALERT_MP3_VISIT : ALERT_MP3_QUICK;
  const audio = new Audio(targetPath);
  audio.volume = 1.0; audio.preload = 'auto'; audio.load();
  let playCount = 0; const MAX = 2;
  const playNext = () => {
    if (playCount >= MAX) { isPlaying = false; return; }
    playCount++; audio.currentTime = 0;
    const p = audio.play();
    if (p !== undefined) p.then(() => {}).catch(() => playTtsAlert(alert));
  };
  audio.onended = () => { if (playCount < MAX) setTimeout(playNext, 500); else isPlaying = false; };
  audio.onerror = () => playTtsAlert(alert);
  playNext();
}

function playTtsAlert(alert) {
  if (!('speechSynthesis' in window)) { isPlaying = false; return; }
  const name = alert.triggered_name || 'کاربر';
  let text = (alert.alert_type === 'visit' || alert.visit_id || alert.patient_id) ? `اعلام حادثه برای بیمار در ویزیت. ثبت شده توسط ${name}` : `اعلام حادثه سریع توسط ${name}`;
  if (alert.location) text += `. محل حادثه: ${alert.location}`;

  const trySpeak = () => {
    const voices = window.speechSynthesis.getVoices();
    let faVoice = voices.find(v => v.lang === 'fa-IR') || voices.find(v => v.lang?.startsWith('fa'));
    window.speechSynthesis.cancel();
    let count = 0; const MAX = 2;
    const speak = () => {
      const utt = new SpeechSynthesisUtterance(text);
      if (faVoice) utt.voice = faVoice;
      utt.lang = 'fa-IR'; utt.rate = 0.85; utt.pitch = 1.05; utt.volume = 1.0;
      utt.onend = () => { count++; if (count < MAX) setTimeout(speak, 500); else isPlaying = false; };
      utt.onerror = () => { isPlaying = false; };
      window.speechSynthesis.speak(utt);
    };
    speak();
  };
  if (window.speechSynthesis.getVoices().length === 0) { window.speechSynthesis.onvoiceschanged = () => trySpeak(); setTimeout(trySpeak, 500); } else trySpeak();
}

function showIncidentBanner(alert) {
  document.querySelectorAll('.incident-alert-banner').forEach(el => el.remove());

  let actionBtnsHtml = '<div class="action-btns" style="margin-top:8px; display:flex; flex-wrap:wrap; gap:8px;">';
  
  if (alert.triggered_phone) {
    actionBtnsHtml += `<a href="tel:${alert.triggered_phone}" class="call-employee-btn" style="background:#10b981; color:#fff; padding:6px 12px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:0.85rem;">📞 تماس با گزارش‌دهنده</a>`;
  }
  
  if (alert.patient_phone) {
    actionBtnsHtml += `<a href="tel:${alert.patient_phone}" class="call-patient-btn" style="background:#3b82f6; color:#fff; padding:6px 12px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:0.85rem;">📞 تماس با بیمار</a>`;
  }

  if (alert.latitude && alert.longitude) {
    actionBtnsHtml += `<a href="https://nshn.ir/?lat=${alert.latitude}&lng=${alert.longitude}" target="_blank" class="map-btn" style="background:#fff; color:#dc2626; padding:6px 12px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:0.85rem;">📍 مشاهده موقعیت</a>`;
  }
  
  actionBtnsHtml += '</div>';

  const banner = document.createElement('div');
  banner.className = 'incident-alert-banner';
  banner.innerHTML = `
    <div class="incident-alert-content">
      <div class="incident-alert-icon">🚨</div>
      <div class="incident-alert-body">
        <div class="incident-alert-title">اعلام حادثه ${alert.alert_type === 'visit' ? '(ویزیت)' : '(سریع)'}</div>
        <div class="incident-alert-line">ثبت شده توسط: <strong>${escapeHtmlSafe(alert.triggered_name || 'کاربر')}</strong></div>
        ${alert.patient_name ? `<div class="incident-alert-line">بیمار: <strong>${escapeHtmlSafe(alert.patient_name)}</strong></div>` : ''}
        ${alert.location ? `<div class="incident-alert-line" style="background:rgba(255,255,255,0.15);padding:5px 8px;border-radius:6px;margin-top:6px;">📍 محل: <strong>${escapeHtmlSafe(alert.location)}</strong></div>` : ''}
        
        ${actionBtnsHtml}
        
        <div class="incident-alert-time">${new Date(alert.created_at).toLocaleTimeString('fa-IR')}</div>
      </div>
      <button class="incident-alert-close" title="بستن">✕</button>
    </div>
  `;

  if (!document.getElementById('incidentBannerStyle')) {
    const style = document.createElement('style');
    style.id = 'incidentBannerStyle';
    style.textContent = `
      .incident-alert-banner { position: fixed; top: 0; left: 0; right: 0; z-index: 99999; background: linear-gradient(135deg, #dc2626, #991b1b); color: #fff; box-shadow: 0 8px 32px rgba(220, 38, 38, 0.6); animation: incidentSlideDown 0.35s ease-out; padding: 14px 16px; direction: rtl; }
      @keyframes incidentSlideDown { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      .incident-alert-content { display: flex; align-items: center; gap: 14px; max-width: 700px; margin: 0 auto; }
      .incident-alert-icon { font-size: 2.5rem; animation: incidentPulse 1s infinite; }
      @keyframes incidentPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
      .incident-alert-body { flex: 1; }
      .incident-alert-title { font-size: 1.15rem; font-weight: 800; margin-bottom: 4px; }
      .incident-alert-line { font-size: 0.9rem; margin-top: 3px; opacity: 0.95; }
      .incident-alert-time { font-size: 0.75rem; opacity: 0.75; margin-top: 5px; }
      .incident-alert-close { background: rgba(255,255,255,0.2); border: none; color: #fff; width: 36px; height: 36px; border-radius: 50%; font-size: 1.2rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .incident-alert-close:active { background: rgba(255,255,255,0.35); }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(banner);
  banner.querySelector('.incident-alert-close').onclick = () => banner.remove();
  if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
}

function showSenderToast(userName) {
  document.querySelectorAll('.incident-sender-toast').forEach(el => el.remove());
  const toastEl = document.createElement('div');
  toastEl.className = 'incident-sender-toast';
  toastEl.innerHTML = `🚨 هشدار حادثه ارسال شد. در حال تکمیل اطلاعات...`;
  document.body.appendChild(toastEl);
  setTimeout(() => toastEl.remove(), 4000);
}

function escapeHtmlSafe(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
