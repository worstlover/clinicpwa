// js/incident-alert.js
// ═══════════════════════════════════════════════════════
// سیستم هشدار حادثه (Realtime + آژیر طولانی + MP3/TTS + بنر)
// ═══════════════════════════════════════════════════════
import { sb } from './sb.js';

const ALLOWED_ROLES = ['Nurse', 'doctor', 'safety', 'Supervisor'];
const ALERT_MP3_PATH = './sounds/incident-alert1.mp3';

let currentUserRole = null;
let currentUserUuid = null;
let alertChannel = null;
let isPlaying = false;
let lastAlertTime = 0;
let mp3Available = null;

// ═══════════════════════════════════════════════════════
// راه‌اندازی listener
// ═══════════════════════════════════════════════════════
export async function initIncidentAlertListener() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    currentUserUuid = user.id;

    const djangoUserId = user.user_metadata?.django_user_id;
    if (djangoUserId) {
      const { data: userGroups } = await sb
        .from('auth_user_groups')
        .select('group_id')
        .eq('user_id', djangoUserId);

      if (userGroups?.length) {
        const groupIds = userGroups.map(r => r.group_id);
        const { data: groups } = await sb
          .from('auth_group')
          .select('name')
          .in('id', groupIds);

        if (groups?.length) currentUserRole = groups[0].name;
      }
    }

    console.log('[Alert] User role:', currentUserRole);

    if (!ALLOWED_ROLES.includes(currentUserRole)) {
      console.log('[Alert] Role not allowed');
      return;
    }

    checkMp3Availability();

    if (alertChannel) {
      await sb.removeChannel(alertChannel);
      alertChannel = null;
    }

    alertChannel = sb.channel('incident_alerts_live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'incident_alerts' },
        (payload) => handleNewAlert(payload.new)
      )
      .subscribe((status) => {
        console.log('[Alert] Realtime status:', status);
      });

  } catch (e) {
    console.error('[Alert] init failed:', e);
  }
}

async function checkMp3Availability() {
  try {
    const res = await fetch(ALERT_MP3_PATH, { method: 'HEAD' });
    mp3Available = res.ok;
    console.log('[Alert] MP3 available:', mp3Available);
  } catch (e) {
    mp3Available = false;
  }
}

// ═══════════════════════════════════════════════════════
// ارسال هشدار (از create.js یا quick-incident.js)
// ═══════════════════════════════════════════════════════
export async function broadcastIncidentAlert({ patientName, patientId, visitId, location }) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const userName = user.user_metadata?.full_name || user.email || 'کاربر';

    const { error } = await sb.from('incident_alerts').insert({
      triggered_by:   user.id,
      triggered_name: userName,
      patient_id:     patientId || null,
      patient_name:   patientName || null,
      visit_id:       visitId || null,
      location:       location || null,      // 🌟 جدید
    });

    if (error) {
      console.error('[Alert] Broadcast failed:', error);
      return;
    }

    console.log('[Alert] ✅ Broadcasted by:', userName);
    showSenderToast(userName);
  } catch (e) {
    console.error('[Alert] broadcast error:', e);
  }
}

// ═══════════════════════════════════════════════════════
// دریافت هشدار جدید
// ═══════════════════════════════════════════════════════
function handleNewAlert(alert) {
  console.log('[Alert] 📥 New alert:', alert);

  if (alert.triggered_by === currentUserUuid) {
    console.log('[Alert] Self alert, skipping');
    return;
  }

  const now = Date.now();
  if (now - lastAlertTime < 5000) {
    console.log('[Alert] Throttled');
    return;
  }
  lastAlertTime = now;

  playIncidentAlert(alert);
}

// ═══════════════════════════════════════════════════════
// پخش هشدار (آژیر → صدا)
// ═══════════════════════════════════════════════════════
function playIncidentAlert(alert) {
  if (isPlaying) {
    console.log('[Alert] Already playing');
    return;
  }
  isPlaying = true;

  try {
    showIncidentBanner(alert);
    playLongAlarm();   // 🌟 آژیر طولانی

    // 🌟 بعد از آژیر (~۴.۵ ثانیه)، فایل صوتی
    setTimeout(() => {
      if (mp3Available === true) {
        playMp3Alert(alert);
      } else {
        playTtsAlert(alert);
      }
    }, 4500);

  } catch (e) {
    console.error('[Alert] play failed:', e);
    isPlaying = false;
  }
}

