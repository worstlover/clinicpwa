// js/referral-alert.js
// ═══════════════════════════════════════════════════════
// سیستم هشدار ویزیت ارجاعی (Realtime + پیجر + MP3/TTS)
// ═══════════════════════════════════════════════════════
import { sb } from './sb.js';

const REFERRAL_MP3_PATH = './sounds/referral-alert.mp3';

let currentUserUuid = null;
let alertChannel   = null;
let isPlaying      = false;
let lastAlertTime  = 0;
let mp3Available   = null;

// ═══════════════════════════════════════════════════════
// راه‌اندازی listener (از auth.js بعد از لاگین صدا بزن)
// ═══════════════════════════════════════════════════════
export async function initReferralAlertListener() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    currentUserUuid = user.id;
    console.log('[Referral] User uuid:', currentUserUuid);

    // چک MP3
    checkMp3Availability();

    // 🌟 چک هشدارهای خوانده‌نشده‌ی قبلی (از زمانی که آفلاین بوده)
    await checkPendingReferralAlerts();

    // Realtime listener
    if (alertChannel) {
      await sb.removeChannel(alertChannel);
      alertChannel = null;
    }

    alertChannel = sb.channel('referral_alerts_live')
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'visit_referral_alerts',
          filter: `target_user_uuid=eq.${currentUserUuid}`,   // فقط هشدارهای خودم
        },
        (payload) => {
          console.log('[Referral] 📥 New alert:', payload.new);
          playReferralAlert(payload.new);
        }
      )
      .subscribe((status) => {
        console.log('[Referral] Realtime status:', status);
      });

  } catch (e) {
    console.error('[Referral] init failed:', e);
  }
}

// ═══════════════════════════════════════════════════════
// ارسال هشدار - از فایل refer_visit.js یا هرجایی که ارجاع انجام می‌شه صدا بزن
// ورودی: djangoUserId (عدد) یا targetUuid (UUID)
// ═══════════════════════════════════════════════════════
export async function broadcastVisitReferralAlert({ 
  visitId, 
  patientName, 
  targetDjangoUserId = null,   // اگه فقط django id داری
  targetUuid = null            // یا اگه uuid داری
}) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    // 🌟 پیدا کردن UUID کاربر هدف از django id
    let finalTargetUuid = targetUuid;

    if (!finalTargetUuid && targetDjangoUserId) {
      const { data: mapping, error } = await sb
        .from('user_mapping')
        .select('uuid')
        .eq('django_user_id', targetDjangoUserId)
        .maybeSingle();

      if (error || !mapping) {
        console.error('[Referral] Target user not found:', targetDjangoUserId);
        return;
      }
      finalTargetUuid = mapping.uuid;
    }

    if (!finalTargetUuid) {
      console.error('[Referral] No target uuid');
      return;
    }

    const referrerName = user.user_metadata?.full_name || user.email || 'کاربر';

    const { error: insertErr } = await sb.from('visit_referral_alerts').insert({
      visit_id:          visitId,
      target_user_uuid:  finalTargetUuid,
      patient_name:      patientName || '',
      referred_by_uuid:  user.id,
      referred_by_name:  referrerName,
    });

    if (insertErr) {
      console.error('[Referral] Insert failed:', insertErr);
      return;
    }

    console.log('[Referral] ✅ Broadcasted to:', finalTargetUuid);
  } catch (e) {
    console.error('[Referral] broadcast error:', e);
  }
}

// ═══════════════════════════════════════════════════════
// چک هشدارهای قبلی (وقتی کاربر تازه لاگین می‌کنه)
// ═══════════════════════════════════════════════════════
async function checkPendingReferralAlerts() {
  try {
    const { data, error } = await sb
      .from('visit_referral_alerts')
      .select('*')
      .eq('target_user_uuid', currentUserUuid)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('[Referral] Check pending failed:', error);
      return;
    }

    if (!data?.length) {
      console.log('[Referral] No pending alerts');
      return;
    }

    console.log(`[Referral] ${data.length} pending alert(s) found`);

    // آخرین رو پخش کن (با کمی تاخیر بعد از لود)
    const latest = data[0];
    setTimeout(() => playReferralAlert(latest), 1500);

    // همه رو read کن
    const ids = data.map(a => a.id);
    await sb.from('visit_referral_alerts')
      .update({ is_read: true })
      .in('id', ids);

  } catch (e) {
    console.error('[Referral] checkPending error:', e);
  }
}

// ═══════════════════════════════════════════════════════
// پخش هشدار
// ═══════════════════════════════════════════════════════
function playReferralAlert(alert) {
  if (isPlaying) {
    console.log('[Referral] Already playing');
    return;
  }

  const now = Date.now();
  if (now - lastAlertTime < 3000) {
    console.log('[Referral] Throttled');
    return;
  }
  lastAlertTime = now;
  isPlaying = true;

  try {
    showReferralBanner(alert);
    playReferralPager();

    setTimeout(() => {
      if (mp3Available === true) {
        playMp3Alert();
      } else {
        playTtsAlert(alert);
      }
    }, 1400);

  } catch (e) {
    console.error('[Referral] play failed:', e);
    isPlaying = false;
  }
}

