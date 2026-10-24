// js/modules/settings.js
import { sb } from '../sb.js';
import { $, toast, escapeHtml } from '../utils.js';
import {
  getPermissionStatus,
  getTokenStatus,
  requestPermissionAndInit,
  initFCM,
  forceRegenerateToken
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

async function getActualTokenString() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;

    const { data, error } = await sb.from('fcm_tokens')
      .select('token')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    return (data && data.length > 0) ? data[0].token : null;
  } catch (e) { return null; }
}

async function enableAlertsFlow(btn) {
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال فعال‌سازی...';

  try {
    const res = await requestPermissionAndInit();
    const token = typeof res === 'string' ? res : (res?.token || null);
    const ok = typeof res === 'string' ? !!res : (res?.ok === true);

    if (ok && token) {
      toast('✅ هشدارها فعال شدند', 'success');
      await renderSettings();
      return true;
    }

    if (res?.reason === 'denied' || res?.reason === 'not-granted') {
      toast('مجوز داده نشد. از تنظیمات مرورگر اجازه دهید.', 'warning');
      await renderSettings();
      return false;
    }

    toast('خطا در فعال‌سازی: ' + (res?.reason || 'نامشخص'), 'danger');
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    return false;
  } catch (e) {
    toast('خطا: ' + (e.message || 'نامشخص'), 'danger');
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    return false;
  }
}

async function manualRegenerateFlow(btn) {
  if (!confirm('توکن فعلی باطل شده و یک توکن جدید ساخته می‌شود. ادامه می‌دهید؟')) return;

  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ساخت...';

  try {
    const res = await forceRegenerateToken();
    if (res.ok) {
      toast('✅ توکن جدید با موفقیت ساخته و جایگزین شد', 'success');
      await renderSettings();
    } else {
      toast('خطا: ' + (res.reason || 'نامشخص'), 'danger');
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  } catch (e) {
    toast('خطا: ' + (e.message || 'نامشخص'), 'danger');
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

async function testNotificationFlow(btn) {
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ارسال...';

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('نشست کاربری یافت نشد');

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-incident-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ test: true }),
    });

    const data = await res.json();

    if (data.ok && data.sent > 0) {
      toast(`✅ نوتیف آزمایشی ارسال شد (${data.sent} دستگاه)`, 'success');
    } else if (data.ok && data.sent === 0) {
      toast('⚠️ ارسال شد ولی به هیچ دستگاهی نرسید', 'warning');
    } else {
      toast('❌ ' + (data.message || data.error || 'خطا'), 'danger');
    }
  } catch (e) {
    toast('❌ خطا: ' + (e.message || ''), 'danger');
  }

  btn.disabled = false;
  btn.innerHTML = originalHTML;
}