// ═══════════════════════════════════════════════════════
// 🚨 آژیر طولانی (حدود ۴.۵ ثانیه) - شبیه آمبولانس
// ═══════════════════════════════════════════════════════
function playLongAlarm() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();

    const t0 = ctx.currentTime;
    const cycles = 6;              // 🌟 ۶ سیکل بالا-پایین
    const cycleDur = 0.75;         // هر سیکل ۰.۷۵ ثانیه → کل: ۴.۵ ثانیه

    // ─── لایه ۱: Sweep اصلی (آژیر آمبولانس) ───
    for (let i = 0; i < cycles; i++) {
      const start = t0 + i * cycleDur;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';

      osc.frequency.setValueAtTime(550, start);
      osc.frequency.linearRampToValueAtTime(1250, start + cycleDur * 0.5);
      osc.frequency.linearRampToValueAtTime(550, start + cycleDur);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.03);
      gain.gain.setValueAtTime(0.35, start + cycleDur - 0.05);
      gain.gain.linearRampToValueAtTime(0, start + cycleDur);

      osc.start(start);
      osc.stop(start + cycleDur + 0.02);
    }

    // ─── لایه ۲: هارمونیک مربع (نافذتر) ───
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(1900, t0);

    gain2.gain.setValueAtTime(0, t0);
    for (let i = 0; i < cycles; i++) {
      const start = t0 + i * cycleDur;
      gain2.gain.setValueAtTime(0.12, start);
      gain2.gain.setValueAtTime(0, start + cycleDur * 0.65);
    }

    osc2.start(t0);
    osc2.stop(t0 + cycles * cycleDur + 0.02);

    // ─── لایه ۳: نویز سفید (واقعی‌تر) ───
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = Math.random() * 2 - 1;
    }

    for (let i = 0; i < cycles; i++) {
      const start = t0 + i * cycleDur;
      const noise = ctx.createBufferSource();
      const noiseGain = ctx.createGain();
      noise.buffer = noiseBuffer;
      noise.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      noiseGain.gain.setValueAtTime(0, start);
      noiseGain.gain.linearRampToValueAtTime(0.05, start + 0.03);
      noiseGain.gain.linearRampToValueAtTime(0, start + 0.12);

      noise.start(start);
      noise.stop(start + 0.15);
    }

  } catch (e) {
    console.warn('[Alert] alarm failed:', e);
  }
}

// ═══════════════════════════════════════════════════════
// 🎙️ پخش MP3 (دو بار)
// ═══════════════════════════════════════════════════════
function playMp3Alert(alert) {
  const audio = new Audio(ALERT_MP3_PATH);
  audio.volume = 1.0;

  let playCount = 0;
  const MAX = 2;

  const playNext = () => {
    if (playCount >= MAX) {
      isPlaying = false;
      console.log('[Alert] ✅ MP3 finished');
      return;
    }
    playCount++;
    audio.currentTime = 0;
    audio.play().catch(err => {
      console.warn('[Alert] MP3 play error:', err);
      playTtsAlert(alert);
    });
  };

  audio.onended = () => {
    if (playCount < MAX) setTimeout(playNext, 500);
    else isPlaying = false;
  };

  playNext();
}

// ═══════════════════════════════════════════════════════
// 🎙️ TTS با ذکر محل
// ═══════════════════════════════════════════════════════
function playTtsAlert(alert) {
  if (!('speechSynthesis' in window)) {
    isPlaying = false;
    return;
  }

  const name = alert.triggered_name || 'کاربر';
  const loc = alert.location ? `. محل حادثه: ${alert.location}` : '';
  const text = `اعلام حادثه توسط ${name}${loc}`;

  const trySpeak = () => {
    const voices = window.speechSynthesis.getVoices();
    let faVoice = voices.find(v => v.lang === 'fa-IR');
    if (!faVoice) faVoice = voices.find(v => v.lang?.startsWith('fa'));
    if (!faVoice) faVoice = voices.find(v => v.lang?.startsWith('ar'));

    window.speechSynthesis.cancel();

    let count = 0;
    const MAX = 2;

    const speak = () => {
      const utt = new SpeechSynthesisUtterance(text);
      if (faVoice) utt.voice = faVoice;
      utt.lang = 'fa-IR';
      utt.rate = 0.85;
      utt.pitch = 1.05;
      utt.volume = 1.0;

      utt.onend = () => {
        count++;
        if (count < MAX) setTimeout(speak, 500);
        else isPlaying = false;
      };

      utt.onerror = () => { isPlaying = false; };
      window.speechSynthesis.speak(utt);
    };

    speak();
  };

  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      trySpeak();
    };
    setTimeout(trySpeak, 500);
  } else {
    trySpeak();
  }
}