// ═══════════════════════════════════════════════════════
// 🔔 پیجر مخصوص ارجاع (دینگ... دینگ‌دونگ)
// ═══════════════════════════════════════════════════════
function playReferralPager() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();

    const t0 = ctx.currentTime;

    const playBell = (startTime, freq, duration, volume = 0.5) => {
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.type = 'sine';
      osc1.frequency.value = freq;

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2.76;

      const harmVol = volume * 0.25;

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

    // 🌟 الگوی متفاوت از حادثه: "دینگ... دونگ" (فقط دو نت، نرم‌تر)
    playBell(t0 + 0.00, 988, 0.22, 0.4);   // B5 - تیز
    playBell(t0 + 0.35, 740, 0.55, 0.5);   // F#5 - پایین‌تر و طولانی‌تر

  } catch (e) {
    console.warn('[Referral] pager failed:', e);
  }
}

// ═══════════════════════════════════════════════════════
// چک MP3
// ═══════════════════════════════════════════════════════
async function checkMp3Availability() {
  try {
    const res = await fetch(REFERRAL_MP3_PATH, { method: 'HEAD' });
    mp3Available = res.ok;
    console.log('[Referral] MP3 available:', mp3Available);
  } catch (e) {
    mp3Available = false;
  }
}

// ═══════════════════════════════════════════════════════
// پخش MP3
// ═══════════════════════════════════════════════════════
function playMp3Alert() {
  const audio = new Audio(REFERRAL_MP3_PATH);
  audio.volume = 1.0;

  let count = 0;
  const MAX = 2;

  const playNext = () => {
    if (count >= MAX) {
      isPlaying = false;
      console.log('[Referral] ✅ MP3 finished');
      return;
    }
    count++;
    audio.currentTime = 0;
    audio.play().catch(err => {
      console.warn('[Referral] MP3 play error:', err);
      playTtsAlert({});
    });
  };

  audio.onended = () => {
    if (count < MAX) setTimeout(playNext, 500);
    else isPlaying = false;
  };

  playNext();
}

// ═══════════════════════════════════════════════════════
// TTS
// ═══════════════════════════════════════════════════════
function playTtsAlert(alert) {
  if (!('speechSynthesis' in window)) {
    isPlaying = false;
    return;
  }

  const name = alert.referred_by_name || 'کاربر';
  const text = `ویزیت جدید برای شما ارجاع شد. ارجاع از ${name}`;

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
// بنر آبی/بنفش برای ارجاع
// ═══════════════════════════════════════════════════════
function showReferralBanner(alert) {
  document.querySelectorAll('.referral-alert-banner').forEach(el => el.remove());

  const banner = document.createElement('div');
  banner.className = 'referral-alert-banner';
  banner.innerHTML = `
    <div class="referral-alert-content">
      <div class="referral-alert-icon">📩</div>
      <div class="referral-alert-body">
        <div class="referral-alert-title">ویزیت ارجاعی جدید</div>
        <div class="referral-alert-line">
          ارجاع از: <strong>${escapeHtmlSafe(alert.referred_by_name || 'کاربر')}</strong>
        </div>
        ${alert.patient_name ? `
          <div class="referral-alert-line">
            بیمار: <strong>${escapeHtmlSafe(alert.patient_name)}</strong>
          </div>
        ` : ''}
        <div class="referral-alert-time">
          ${new Date(alert.created_at).toLocaleTimeString('fa-IR')}
        </div>
      </div>
      <button class="referral-alert-close" title="بستن">✕</button>
    </div>
  `;

  if (!document.getElementById('referralBannerStyle')) {
    const style = document.createElement('style');
    style.id = 'referralBannerStyle';
    style.textContent = `
      .referral-alert-banner {
        position: fixed;
        top: 0; left: 0; right: 0;
        z-index: 99999;
        background: linear-gradient(135deg, #0d6efd, #4c1d95);
        color: #fff;
        box-shadow: 0 8px 32px rgba(13, 110, 253, 0.6);
        animation: referralSlideDown 0.35s ease-out;
        padding: 14px 16px;
        direction: rtl;
      }
      @keyframes referralSlideDown {
        from { transform: translateY(-100%); opacity: 0; }
        to   { transform: translateY(0);     opacity: 1; }
      }
      .referral-alert-content {
        display: flex;
        align-items: center;
        gap: 14px;
        max-width: 700px;
        margin: 0 auto;
      }
      .referral-alert-icon {
        font-size: 2.5rem;
        animation: referralPulse 1s infinite;
      }
      @keyframes referralPulse {
        0%, 100% { transform: scale(1); }
        50%      { transform: scale(1.15); }
      }
      .referral-alert-body { flex: 1; }
      .referral-alert-title {
        font-size: 1.15rem;
        font-weight: 800;
        margin-bottom: 4px;
      }
      .referral-alert-line {
        font-size: 0.9rem;
        margin-top: 3px;
        opacity: 0.95;
      }
      .referral-alert-time {
        font-size: 0.75rem;
        opacity: 0.75;
        margin-top: 5px;
      }
      .referral-alert-close {
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
      .referral-alert-close:active { background: rgba(255,255,255,0.35); }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(banner);

  banner.querySelector('.referral-alert-close').onclick = () => {
    banner.remove();
  };

  // لرزش ملایم‌تر از حادثه
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200]);
  }

  // خودکار بعد از ۱۵ ثانیه محو شود
  setTimeout(() => {
    if (banner.parentNode) banner.remove();
  }, 15000);
}

// ═══════════════════════════════════════════════════════
// Helper
// ═══════════════════════════════════════════════════════
function escapeHtmlSafe(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
