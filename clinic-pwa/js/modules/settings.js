// js/modules/settings.js
import { sb } from '../sb.js';
import { $, toast, escapeHtml } from '../utils.js';
import { getPermissionStatus, getTokenStatus, requestPermissionAndInit } from '../fcm.js';
import { SUPABASE_URL } from '../config.js';   // 🌟 جدید

let currentPrefs = {
  incident_alerts_mode: 'shift',
  referral_alerts_enabled: true,
};

export async function openSettings() {
  const c = $('profileContent');
  if (!c) return;

  c.innerHTML = `
    <div class="card">
      <div class="card-head"><i class="bi bi-bell-fill"></i> تنظیمات هشدارها</div>
      <div class="card-body" id="settingsBody">
        <div class="text-center py-5">
          <div class="spinner-border spinner-border-sm text-primary"></div>
        </div>
      </div>
    </div>
  `;

  await loadPrefs();
  await renderSettings();
}

async function loadPrefs() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const { data } = await sb.from('user_notification_preferences')
      .select('*').eq('user_id', user.id).maybeSingle();

    if (data) {
      currentPrefs = {
        incident_alerts_mode: data.incident_alerts_mode || 'shift',
        referral_alerts_enabled: data.referral_alerts_enabled ?? true,
      };
    } else {
      await sb.from('user_notification_preferences').insert({
        user_id: user.id,
        incident_alerts_mode: 'shift',
        referral_alerts_enabled: true,
      });
    }
  } catch (e) { console.error(e); }
}