// ═══════════════════════════════════════════════════════
// بنر قرمز با نمایش محل
// ═══════════════════════════════════════════════════════
function showIncidentBanner(alert) {
  document.querySelectorAll('.incident-alert-banner').forEach(el => el.remove());

  const banner = document.createElement('div');
  banner.className = 'incident-alert-banner';
  banner.innerHTML = `
    <div class="incident-alert-content">
      <div class="incident-alert-icon">🚨</div>
      <div class="incident-alert-body">
        <div class="incident-alert-title">اعلام حادثه</div>
        <div class="incident-alert-line">
          ثبت شده توسط: <strong>${escapeHtmlSafe(alert.triggered_name || 'کاربر')}</strong>
        </div>
        ${alert.patient_name ? `
          <div class="incident-alert-line">
            بیمار: <strong>${escapeHtmlSafe(alert.patient_name)}</strong>
          </div>
        ` : ''}
        ${alert.location ? `
          <div class="incident-alert-line" style="background:rgba(255,255,255,0.15);padding:5px 8px;border-radius:6px;margin-top:6px;">
            📍 محل حادثه: <strong>${escapeHtmlSafe(alert.location)}</strong>
          </div>
        ` : ''}
        <div class="incident-alert-time">
          ${new Date(alert.created_at).toLocaleTimeString('fa-IR')}
        </div>
      </div>
      <button class="incident-alert-close" title="بستن">✕</button>
    </div>
  `;

  if (!document.getElementById('incidentBannerStyle')) {
    const style = document.createElement('style');
    style.id = 'incidentBannerStyle';
    style.textContent = `
      .incident-alert-banner {
        position: fixed;
        top: 0; left: 0; right: 0;
        z-index: 99999;
        background: linear-gradient(135deg, #dc2626, #991b1b);
        color: #fff;
        box-shadow: 0 8px 32px rgba(220, 38, 38, 0.6);
        animation: incidentSlideDown 0.35s ease-out;
        padding: 14px 16px;
        direction: rtl;
      }
      @keyframes incidentSlideDown {
        from { transform: translateY(-100%); opacity: 0; }
        to   { transform: translateY(0);     opacity: 1; }
      }
      .incident-alert-content {
        display: flex;
        align-items: center;
        gap: 14px;
        max-width: 700px;
        margin: 0 auto;
      }
      .incident-alert-icon {
        font-size: 2.5rem;
        animation: incidentPulse 1s infinite;
      }
      @keyframes incidentPulse {
        0%, 100% { transform: scale(1); }
        50%      { transform: scale(1.15); }
      }
      .incident-alert-body { flex: 1; }
      .incident-alert-title {
        font-size: 1.15rem;
        font-weight: 800;
        margin-bottom: 4px;
      }
      .incident-alert-line {
        font-size: 0.9rem;
        margin-top: 3px;
        opacity: 0.95;
      }
      .incident-alert-time {
        font-size: 0.75rem;
        opacity: 0.75;
        margin-top: 5px;
      }
      .incident-alert-close {
        background: rgba(255,255,255,0.2);
        border: none;
        color: #fff;
        width: 36px; height: 36px;
        border-radius: 50%;
        font-size: 1.2rem;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .incident-alert-close:active { background: rgba(255,255,255,0.35); }
      .incident-sender-toast {
        position: fixed;
        bottom: 100px;
        left: 16px; right: 16px;
        z-index: 99998;
        background: #059669;
        color: #fff;
        padding: 14px 18px;
        border-radius: 14px;
        text-align: center;
        font-weight: 700;
        font-size: 0.95rem;
        box-shadow: 0 8px 24px rgba(5, 150, 105, 0.5);
        animation: senderToastIn 0.3s ease-out;
        max-width: 500px;
        margin: 0 auto;
      }
      @keyframes senderToastIn {
        from { transform: translateY(30px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(banner);

  banner.querySelector('.incident-alert-close').onclick = () => {
    banner.remove();
  };

  if (navigator.vibrate) {
    navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
  }
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
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