async function renderSettings() {
  const body = $('settingsBody');
  if (!body) return;

  const perm = getPermissionStatus();
  const tokenStatus = await getTokenStatus();
  const actualTokenString = await getActualTokenString();

  const permColor = { granted: 'success', default: 'warning', denied: 'danger', unsupported: 'gray' }[perm] || 'gray';
  const permLabel = { granted: 'فعال ✅', default: 'داده نشده', denied: 'مسدود ❌', unsupported: 'پشتیبانی نمی‌شود' }[perm] || perm;

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
    lastSeenLabel = new Date(tokenStatus.lastSeen).toLocaleString('fa-IR');
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
      <div class="d-flex justify-content-between align-items-center">
        <span>تعداد دستگاه‌ها:</span>
        <span class="small muted">${tokenStatus.count} از ۲</span>
      </div>
    </div>

    <div class="card mb-3 border-primary" style="background:#f8fafc;">
      <div class="card-body p-3">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <label class="form-label mb-0 fw-bold small text-primary">توکن دستگاه شما:</label>
          <div style="display:flex; gap:6px;">
            ${actualTokenString ? `
              <button class="btn btn-sm btn-outline-primary" id="btnCopyToken" title="کپی توکن">
                <i class="bi bi-clipboard"></i>
              </button>
            ` : ''}
            ${perm === 'granted' ? `
              <button class="btn btn-sm btn-outline-danger" id="btnRegenerateToken" title="ساخت توکن جدید">
                <i class="bi bi-arrow-clockwise"></i> ساخت مجدد
              </button>
            ` : ''}
          </div>
        </div>
        <textarea class="form-control text-muted" id="settingsTokenView" rows="2" readonly dir="ltr" style="font-size:0.75rem; font-family:monospace; background:#fff; resize:none;">${actualTokenString ? escapeHtml(actualTokenString) : 'توکنی یافت نشد'}</textarea>
      </div>
    </div>

    ${perm === 'default' ? `
      <button class="btn btn-primary w-100 mb-2 py-3" id="btnEnableAlerts">
        <i class="bi bi-bell-fill"></i> فعال‌سازی هشدارها
      </button>
    ` : ''}

    ${perm === 'granted' && tokenStatus.saved ? `
      <button class="btn btn-success w-100 mb-4 py-3" id="btnTestNotif">
        <i class="bi bi-send"></i> ارسال نوتیف آزمایشی
      </button>
    ` : ''}

    <!-- ⭐️ بخش جدید: راهنمای تنظیمات پس‌زمینه -->
    <div class="accordion mb-4" id="accordionGuide">
      <div class="accordion-item border-0 shadow-sm" style="border-radius:12px; overflow:hidden;">
        <h2 class="accordion-header" id="headingGuide">
          <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseGuide" aria-expanded="false" aria-controls="collapseGuide" style="background:#fffbeb; color:#92400e; font-weight:700;">
            <i class="bi bi-battery-charging me-2"></i> چطور نوتیف را در پس‌زمینه دریافت کنم؟
          </button>
        </h2>
        <div id="collapseGuide" class="accordion-collapse collapse" aria-labelledby="headingGuide" data-bs-parent="#accordionGuide">
          <div class="accordion-body p-3" style="background:#fff;">
            <p class="small text-muted mb-3">
              برای اینکه وقتی برنامه بسته است هم هشدارها به دستتان برسد، لطفاً تنظیمات زیر را در گوشی خود انجام دهید:
            </p>
            
            <div class="d-flex gap-3 mb-3">
              <div class="badge bg-primary rounded-circle" style="width:28px; height:28px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">۱</div>
              <div>
                <div style="font-weight:700; font-size:0.9rem;">رفع محدودیت باتری</div>
                <div class="small text-muted mt-1" style="line-height:1.6;">
                  به تنظیمات گوشی بروید ← برنامه‌ها ← کلینیک ← باتری ← گزینه <strong>Unrestricted (بدون محدودیت)</strong> را انتخاب کنید.
                </div>
              </div>
            </div>

            <div class="d-flex gap-3 mb-3">
              <div class="badge bg-primary rounded-circle" style="width:28px; height:28px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">۲</div>
              <div>
                <div style="font-weight:700; font-size:0.9rem;">فعال‌سازی استارت خودکار (Autostart)</div>
                <div class="small text-muted mt-1" style="line-height:1.6;">
                  اگر گوشی <strong>شیائومی، سامسونگ، هواوی یا اوپو</strong> دارید، حتماً گزینه <strong>Autostart</strong> یا <strong>اجازه اجرای خودکار</strong> را برای این برنامه روشن کنید.
                </div>
              </div>
            </div>

            <div class="d-flex gap-3">
              <div class="badge bg-primary rounded-circle" style="width:28px; height:28px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">۳</div>
              <div>
                <div style="font-weight:700; font-size:0.9rem;">داده در پس‌زمینه</div>
                <div class="small text-muted mt-1" style="line-height:1.6;">
                  در تنظیمات برنامه، گزینه <strong>Allow background data usage</strong> (اجازه استفاده از داده در پس‌زمینه) را فعال کنید.
                </div>
              </div>
            </div>

            <hr class="my-3">
            <button class="btn btn-sm btn-outline-secondary w-100" id="btnCopyGuide" style="border-radius:8px;">
              <i class="bi bi-clipboard-check"></i> کپی متن راهنما
            </button>
          </div>
        </div>
      </div>
    </div>

    <h6 class="mb-3" style="font-weight:700;">
      <i class="bi bi-exclamation-triangle-fill" style="color:#dc2626;"></i> دریافت هشدار حادثه
    </h6>
    <div class="option-list">
      ${['always', 'shift', 'never'].map(mode => {
        const meta = {
          always: { icon: '🔔', title: 'همیشه', desc: 'دریافت هشدار در هر شرایطی' },
          shift:  { icon: '🌅', title: 'فقط شیفت فعال', desc: 'دریافت هشدار در ساعات کاری' },
          never:  { icon: '🔕', title: 'هرگز', desc: 'هیچ هشدار حادثه‌ای نگیرم' },
        }[mode];
        return `
          <label class="option-card ${currentPrefs.incident_alerts_mode === mode ? 'selected' : ''}" data-mode="${mode}">
            <input type="radio" name="incidentMode" value="${mode}" ${currentPrefs.incident_alerts_mode === mode ? 'checked' : ''}>
            <div class="option-icon">${meta.icon}</div>
            <div class="option-body">
              <div class="option-title">${meta.title}</div>
              <div class="option-desc">${meta.desc}</div>
            </div>
          </label>
        `;
      }).join('')}
    </div>
  `;

  if (!document.getElementById('settingsStyle')) {
    const style = document.createElement('style');
    style.id = 'settingsStyle';
    style.textContent = `
      .option-list { display: flex; flex-direction: column; gap: 10px; }
      .option-card { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border: 2px solid #e2e8f0; border-radius: 14px; cursor: pointer; background: #fff; transition: all 0.15s; text-align: right; }
      .option-card.selected { border-color: #0d6efd; background: #eff6ff; box-shadow: 0 4px 12px rgba(13, 110, 253, 0.15); }
      .option-icon { font-size: 1.8rem; flex-shrink: 0; }
      .option-body { flex: 1; }
      .option-title { font-weight: 700; font-size: 0.95rem; color: #1e293b; }
      .option-desc { font-size: 0.75rem; color: #64748b; margin-top: 2px; }
      .accordion-button:not(.collapsed) { background-color: #fef3c7; color: #92400e; box-shadow: none; }
      .accordion-button:focus { box-shadow: none; border-color: rgba(0,0,0,.125); }
    `;
    document.head.appendChild(style);
  }

  // ─── رویدادها ───
  const btnEnable = $('btnEnableAlerts');
  if (btnEnable) btnEnable.onclick = () => enableAlertsFlow(btnEnable);

  const btnRegenerate = $('btnRegenerateToken');
  if (btnRegenerate) btnRegenerate.onclick = () => manualRegenerateFlow(btnRegenerate);

  const btnTest = $('btnTestNotif');
  if (btnTest) btnTest.onclick = () => testNotificationFlow(btnTest);

  const btnCopy = $('btnCopyToken');
  if (btnCopy) {
    btnCopy.onclick = () => {
      const tokenText = $('settingsTokenView').value;
      if (tokenText) navigator.clipboard.writeText(tokenText).then(() => toast('✅ توکن کپی شد', 'success'));
    };
  }

  // ⭐️ دکمه کپی متن راهنما
  const btnCopyGuide = $('btnCopyGuide');
  if (btnCopyGuide) {
    btnCopyGuide.onclick = () => {
      const guideText = `راهنمای فعال‌سازی نوتیفیکیشن در پس‌زمینه:
۱. تنظیمات گوشی ← برنامه‌ها ← کلینیک ← باتری ← Unrestricted
۲. در تنظیمات گوشی (شیائومی/سامسونگ) گزینه Autostart یا اجرای خودکار را روشن کنید.
۳. در تنظیمات برنامه، اجازه استفاده از داده در پس‌زمینه (Background data) را فعال کنید.`;
      
      navigator.clipboard.writeText(guideText).then(() => {
        toast('✅ متن راهنما کپی شد. می‌توانید برای همکاران بفرستید.', 'success');
      });
    };
  }

  document.querySelectorAll('.option-card[data-mode]').forEach(card => {
    card.onclick = async () => {
      const mode = card.dataset.mode;
      if (mode === currentPrefs.incident_alerts_mode) return;
      document.querySelectorAll('.option-card[data-mode]').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      currentPrefs.incident_alerts_mode = mode;
      await savePrefs();
    };
  });
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