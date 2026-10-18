// js/modules/profile.js
import { sb } from '../sb.js';
import { $, escapeHtml, toast, beep, gregorianToJalali } from '../utils.js';
import { showScreen } from '../ui.js';
import { currentUser } from '../auth.js';

export async function openProfile() {
  showScreen('Profile');
  await renderProfile();
}

async function renderProfile() {
  const c = $('profileContent');
  if (!c) return;

  c.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

  const email = currentUser?.email || '—';
  const username = email.split('@')[0];
  const meta = currentUser?.user_metadata || {};
  
  // مقادیر پیش‌فرض در صورتی که در دیتابیس پیدا نشدند
  let fullName = meta.full_name || username;
  let roleName = 'کاربر';
  let joinedDate = '—';
  let lastSignIn = currentUser?.last_sign_in_at 
    ? new Date(currentUser.last_sign_in_at).toLocaleString('fa-IR') 
    : '—';

  try {
    // ⬅️ دریافت اطلاعات از جدول اختصاصی جنگو (auth_user)
    const { data: userData, error } = await sb.from('auth_user')
      .select('*, groups:auth_user_groups(group:auth_group(name))')
      .eq('email', email)
      .maybeSingle();

    if (userData) {
      // اگر کاربر در جدول پیدا شد
      fullName = `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || username;
      
      if (userData.date_joined) {
        joinedDate = gregorianToJalali(userData.date_joined.slice(0, 10));
      }
      
      if (userData.groups && userData.groups.length > 0) {
        // گرفتن نام نقش با حروف بزرگ و کوچک دقیق
        roleName = userData.groups[0].group.name;
      }
    }
  } catch (err) {
    console.error('[PROFILE] error fetching user data:', err);
  }

  // تعیین رنگ و برچسب برای نقش
  let roleBadge = `<div class="badge-soft primary mt-2" style="display:inline-flex;">${escapeHtml(roleName)}</div>`;
  
  if (roleName === 'doctor') {
    roleBadge = '<div class="badge-soft success mt-2" style="display:inline-flex;">پزشک</div>';
  } else if (roleName === 'Nurse') {
    roleBadge = '<div class="badge-soft warning mt-2" style="display:inline-flex;">پرستار</div>';
  } else if (roleName === 'safety') {
    roleBadge = '<div class="badge-soft danger mt-2" style="display:inline-flex;">افسر ایمنی</div>';
  } else if (roleName === 'Supervisor') {
    roleBadge = '<div class="badge-soft primary mt-2" style="display:inline-flex;">سوپروایزر</div>';
  }

  c.innerHTML = `
    <div class="card" style="padding:24px;text-align:center;">
      <div style="width:90px;height:90px;border-radius:50%;background:linear-gradient(135deg,#0d6efd,#6610f2);
        color:#fff;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;
        font-size:2.5rem;font-weight:700;box-shadow:0 8px 20px rgba(13,110,253,.3);">
        ${escapeHtml(fullName.charAt(0).toUpperCase())}
      </div>
      <h5 style="margin:0 0 6px;font-weight:700;">${escapeHtml(fullName)}</h5>
      <div class="muted small" style="direction:ltr;">${escapeHtml(email)}</div>
      ${roleBadge}
    </div>

    <div class="card">
      <div class="card-head">
        <i class="bi bi-info-circle"></i> اطلاعات حساب
      </div>
      <div class="card-body">
        <div class="row-item d-flex justify-content-between">
          <span class="muted">نام کاربری</span>
          <span style="direction:ltr;font-weight:700;">${escapeHtml(username)}</span>
        </div>
        <div class="row-item d-flex justify-content-between">
          <span class="muted">ایمیل</span>
          <span style="direction:ltr;">${escapeHtml(email)}</span>
        </div>
        <div class="row-item d-flex justify-content-between">
          <span class="muted">تاریخ عضویت</span>
          <span>${joinedDate}</span>
        </div>
        <div class="row-item d-flex justify-content-between">
          <span class="muted">آخرین ورود</span>
          <span>${lastSignIn}</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head warning">
        <i class="bi bi-shield-lock"></i> امنیت
      </div>
      <div class="card-body">
        <button class="btn btn-warning w-100 py-3" id="btnChangePassword">
          <i class="bi bi-key"></i> تغییر رمز عبور
        </button>
      </div>
    </div>

    <div class="card">
      <div class="card-head danger">
        <i class="bi bi-box-arrow-right"></i> عملیات
      </div>
      <div class="card-body">
        <button class="btn btn-outline-danger w-100 py-3" id="btnLogoutProfile">
          <i class="bi bi-box-arrow-left"></i> خروج از حساب
        </button>
      </div>
    </div>

    <div style="text-align:center;font-size:0.75rem;color:#94a3b8;padding:20px;">
      نسخه ۱.۰ - کلینیک صنعتی گندله‌سازی بهاباد
    </div>
  `;

  $('btnChangePassword').onclick = openChangePasswordModal;
  $('btnLogoutProfile').onclick = async () => {
    if (!confirm('از حساب خارج می‌شوید؟')) return;
    await sb.auth.signOut();
    window.location.reload();
  };
}

// ═══════════════════════════════════════════════════════
// مودال تغییر رمز (بدون تغییر از کد خودتان)
// ═══════════════════════════════════════════════════════
function openChangePasswordModal() {
  const existing = document.getElementById('changePasswordModal');
  if (existing) existing.remove();

  const modalHtml = `
    <div class="modal fade" id="changePasswordModal" tabindex="-1" data-bs-backdrop="static">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header bg-warning text-dark">
            <h5 class="modal-title"><i class="bi bi-key"></i> تغییر رمز عبور</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div id="cpMsg"></div>
            
            <div class="mb-3">
              <label class="form-label">رمز فعلی *</label>
              <div style="position:relative;">
                <input type="password" id="cpCurrent" class="form-control" dir="ltr" autocomplete="current-password">
                <button type="button" class="btn btn-sm btn-outline-secondary" 
                  style="position:absolute;left:6px;top:6px;" onclick="togglePw('cpCurrent', this)">
                  <i class="bi bi-eye"></i>
                </button>
              </div>
            </div>
            
            <div class="mb-3">
              <label class="form-label">رمز جدید * (حداقل ۶ کاراکتر)</label>
              <div style="position:relative;">
                <input type="password" id="cpNew" class="form-control" dir="ltr" autocomplete="new-password">
                <button type="button" class="btn btn-sm btn-outline-secondary" 
                  style="position:absolute;left:6px;top:6px;" onclick="togglePw('cpNew', this)">
                  <i class="bi bi-eye"></i>
                </button>
              </div>
              <div id="cpStrength" style="margin-top:6px;font-size:0.75rem;"></div>
            </div>
            
            <div class="mb-3">
              <label class="form-label">تکرار رمز جدید *</label>
              <div style="position:relative;">
                <input type="password" id="cpConfirm" class="form-control" dir="ltr" autocomplete="new-password">
                <button type="button" class="btn btn-sm btn-outline-secondary" 
                  style="position:absolute;left:6px;top:6px;" onclick="togglePw('cpConfirm', this)">
                  <i class="bi bi-eye"></i>
                </button>
              </div>
              <div id="cpMatch" style="margin-top:6px;font-size:0.75rem;"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-light" data-bs-dismiss="modal">انصراف</button>
            <button type="button" class="btn btn-warning" id="cpSave">
              <i class="bi bi-check"></i> ذخیره رمز جدید
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  window.togglePw = (id, btn) => {
    const el = document.getElementById(id);
    el.type = el.type === 'password' ? 'text' : 'password';
    btn.querySelector('i').classList.toggle('bi-eye');
    btn.querySelector('i').classList.toggle('bi-eye-slash');
  };

  const modal = new bootstrap.Modal(document.getElementById('changePasswordModal'));
  modal.show();

  document.getElementById('cpNew').addEventListener('input', e => {
    const v = e.target.value;
    const strength = calculateStrength(v);
    const el = document.getElementById('cpStrength');
    if (!v) { el.innerHTML = ''; return; }
    const colors = { weak: '#dc3545', medium: '#f59e0b', strong: '#198754' };
    const labels = { weak: 'ضعیف', medium: 'متوسط', strong: 'قوی' };
    el.innerHTML = `<span style="color:${colors[strength]};">قدرت: <strong>${labels[strength]}</strong></span>`;
    checkMatch();
  });

  function checkMatch() {
    const n = document.getElementById('cpNew').value;
    const c = document.getElementById('cpConfirm').value;
    const el = document.getElementById('cpMatch');
    if (!c) { el.innerHTML = ''; return; }
    if (n === c) {
      el.innerHTML = '<span style="color:#198754;">✓ رمزها یکسان هستند</span>';
    } else {
      el.innerHTML = '<span style="color:#dc3545;">✗ رمزها یکسان نیستند</span>';
    }
  }
  document.getElementById('cpConfirm').addEventListener('input', checkMatch);

  document.getElementById('cpSave').onclick = async () => {
    const current = document.getElementById('cpCurrent').value;
    const newPw = document.getElementById('cpNew').value;
    const confirm = document.getElementById('cpConfirm').value;
    const msg = document.getElementById('cpMsg');
    const btn = document.getElementById('cpSave');

    msg.innerHTML = '';

    if (!current || !newPw || !confirm) {
      msg.innerHTML = '<div class="alert alert-danger py-2 small">همه فیلدها را پر کنید</div>';
      return;
    }
    if (newPw.length < 6) {
      msg.innerHTML = '<div class="alert alert-danger py-2 small">رمز جدید باید حداقل ۶ کاراکتر باشد</div>';
      return;
    }
    if (newPw !== confirm) {
      msg.innerHTML = '<div class="alert alert-danger py-2 small">رمز جدید و تکرار آن یکسان نیستند</div>';
      return;
    }
    if (newPw === current) {
      msg.innerHTML = '<div class="alert alert-warning py-2 small">رمز جدید با رمز فعلی یکسان است</div>';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> در حال ذخیره...';

    try {
      const email = currentUser?.email;
      if (!email) throw new Error('کاربر یافت نشد');

      const { error: signInErr } = await sb.auth.signInWithPassword({
        email,
        password: current
      });
      if (signInErr) {
        throw new Error('رمز فعلی اشتباه است');
      }

      const { error: updateErr } = await sb.auth.updateUser({
        password: newPw
      });
      if (updateErr) throw updateErr;

      msg.innerHTML = '<div class="alert alert-success py-2 small">✅ رمز با موفقیت تغییر یافت</div>';
      beep();
      toast('رمز عبور با موفقیت تغییر یافت', 'success');

      setTimeout(() => {
        modal.hide();
        setTimeout(() => {
          document.getElementById('changePasswordModal')?.remove();
        }, 300);
      }, 1500);

    } catch (e) {
      console.error(e);
      msg.innerHTML = `<div class="alert alert-danger py-2 small">❌ ${escapeHtml(e.message || 'خطا در تغییر رمز')}</div>`;
      beep(300);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-check"></i> ذخیره رمز جدید';
    }
  };
}

function calculateStrength(pw) {
  if (!pw || pw.length < 6) return 'weak';
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score >= 4) return 'strong';
  if (score >= 2) return 'medium';
  return 'weak';
}
