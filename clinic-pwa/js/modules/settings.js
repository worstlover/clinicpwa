// js/modules/settings.js
// ═══════════════════════════════════════════════════════
// صفحه تنظیمات هشدارها
// ═══════════════════════════════════════════════════════
import { sb } from '../sb.js';
import { $, toast, escapeHtml } from '../utils.js';
import { getPermissionStatus } from '../fcm.js';

let currentPrefs = {
  incident_alerts_mode: 'shift',
  referral_alerts_enabled: true,
};

export async function openSettings() {
  const c = $('profileContent');   // یا هر کانتینری که استفاده می‌کنی
  if (!c) {
    console.warn('[Settings] No container found');
    return;
  }

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
  renderSettings();
}

async function loadPrefs() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const { data, error } = await sb
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[Settings] Load failed:', error);
      return;
    }

    if (data) {
      currentPrefs = {
        incident_alerts_mode: data.incident_alerts_mode || 'shift',
        referral_alerts_enabled: data.referral_alerts_enabled ?? true,
      };
    } else {
      // ساخت پیش‌فرض
      await sb.from('user_notification_preferences').insert({
        user_id: user.id,
        incident_alerts_mode: 'shift',
        referral_alerts_enabled: true,
      });
    }
  } catch (e) {
    console.error(e);
  }
}

