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
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
  } catch (e) {}

  try {
    const sampleRate = 8000;
    const duration = 0.05;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    
    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, numSamples * 2, true);
    
    const blob = new Blob([buffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const silent = new Audio(url);
    silent.volume = 0.001;
    silent.play().then(() => {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }).catch(e => {
      URL.revokeObjectURL(url);
    });
  } catch (e) {}
}

document.addEventListener('pointerdown', unlockAllAudio, { once: true });
document.addEventListener('touchstart', unlockAllAudio, { once: true });
document.addEventListener('click', unlockAllAudio, { once: true });

export async function initIncidentAlertListener() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    currentUserUuid = user.id;

    const djangoUserId = user.user_metadata?.django_user_id;
    if (djangoUserId) {
      const { data: userGroups } = await sb.from('auth_user_groups').select('group_id').eq('user_id', djangoUserId);
      if (userGroups?.length) {
        const groupIds = userGroups.map(r => r.group_id);
        const { data: groups } = await sb.from('auth_group').select('name').in('id', groupIds);
        if (groups?.length) currentUserRole = groups[0].name;
      }
    }

    if (!ALLOWED_ROLES.includes(currentUserRole)) return;

    checkMp3Availability();

    if (alertChannel) await sb.removeChannel(alertChannel);

    alertChannel = sb.channel('incident_alerts_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incident_alerts' }, (payload) => handleNewAlert(payload.new))
      .subscribe((status) => { console.log('[Alert] Realtime status:', status); });

  } catch (e) {}
}

async function checkMp3Availability() {
  try {
    const resQuick = await fetch(ALERT_MP3_QUICK, { method: 'HEAD' });
    const resVisit = await fetch(ALERT_MP3_VISIT, { method: 'HEAD' });
    mp3Available = resQuick.ok || resVisit.ok;
  } catch (e) {
    mp3Available = false;
  }
}

export async function broadcastIncidentAlert({ patientName, patientId, visitId, location }) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const userName = user.user_metadata?.full_name || user.email || 'کاربر';
    const userPhone = user.user_metadata?.phone || user.phone || null; 

    const { error } = await sb.from('incident_alerts').insert({
      triggered_by:   user.id,
      triggered_name: userName,
      triggered_phone: userPhone,
      patient_id:     patientId || null,
      patient_name:   patientName || null,
      visit_id:       visitId || null,
      location:       location || null,
      alert_type:     'visit'
    });

    if (error) return;
    showSenderToast(userName);
  } catch (e) {}
}

function handleNewAlert(alert) {
  if (alert.triggered_by === currentUserUuid) return;

  const now = Date.now();
  if (now - lastAlertTime < 5000) return;
  lastAlertTime = now;

  if (!audioUnlocked) unlockAllAudio();
  playIncidentAlert(alert);
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
  } catch (e) {
    isPlaying = false;
  }
}

function playLongAlarm() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    const cycles = 6;
    const cycleDur = 0.75;
    for (let i = 0; i < cycles; i++) {
      const start = t0 + i * cycleDur;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
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
  let targetPath = ALERT_MP3_QUICK;
  if (alert.alert_type === 'visit' || alert.visit_id || alert.patient_id) targetPath = ALERT_MP3_VISIT;

  const audio = new Audio(targetPath);
  audio.volume = 1.0;
  audio.preload = 'auto';
  audio.load();

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

// ═══════════════════════════════════════════════════════
// بنر قرمز (اصلاح لینک نقشه نشان)
// ═══════════════════════════════════════════════════════
function showIncidentBanner(alert) {
  document.querySelectorAll('.incident-alert-banner').forEach(el => el.remove());

  let actionBtnsHtml = '<div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:8px;">';

  // دکمه تماس تلفنی
  if (alert.triggered_phone) {
    actionBtnsHtml += `
      <a href="tel:${alert.triggered_phone}" style="background:#10b981; color:#fff; padding:6px 12px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:0.85rem; display:inline-flex; align-items:center; gap:6px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
        📞 تماس با گزارش‌دهنده
      </a>
    `;
  }

  // ⭐️ دکمه نقشه (فرمت لینک نشان اصلاح شد)
  if (alert.latitude && alert.longitude) {
    const lat = alert.latitude;
    const lng = alert.longitude;
    const mapUrl = `https://neshan.org/maps#c${lat}-${lng}-15z-0p`;
    
    actionBtnsHtml += `
      <a href="${mapUrl}" target="_blank" style="background:#fff; color:#dc2626; padding:6px 12px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:0.85rem; display:inline-flex; align-items:center; gap:6px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
        📍 مشاهده موقعیت
      </a>
    `;
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
  const toast = document.createElement('div');
  toast.className = 'incident-sender-toast';
  toast.innerHTML = `🚨 هشدار حادثه به همه کادر درمان و ایمنی ارسال شد`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function escapeHtmlSafe(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
