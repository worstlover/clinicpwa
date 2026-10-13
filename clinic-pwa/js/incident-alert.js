// js/incident-alert.js
// ═══════════════════════════════════════════════════════
// سیستم هشدار حادثه (Realtime + TTS)
// ═══════════════════════════════════════════════════════
import { sb } from './sb.js';

const ALLOWED_ROLES = ['Nurse', 'doctor', 'safety', 'Supervisor'];
const BEEP_DURATION = 1.2;  // ثانیه

let currentUserRole = null;
let currentUserUuid = null;
let alertChannel = null;
let isPlaying = false;
let lastAlertTime = 0;

// ═══════════════════════════════════════════════════════
// راه‌اندازی listener - بعد از لاگین صدا زده می‌شه
// ═══════════════════════════════════════════════════════
export async function initIncidentAlertListener() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      console.warn('[Alert] No user, skipping listener');
      return;
    }

    currentUserUuid = user.id;

    // گرفتن نقش از auth_user_groups با استفاده از django_user_id
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

        if (groups?.length) {
          currentUserRole = groups[0].name;
        }
      }
    }

    console.log('[Alert] User role:', currentUserRole);

    if (!ALLOWED_ROLES.includes(currentUserRole)) {
      console.log('[Alert] Role not in allowed list, no listener');
      return;
    }

    // اگه channel قبلی داشتیم، پاک کن
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
// ارسال هشدار - از create.js وقتی دکمه "حادثه" زده شد صدا بزن
// ═══════════════════════════════════════════════════════
export async function broadcastIncidentAlert({ patientName, patientId, visitId }) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      console.warn('[Alert] No user, cannot broadcast');
      return;
    }

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
  } catch (e) {
    console.error('[Alert] broadcast error:', e);
  }
}

// ═══════════════════════════════════════════════════════
// دریافت هشدار جدید
// ═══════════════════════════════════════════════════════
function handleNewAlert(alert) {
  console.log('[Alert] 📥 New alert:', alert);

  // خودم که فرستادم، پخش نکن
  if (alert.triggered_by === currentUserUuid) {
    console.log('[Alert] Self alert, skipping');
    return;
  }

  // Throttle: حداقل ۳ ثانیه بین دو هشدار
  const now = Date.now();
  if (now - lastAlertTime < 3000) {
    console.log('[Alert] Throttled');
    return;
  }
  lastAlertTime = now;

  playIncidentAlert(alert);
}

// ═══════════════════════════════════════════════════════
// پخش بوق + TTS
// ═══════════════════════════════════════════════════════
function playIncidentAlert(alert) {
  if (isPlaying) {
    console.log('[Alert] Already playing, skipping');
    return;
  }
  isPlaying = true;

  try {
    // ۱. بوق
    playBeep();

    // ۲. TTS بعد از بوق
    setTimeout(() => {
      const name = alert.triggered_name || 'کاربر';
      const text = `اعلام حادثه توسط ${name}`;
      speakTwice(text);
    }, 1300);

  } catch (e) {
    console.error('[Alert] play failed:', e);
    isPlaying = false;
  }
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + BEEP_DURATION);

    osc.start();
    osc.stop(ctx.currentTime + BEEP_DURATION);
  } catch (e) {
    console.warn('[Alert] beep failed:', e);
  }
}

function speakTwice(text) {
  if (!('speechSynthesis' in window)) {
    console.warn('[Alert] TTS not supported on this browser');
    isPlaying = false;
    return;
  }

  window.speechSynthesis.cancel();

  let count = 0;
  const MAX = 2;

  const speak = () => {
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'fa-IR';
    utt.rate = 0.9;
    utt.pitch = 1.0;
    utt.volume = 1.0;

    utt.onend = () => {
      count++;
      if (count < MAX) {
        setTimeout(speak, 600);
      } else {
        isPlaying = false;
        console.log('[Alert] ✅ Finished playing');
      }
    };

    utt.onerror = (e) => {
      console.warn('[Alert] TTS error:', e);
      isPlaying = false;
    };

    window.speechSynthesis.speak(utt);
  };

  speak();
}