async function renderSettings() {
  const body = $('settingsBody');
  if (!body) return;

  const perm = getPermissionStatus();
  const tokenStatus = await getTokenStatus();

  // ─── کارت وضعیت هشدارها ───
  const permColor = {
    granted: 'success', default: 'warning', denied: 'danger', unsupported: 'gray'
  }[perm] || 'gray';
  
  const permLabel = {
    granted: 'فعال ✅', default: 'داده نشده', denied: 'مسدود ❌', unsupported: 'پشتیبانی نمی‌شود'
  }[perm] || perm;

  let tokenLabel = 'ذخیره نشده';
  let tokenColor = 'danger';
  if (tokenStatus.saved) {
    tokenLabel = 'ذخیره شده ✅';
    tokenColor = 'success';
  } else if (tokenStatus.count > 0) {
    tokenLabel = 'توکن قدیمی موجود';
    tokenColor = 'warning';
  }

  let lastSeenLabel = '—';
  if (tokenStatus.lastSeen) {
    const d = new Date(tokenStatus.lastSeen);
    lastSeenLabel = d.toLocaleString('fa-IR');
  }

  body.innerHTML = `
    <div class="alert alert-info" style="border-radius:12px;">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span>وضعیت اجازه:</span>
        <span class="badge-soft ${permColor}">${permLabel}</span>
      </div>
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span>توکن FCM:</span>
        <span class="badge-soft ${tokenColor}">${tokenLabel}</span>
      </div>
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span>آخرین فعالیت:</span>
        <span class="small muted">${lastSeenLabel}</span>
      </div>
      <div class="d-flex justify-content-between align-items-center">
        <span>تعداد دستگاه‌ها:</span>
        <span class="small muted">${tokenStatus.count}</span>
      </div>
    </div>

    ${perm !== 'granted' ? `
      <button class="btn btn-primary w-100 mb-2" id="btnEnableAlerts">
        <i class="bi bi-bell-fill"></i> فعال‌سازی هشدارها
      </button>
    ` : `
      <button class="btn btn-outline-primary w-100 mb-2" id="btnTestNotif">
        <i class="bi bi-send"></i> ارسال نوتیف آزمایشی
      </button>
    `}

    ${perm === 'denied' ? `
      <div class="alert alert-danger small">
        <strong><i class="bi bi-info-circle"></i> چطور فعال کنم؟</strong>
        <div style="margin-top:8px;line-height:1.9;">
          تنظیمات گوشی ← برنامه‌ها ← کلینیک ← اعلان‌ها ← <strong>فعال کنید</strong>
          <br>
          و دسته‌ی اعلان را روی <strong>Pop on screen / Urgent</strong> بگذارید.
        </div>
      </div>
    ` : ''}

    <details class="mt-3" style="background:#f8fafc;padding:12px;border-radius:12px;">
      <summary style="cursor:pointer;font-weight:700;color:#0d6efd;">
        <i class="bi bi-gear"></i> راهنمای هشدار در پس‌زمینه (اندروید)
      </summary>
      <div style="margin-top:12px;font-size:0.85rem;line-height:2;">
        <strong>برای اینکه هشدار حتی با اپ بسته کار کند:</strong>
        <ol style="padding-right:20px;">
          <li>تنظیمات ← باتری ← <strong>Unrestricted</strong> برای این اپ</li>
          <li>خاموش کردن <strong>Pause app activity</strong> در تنظیمات اپ</li>
          <li>فعال‌سازی <strong>Autostart</strong> (شیائومی/هواوی/سامسونگ/اوپو)</li>
          <li>استثنا در <strong>Do Not Disturb</strong></li>
        </ol>
        <div class="alert alert-light small mt-2" style="margin-bottom:0;">
          💡 نمایش «بالای صفحه» (Heads-up) با تنظیم کانال اعلان در اندروید کنترل می‌شود، نه با کد.
        </div>
      </div>
    </details>

    <hr class="my-4">

    <h6 class="mt-3 mb-3" style="font-weight:700;">
      <i class="bi bi-exclamation-triangle-fill" style="color:#dc2626;"></i>
      دریافت هشدار حادثه
    </h6>
    <p class="small muted mb-3">در چه مواقعی هشدار حادثه بگیرم؟</p>

    <div class="option-list">
      ${['always', 'shift', 'never'].map(mode => {
        const meta = {
          always: { icon: '🔔', title: 'همیشه', desc: 'حتی اگه امروز لاگین نکرده باشم' },
          shift:  { icon: '🌅', title: 'فقط شیفت فعال', desc: 'از ۷ صبح امروز که لاگین کرده‌ام' },
          never:  { icon: '🔕', title: 'هرگز', desc: 'هیچ هشدار حادثه‌ای نگیرم' },
        }[mode];
        const selected = currentPrefs.incident_alerts_mode === mode ? 'selected' : '';
        return `
          <label class="option-card ${selected}" data-mode="${mode}">
            <input type="radio" name="incidentMode" value="${mode}" 
                   ${currentPrefs.incident_alerts_mode === mode ? 'checked' : ''}>
            <div class="option-icon">${meta.icon}</div>
            <div class="option-body">
              <div class="option-title">${meta.title}</div>
              <div class="option-desc">${meta.desc}</div>
            </div>
          </label>
        `;
      }).join('')}
    </div>

    <hr class="my-4">

    <h6 class="mb-3" style="font-weight:700;">
      <i class="bi bi-envelope-fill" style="color:#0d6efd;"></i>
      هشدار ارجاع ویزیت
    </h6>
    <div class="toggle-box ${currentPrefs.referral_alerts_enabled ? 'active' : ''}" id="referralToggle">
      <input type="checkbox" class="big-checkbox" id="referralEnabled"
             ${currentPrefs.referral_alerts_enabled ? 'checked' : ''}>
      <label for="referralEnabled">
        دریافت هشدار وقتی ویزیتی به من ارجاع می‌شود
      </label>
    </div>
  `;

  // استایل‌ها
  if (!document.getElementById('settingsStyle')) {
    const style = document.createElement('style');
    style.id = 'settingsStyle';
    style.textContent = `
      .option-list { display: flex; flex-direction: column; gap: 10px; }
      .option-card {
        display: flex; align-items: center; gap: 14px;
        padding: 14px 16px; border: 2px solid #e2e8f0;
        border-radius: 14px; cursor: pointer; background: #fff;
        transition: all 0.15s; text-align: right;
      }
      .option-card:active { transform: scale(0.98); }
      .option-card.selected {
        border-color: #0d6efd; background: #eff6ff;
        box-shadow: 0 4px 12px rgba(13, 110, 253, 0.15);
      }
      .option-card input[type="radio"] {
        margin: 0; flex-shrink: 0; accent-color: #0d6efd;
        width: 20px; height: 20px;
      }
      .option-icon { font-size: 1.8rem; flex-shrink: 0; }
      .option-body { flex: 1; }
      .option-title { font-weight: 700; font-size: 0.95rem; color: #1e293b; }
      .option-desc { font-size: 0.75rem; color: #64748b; margin-top: 2px; }
    `;
    document.head.appendChild(style);
  }

  // ─── رویدادها ───

  // فعال‌سازی هشدارها
  const btnEnable = $('btnEnableAlerts');
  if (btnEnable) {
    btnEnable.onclick = async () => {
      const token = await requestPermissionAndInit();
      if (token) {
        toast('✅ هشدارها فعال شد', 'success');
        await renderSettings();
      }
    };
  }

  // 🌟 نوتیف آزمایشی - اصلاح شده
  const btnTest = $('btnTestNotif');
  if (btnTest) {
    btnTest.onclick = async () => {
      btnTest.disabled = true;
      btnTest.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ارسال...';
      
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) throw new Error('نشست کاربری یافت نشد');

        console.log('[Test] Sending to:', `${SUPABASE_URL}/functions/v1/send-incident-notification`);

        // 🌟 استفاده از SUPABASE_URL از config.js
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/send-incident-notification`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ test: true }),
          }
        );

        const data = await res.json();
        console.log('[Test] Result:', data);
        
        if (data.ok && data.sent > 0) {
          toast(`✅ نوتیف آزمایشی ارسال شد (${data.sent} دستگاه)`, 'success');
        } else if (data.ok && data.sent === 0) {
          toast('⚠️ ارسال شد ولی به هیچ دستگاهی نرسید', 'warning');
        } else {
          toast('❌ ' + (data.message || data.error || 'خطا'), 'danger');
        }
      } catch (e) {
        console.error('[Test] Error:', e);
        toast('❌ خطا: ' + e.message, 'danger');
      }
      
      btnTest.disabled = false;
      btnTest.innerHTML = '<i class="bi bi-send"></i> ارسال نوتیف آزمایشی';
    };
  }

  // انتخاب mode
  document.querySelectorAll('.option-card[data-mode]').forEach(card => {
    card.onclick = async () => {
      const mode = card.dataset.mode;
      if (mode === currentPrefs.incident_alerts_mode) return;
      
      document.querySelectorAll('.option-card[data-mode]').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      card.querySelector('input').checked = true;
      currentPrefs.incident_alerts_mode = mode;
      await savePrefs();
      
      if ((mode === 'always' || mode === 'shift') && getPermissionStatus() === 'default') {
        toast('برای دریافت هشدار، دکمه «فعال‌سازی هشدارها» را بزنید', 'info');
      }
    };
  });

  // ارجاع
  const refToggle = $('referralToggle');
  if (refToggle) {
    refToggle.onclick = async () => {
      const cb = $('referralEnabled');
      cb.checked = !cb.checked;
      currentPrefs.referral_alerts_enabled = cb.checked;
      refToggle.classList.toggle('active', cb.checked);
      await savePrefs();
    };
  }
}

async function savePrefs() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { error } = await sb.from('user_notification_preferences').upsert({
      user_id: user.id,
      incident_alerts_mode: currentPrefs.incident_alerts_mode,
      referral_alerts_enabled: currentPrefs.referral_alerts_enabled,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    
    if (error) throw error;
    toast('✅ ذخیره شد', 'success');
  } catch (e) {
    console.error(e);
    toast('خطا در ذخیره', 'danger');
  }
}
