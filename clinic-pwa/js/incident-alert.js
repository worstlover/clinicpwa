// js/incident-alert.js
// ═══════════════════════════════════════════════════════
// سیستم هشدار حادثه (Realtime + پیجر + MP3/TTS + بنر بصری)
// ═══════════════════════════════════════════════════════
import { sb } from './sb.js';

const ALLOWED_ROLES = ['Nurse', 'doctor', 'safety', 'Supervisor'];

// 🌟 مسیر فایل MP3 (اختیاری)
const ALERT_MP3_PATH = './sounds/incident-alert.mp3';

let currentUserRole = null;
let currentUserUuid = null;
let alertChannel = null;
let isPlaying = false;
let lastAlertTime = 0;
let mp3Available = null;  // null = unknown, true/false بعد از چک

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
      console.log('[Alert] Role not allowed, no listener');
      return;
    }

    // 🌟 چک کن MP3 موجوده یا نه
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

// ═══════════════════════════════════════════════════════
// چک کن فایل MP3 قابل دسترسی هست یا نه
// ═══════════════════════════════════════════════════════
async function checkMp3Availability() {
  try {
    const res = await fetch(ALERT_MP3_PATH, { method: 'HEAD' });
    mp3Available = res.ok;
    console.log('[Alert] MP3 file available:', mp3Available);
  } catch (e) {
    mp3Available = false;
    console.log('[Alert] MP3 not available, will use TTS');
  }
}

// ═══════════════════════════════════════════════════════
// ارسال هشدار (از create.js)
// ═══════════════════════════════════════════════════════
export async function broadcastIncidentAlert({ patientName, patientId, visitId }) {
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
  if (now - lastAlertTime < 3000) {
    console.log('[Alert] Throttled');
    return;
  }
  lastAlertTime = now;

  playIncidentAlert(alert);
}

// ═══════════════════════════════════════════════════════
// پخش هشدار (پیجر → صدا)
// ═══════════════════════════════════════════════════════
function playIncidentAlert(alert) {
  if (isPlaying) {
    console.log('[Alert] Already playing');
    return;
  }
  isPlaying = true;

  try {
    // ۱. بنر بصری
    showIncidentBanner(alert);

    // ۲. صدای پیجر بیمارستان (دینگ دینگ دونگ)
    playHospitalPager();

    // ۳. بعد از پیجر (~۱.۵ ثانیه)، فایل صوتی پخش شه
    setTimeout(() => {
      if (mp3Available === true) {
        playMp3Alert(alert);
      } else {
        playTtsAlert(alert);
      }
    }, 1500);

  } catch (e) {
    console.error('[Alert] play failed:', e);
    isPlaying = false;
  }
}

// ═══════════════════════════════════════════════════════
// 🔔 صدای پیجر بیمارستان (دینگ دینگ دونگ)
// ═══════════════════════════════════════════════════════
function playHospitalPager() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();

    const t0 = ctx.currentTime;

    // ─── تعریف یک نُت با صدای زنگی ───
    const playBell = (startTime, freq, duration, volume = 0.5) => {
      // صدای اصلی
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.type = 'sine';
      osc1.frequency.value = freq;

      // هارمونیک دوم (زنگی‌تر می‌کنه)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2.76;  // فرکانس زنگی

      const harmVol = volume * 0.25;

      // Envelope با دیکِی نمایی (شبیه زنگ)
      gain1.gain.setValueAtTime(0, startTime);
      gain1.gain.linearRampToValueAtTime(volume, startTime + 0.005);
      gain1.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      gain2.gain.setValueAtTime(0, startTime);
      gain2.gain.linearRampToValueAtTime(harmVol, startTime + 0.005);
      gain2.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.6);

      osc1.start(startTime);
      osc1.stop(startTime + duration + 0.05);
      osc2.start(startTime);
      osc2.stop(startTime + duration + 0.05);
    };

    // ─── الگوی "دینگ دینگ دونگ" ───
    // دینگ: A5 (~880 Hz)
    // دونگ: E5 (~660 Hz) - پایین‌تر و طولانی‌تر

    playBell(t0 + 0.00, 880, 0.20, 0.45);   // دینگ
    playBell(t0 + 0.30, 880, 0.20, 0.45);   // دینگ
    playBell(t0 + 0.60, 660, 0.55, 0.55);   // دونگ (پایین‌تر و طولانی‌تر)

  } catch (e) {
    console.warn('[Alert] pager failed:', e);
  }
}

// ═══════════════════════════════════════════════════════
// 🎙️ حالت ۱: پخش MP3 (دو بار)
// ═══════════════════════════════════════════════════════
function playMp3Alert(alert) {
  const audio = new Audio(ALERT_MP3_PATH);
  audio.volume = 1.0;

  let playCount = 0;
  const MAX = 2;

  const playNext = () => {
    if (playCount >= MAX) {
      isPlaying = false;
      console.log('[Alert] ✅ MP3 playback finished');
      return;
    }
    playCount++;
    audio.currentTime = 0;
    audio.play().catch(err => {
      console.warn('[Alert] MP3 play error:', err);
      // اگه پخش نشد، برو سراغ TTS
      playTtsAlert(alert);
    });
  };

  audio.onended = () => {
    if (playCount < MAX) {
      setTimeout(playNext, 500);
    } else {
      isPlaying = false;
      console.log('[Alert] ✅ MP3 finished');
    }
  };

  playNext();
}

// ═══════════════════════════════════════════════════════
// 🎙️ حالت ۲: TTS با بهترین صدای فارسی
// ═══════════════════════════════════════════════════════
function playTtsAlert(alert) {
  if (!('speechSynthesis' in window)) {
    isPlaying = false;
    return;
  }

  const name = alert.triggered_name || 'کاربر';
  const text = `اعلام حادثه توسط ${name}`;

  const trySpeak = () => {
    const voices = window.speechSynthesis.getVoices();

    // پیدا کردن بهترین صدای فارسی
    let faVoice = voices.find(v => v.lang === 'fa-IR');
    if (!faVoice) faVoice = voices.find(v => v.lang && v.lang.startsWith('fa'));
    if (!faVoice) faVoice = voices.find(v => v.lang && v.lang.startsWith('ar'));

    console.log('[Alert] Using voice:', faVoice?.name || 'default', faVoice?.lang);

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
        if (count < MAX) {
          setTimeout(speak, 500);
        } else {
          isPlaying = false;
          console.log('[Alert] ✅ TTS finished');
        }
      };

      utt.onerror = () => {
        isPlaying = false;
      };

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
// بنر قرمز تمام‌صفحه
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
    navigator.vibrate([400, 150, 400, 150, 400, 500, 300, 100, 300]);
  }
}

// ═══════════════════════════════════════════════════════
// Toast برای فرستنده
// ═══════════════════════════════════════════════════════
function showSenderToast(userName) {
  document.querySelectorAll('.incident-sender-toast').forEach(el => el.remove());

  const toast = document.createElement('div');
  toast.className = 'incident-sender-toast';
  toast.innerHTML = `🚨 هشدار حادثه به همه کادر درمان و ایمنی ارسال شد`;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}

// ═══════════════════════════════════════════════════════
// Helper
// ═══════════════════════════════════════════════════════
function escapeHtmlSafe(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