function renderSettings() {
  const body = $('settingsBody');
  if (!body) return;

  const perm = getPermissionStatus();

  // پیام درخواست اجازه
  let permAlert = '';
  if (perm === 'default') {
    permAlert = `
      <div class="alert alert-warning small">
        <i class="bi bi-exclamation-triangle"></i>
        برای دریافت هشدار در پس‌زمینه، باید اجازه نوتیفیکیشن بدی.
        <button class="btn btn-sm btn-warning mt-2 w-100" id="btnRequestPerm">
          <i class="bi bi-bell"></i> اجازه دادن
        </button>
      </div>`;
  } else if (perm === 'denied') {
    permAlert = `
      <div class="alert alert-danger small">
        <i class="bi bi-x-circle"></i>
        <strong>نوتیفیکیشن مسدوده.</strong> برای فعال‌سازی:
        توی تنظیمات مرورگر، برای این سایت نوتیفیکیشن رو فعال کن.
      </div>`;
  } else if (perm === 'unsupported') {
    permAlert = `
      <div class="alert alert-secondary small">
        <i class="bi bi-info-circle"></i>
        مرورگر شما از نوتیفیکیشن پشتیبانی نمی‌کند.
      </div>`;
  } else if (perm === 'granted') {
    permAlert = `
      <div class="alert alert-success small">
        <i class="bi bi-check-circle-fill"></i>
        نوتیفیکیشن فعال است. ✅
      </div>`;
  }

  body.innerHTML = `
    ${permAlert}

    <h6 class="mt-3 mb-3" style="font-weight:700;">
      <i class="bi bi-exclamation-triangle-fill" style="color:#dc2626;"></i>
      دریافت هشدار حادثه
    </h6>
    <p class="small muted mb-3">
      در چه مواقعی می‌خواهی هشدار حادثه دریافت کنی؟
    </p>

    <div class="option-list">
      <label class="option-card ${currentPrefs.incident_alerts_mode === 'always' ? 'selected' : ''}" 
             data-mode="always">
        <input type="radio" name="incidentMode" value="always" 
               ${currentPrefs.incident_alerts_mode === 'always' ? 'checked' : ''}>
        <div class="option-icon">🔔</div>
        <div class="option-body">
          <div class="option-title">همیشه</div>
          <div class="option-desc">حتی اگه امروز لاگین نکرده باشم</div>
        </div>
      </label>

      <label class="option-card ${currentPrefs.incident_alerts_mode === 'shift' ? 'selected' : ''}" 
             data-mode="shift">
        <input type="radio" name="incidentMode" value="shift"
               ${currentPrefs.incident_alerts_mode === 'shift' ? 'checked' : ''}>
        <div class="option-icon">🌅</div>
        <div class="option-body">
          <div class="option-title">فقط شیفت فعال</div>
          <div class="option-desc">اگه از ساعت ۷ صبح امروز لاگین کرده باشم</div>
        </div>
      </label>

      <label class="option-card ${currentPrefs.incident_alerts_mode === 'never' ? 'selected' : ''}" 
             data-mode="never">
        <input type="radio" name="incidentMode" value="never"
               ${currentPrefs.incident_alerts_mode === 'never' ? 'checked' : ''}>
        <div class="option-icon">🔕</div>
        <div class="option-body">
          <div class="option-title">هرگز</div>
          <div class="option-desc">هیچ هشدار حادثه‌ای دریافت نکن</div>
        </div>
      </label>
    </div>

    <hr class="my-4">

    <h6 class="mb-3" style="font-weight:700;">
      <i class="bi bi-envelope-fill" style="color:#0d6efd;"></i>
      دریافت هشدار ارجاع ویزیت
    </h6>
    <div class="toggle-box ${currentPrefs.referral_alerts_enabled ? 'active' : ''}" id="referralToggle">
      <input type="checkbox" class="big-checkbox" id="referralEnabled"
             ${currentPrefs.referral_alerts_enabled ? 'checked' : ''}>
      <label for="referralEnabled">
        دریافت هشدار وقتی ویزیتی به من ارجاع می‌شود
      </label>
    </div>

    <div class="alert alert-info small mt-4">
      <i class="bi bi-info-circle"></i>
      تغییرات به‌صورت خودکار ذخیره می‌شوند.
    </div>
  `;

  // استایل‌های inline
  if (!document.getElementById('settingsStyle')) {
    const style = document.createElement('style');
    style.id = 'settingsStyle';
    style.textContent = `
      .option-list { display: flex; flex-direction: column; gap: 10px; }
      .option-card {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 16px;
        border: 2px solid #e2e8f0;
        border-radius: 14px;
        cursor: pointer;
        background: #fff;
        transition: all 0.15s;
        text-align: right;
      }
      .option-card:active { transform: scale(0.98); }
      .option-card.selected {
        border-color: #0d6efd;
        background: #eff6ff;
        box-shadow: 0 4px 12px rgba(13, 110, 253, 0.15);
      }
      .option-card input[type="radio"] {
        margin: 0;
        flex-shrink: 0;
        accent-color: #0d6efd;
        width: 20px;
        height: 20px;
      }
      .option-icon { font-size: 1.8rem; flex-shrink: 0; }
      .option-body { flex: 1; }
      .option-title {
        font-weight: 700;
        font-size: 0.95rem;
        color: #1e293b;
      }
      .option-desc {
        font-size: 0.75rem;
        color: #64748b;
        margin-top: 2px;
      }
    `;
    document.head.appendChild(style);
  }

  // رویدادها
  const requestBtn = $('btnRequestPerm');
  if (requestBtn) {
    requestBtn.onclick = async () => {
      const { initFCM } = await import('../fcm.js');
      await initFCM();
      renderSettings();
    };
  }

  // انتخاب mode
  document.querySelectorAll('.option-card[data-mode]').forEach(card => {
    card.onclick = async () => {
      const mode = card.dataset.mode;
      if (mode === currentPrefs.incident_alerts_mode) return;

      // آپدیت UI
      document.querySelectorAll('.option-card[data-mode]').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      card.querySelector('input').checked = true;

      // ذخیره
      currentPrefs.incident_alerts_mode = mode;
      await savePrefs();

      // 🌟 اگه "همیشه" یا "شیفت" انتخاب شد و permission نداشتیم، درخواست کن
      if ((mode === 'always' || mode === 'shift') && getPermissionStatus() === 'default') {
        const { initFCM } = await import('../fcm.js');
        await initFCM();
        renderSettings();
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

    const { error } = await sb
      .from('user_notification_preferences')
      .upsert({
        user_id: user.id,
        incident_alerts_mode: currentPrefs.incident_alerts_mode,
        referral_alerts_enabled: currentPrefs.referral_alerts_enabled,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      console.error('[Settings] Save failed:', error);
      toast('خطا در ذخیره تنظیمات', 'danger');
    } else {
      toast('✅ تنظیمات ذخیره شد', 'success');
    }
  } catch (e) {
    console.error(e);
  }
}
