// js/modules/settings.js
import { sb } from '../sb.js';
import { $, toast, escapeHtml } from '../utils.js';
import {
  getPermissionStatus,
  getTokenStatus,
  requestPermissionAndInit,
  initFCM,
} from '../fcm.js';
import { SUPABASE_URL } from '../config.js';

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

// ⭐️ تابع جدید: گرفتن متن توکن از جدول fcm_tokens
async function getActualTokenString() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;

    // خواندن آخرین توکن از جدول fcm_tokens
    const { data, error } = await sb.from('fcm_tokens')
      .select('token')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data ? data.token : null;
  } catch (e) {
    console.error('[SETTINGS] Error fetching token string:', e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// ⭐ فعال‌سازی هشدارها
// ═══════════════════════════════════════════════════════════════
async function enableAlertsFlow(btn) {
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال فعال‌سازی...';

  try {
    console.log('[SETTINGS] requestPermissionAndInit start');
    const res = await requestPermissionAndInit();

    const isString = typeof res === 'string';
    const token = isString ? res : (res?.token || null);
    const ok = isString ? !!res : (res?.ok === true);
    const reason = isString ? null : (res?.reason || null);

    if (ok && token) {
      toast('✅ هشدارها فعال شدند', 'success');
      await renderSettings();
      return true;
    }

    if (reason === 'denied' || reason === 'not-granted') {
      toast('مجوز داده نشد. از تنظیمات مرورگر اجازه دهید.', 'warning');
      await renderSettings();
      return false;
    }

    if (reason === 'no-vapid') {
      toast('کلید VAPID تنظیم نشده. با مدیر تماس بگیرید.', 'danger');
      btn.disabled = false;
      btn.innerHTML = originalHTML;
      return false;
    }

    if (reason === 'unsupported') {
      toast('مرورگر شما از اعلان‌ها پشتیبانی نمی‌کند.', 'danger');
      btn.disabled = false;
      btn.innerHTML = originalHTML;
      return false;
    }

    if (getPermissionStatus() === 'granted') {
      toast('مجوز داده شد ولی توکن ساخته نشد. تلاش دوباره...', 'warning');
      try {
        await initFCM();
        await renderSettings();
        return true;
      } catch (e) {
        console.error('[SETTINGS] initFCM retry failed:', e);
        toast('خطا: ' + (e.message || 'نامشخص'), 'danger');
      }
    } else {
      toast('خطا در فعال‌سازی: ' + (reason || 'نامشخص'), 'danger');
    }

    btn.disabled = false;
    btn.innerHTML = originalHTML;
    return false;
  } catch (e) {
    console.error('[SETTINGS] enableAlertsFlow error:', e);
    toast('خطا: ' + (e.message || 'نامشخص'), 'danger');
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// ⭐ تلاش دوباره توکن
// ═══════════════════════════════════════════════════════════════
async function retryTokenFlow(btn) {
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ساخت توکن...';

  try {
    console.log('[SETTINGS] retryToken — calling initFCM');
    const res = await initFCM();

    const failed = res && res.ok === false;
    if (failed) {
      const reason = res.reason || 'نامشخص';
      if (reason === 'no-token') {
        toast('توکن ساخته نشد. اتصال اینترنت و Service Worker را چک کنید.', 'danger');
      } else if (reason === 'no-messaging') {
        toast('Firebase Messaging در دسترس نیست. اپ را دوباره باز کنید.', 'danger');
      } else {
        toast('خطا: ' + reason, 'danger');
      }
      btn.disabled = false;
      btn.innerHTML = originalHTML;
      return false;
    }

    const after = await getTokenStatus();
    if (after.saved) {
      toast('✅ توکن ساخته و ذخیره شد', 'success');
      await renderSettings();
      return true;
    }

    toast('⚠️ توکن ساخته شد ولی در سرور ذخیره نشد. RLS را چک کنید.', 'warning');
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    return false;
  } catch (e) {
    console.error('[SETTINGS] retryToken error:', e);
    toast('خطا: ' + (e.message || 'نامشخص'), 'danger');
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// ⭐ ارسال نوتیف آزمایشی
// ═══════════════════════════════════════════════════════════════
async function testNotificationFlow(btn) {
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ارسال...';

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('نشست کاربری یافت نشد');

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

    if (data.ok && data.sent > 0) {
      toast(`✅ نوتیف آزمایشی ارسال شد (${data.sent} دستگاه)`, 'success');
    } else if (data.ok && data.sent === 0) {
      toast('⚠️ ارسال شد ولی به هیچ دستگاهی نرسید', 'warning');
    } else {
      toast('❌ ' + (data.message || data.error || 'خطا'), 'danger');
    }
  } catch (e) {
    console.error('[Test] error:', e);
    toast('❌ خطا: ' + (e.message || ''), 'danger');
  }

  btn.disabled = false;
  btn.innerHTML = originalHTML;
}

// ═══════════════════════════════════════════════════════════════
// ⭐ Render
// ═══════════════════════════════════════════════════════════════
async function renderSettings() {
  const body = $('settingsBody');
  if (!body) return;

  const perm = getPermissionStatus();
  const tokenStatus = await getTokenStatus();
  const actualTokenString = await getActualTokenString(); // ⭐️ دریافت متن توکن

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

  const fullyActive = perm === 'granted' && tokenStatus.saved;

  body.innerHTML = `
    <div class="alert ${fullyActive ? 'alert-success' : 'alert-info'}" style="border-radius:12px;">
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

    <!-- ⭐️ بخش نمایش توکن متنی -->
    <div class="card mb-3 border-primary" style="background:#f8fafc;">
      <div class="card-body p-3">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <label class="form-label mb-0 fw-bold small text-primary">توکن دستگاه شما (API Token):</label>
          ${actualTokenString ? `
            <button class="btn btn-sm btn-outline-primary" id="btnCopyToken" title="کپی توکن">
              <i class="bi bi-clipboard"></i> کپی
            </button>
          ` : ''}
        </div>
        <textarea class="form-control text-muted" id="settingsTokenView" rows="3" readonly dir="ltr" style="font-size:0.75rem; font-family:monospace; background:#fff; resize:none;">${actualTokenString ? escapeHtml(actualTokenString) : 'توکنی یافت نشد (ابتدا هشدارها را فعال کنید)'}</textarea>
      </div>
    </div>

    ${perm === 'unsupported' ? `
      <div class="alert alert-warning small">مرورگر شما از اعلان‌ها پشتیبانی نمی‌کند.</div>
    ` : ''}

    ${perm === 'default' ? `
      <button class="btn btn-primary w-100 mb-2 py-3" id="btnEnableAlerts">
        <i class="bi bi-bell-fill"></i> فعال‌سازی هشدارها
      </button>
    ` : ''}

    ${perm === 'granted' && !tokenStatus.saved ? `
      <button class="btn btn-warning w-100 mb-2 py-3" id="btnRetryToken">
        <i class="bi bi-arrow-clockwise"></i> تلاش دوباره برای ساخت توکن
      </button>
    ` : ''}

    ${perm === 'granted' && tokenStatus.saved ? `
      <button class="btn btn-success w-100 mb-2 py-3" id="btnTestNotif">
        <i class="bi bi-send"></i> ارسال نوتیف آزمایشی
      </button>
    ` : ''}

    ${perm === 'denied' ? `
      <div class="alert alert-danger small">
        <strong><i class="bi bi-info-circle"></i> دسترسی به اعلان مسدود شده است</strong>
        <div style="margin-top:8px;line-height:1.9;">
          <strong>اندروید:</strong> تنظیمات ← برنامه‌ها ← مرورگر ← اعلان‌ها ← <strong>فعال</strong>
          <br><strong>کروم دسکتاپ:</strong> آیکون 🔒 کنار آدرس ← Notifications ← <strong>Allow</strong>
          <br><strong>آیفون (Safari):</strong> Settings ← Safari ← Advanced ← Website Data
          <br>بعد از تنظیم، این صفحه را <strong>رفرش</strong> کنید.
        </div>
        <button class="btn btn-outline-secondary w-100 mt-3" id="btnReloadPage">
          <i class="bi bi-arrow-clockwise"></i> رفرش صفحه
        </button>
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

  const btnEnable = $('btnEnableAlerts');
  if (btnEnable) btnEnable.onclick = () => enableAlertsFlow(btnEnable);

  const btnRetry = $('btnRetryToken');
  if (btnRetry) btnRetry.onclick = () => retryTokenFlow(btnRetry);

  const btnTest = $('btnTestNotif');
  if (btnTest) btnTest.onclick = () => testNotificationFlow(btnTest);

  const btnReload = $('btnReloadPage');
  if (btnReload) btnReload.onclick = () => location.reload();

  // ⭐️ کپی توکن
  const btnCopy = $('btnCopyToken');
  if (btnCopy) {
    btnCopy.onclick = () => {
      const tokenText = $('settingsTokenView').value;
      if (tokenText && tokenText !== 'توکنی یافت نشد (ابتدا هشدارها را فعال کنید)') {
        navigator.clipboard.writeText(tokenText).then(() => {
          toast('✅ توکن کپی شد', 'success');
        }).catch(() => {
          toast('خطا در کپی کردن', 'danger');
        });
      }
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
