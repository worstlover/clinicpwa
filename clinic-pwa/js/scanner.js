// js/scanner.js
import { $, toast } from './utils.js';

let html5QrCode = null;
let onScanCallback = null;
let isScanning = false;
let currentCameraId = null;
let camerasCache = [];

// ═══════════════════════════════════════════════════════
// راه‌اندازی دکمه‌ها
// ═══════════════════════════════════════════════════════
export function initScannerButtons() {
  const btnCamera = $('btnCameraSelect');
  const btnPaste  = $('btnScanPaste');
  const btnClose  = $('btnScanClose');

  if (btnClose) btnClose.onclick = () => closeScanner();
  if (btnPaste)  btnPaste.onclick  = () => pasteFromClipboard();
  if (btnCamera) {
    btnCamera.onclick = (e) => {
      e.stopPropagation();
      showCameraPicker();
    };
  }

  const wrap = $('scannerWrap');
  if (wrap) {
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) closeScanner();
    });
  }

  console.log('[SCANNER] buttons initialized (html5-qrcode)');
}

// ═══════════════════════════════════════════════════════
// شروع اسکن
// ═══════════════════════════════════════════════════════
export async function startScanner(callback) {
  onScanCallback = callback;
  const wrap = $('scannerWrap');
  const statusEl = $('scannerStatus');
  if (!wrap) return;

  wrap.classList.add('active');
  if (statusEl) statusEl.textContent = 'در حال راه‌اندازی دوربین...';

  try {
    if (typeof Html5Qrcode === 'undefined') {
      toast('کتابخانه اسکنر بارگذاری نشده. اتصال اینترنت را چک کنید.', 'danger');
      if (statusEl) statusEl.textContent = 'کتابخانه پیدا نشد';
      return;
    }

    // اگر قبلاً باز بوده، اول ببند
    await stopInternal();

    // المان reader رو پاک کن
    const reader = $('reader');
    if (reader) reader.innerHTML = '';

    html5QrCode = new Html5Qrcode('reader', {
      verbose: false,
      // خیلی مهم: روی اندروید از موتور بومی استفاده کن
      useBarCodeDetectorIfSupported: true,
    });

    // لیست دوربین‌ها
    const devices = await Html5Qrcode.getCameras();
    camerasCache = devices || [];
    console.log('[SCANNER] cameras:', camerasCache);

    if (!camerasCache.length) {
      toast('دوربینی پیدا نشد', 'danger');
      if (statusEl) statusEl.textContent = 'دوربین یافت نشد';
      setTimeout(() => closeScanner(), 2000);
      return;
    }

    // اولویت با دوربین پشتی
    const backCam = camerasCache.find(d => {
      const label = (d.label || '').toLowerCase();
      return label.includes('back') || label.includes('rear') || 
             label.includes('environment') || label.includes('پشت') || label.includes('عقب');
    });

    const cameraId = backCam ? backCam.id : camerasCache[0].id;
    currentCameraId = cameraId;

    // کانفیگ بهینه برای سرعت بالا روی موبایل
    const config = {
      fps: 12,                          // بالاتر = سریع‌تر (روی گوشی‌های قوی تا ۱۵ هم خوبه)
      qrbox: function(viewfinderWidth, viewfinderHeight) {
        // ناحیه مرکزی برای سرعت بیشتر
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const size = Math.floor(minEdge * 0.72);   // ۷۲٪ از کوتاه‌ترین ضلع
        return { width: size, height: size };
      },
      aspectRatio: 1.0,                 // مربع بهتر کار می‌کنه
      disableFlip: false,               // برای QRهای برعکس هم کار کنه
      // ویدیو کانسترینت‌های سبک برای سرعت
      videoConstraints: {
        facingMode: 'environment',
        width:  { ideal: 1280, max: 1920 },
        height: { ideal: 720,  max: 1080 },
        // frameRate: { ideal: 24, max: 30 }  // بعضی دستگاه‌ها پشتیبانی نمی‌کنن
      }
    };

    await html5QrCode.start(
      cameraId,
      config,
      (decodedText, decodedResult) => {
        // اسکن موفق
        console.log('[SCANNER] scanned:', decodedText, decodedResult);
        if (statusEl) statusEl.textContent = '✅ اسکن شد';
        
        // ویبره
        if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
        
        // صدا (اختیاری - می‌تونی حذف کنی)
        playBeep();

        if (onScanCallback) onScanCallback(decodedText);
        closeScanner();
      },
      (errorMessage) => {
        // خطاهای لحظه‌ای رو نادیده بگیر (خیلی زیادن)
        // فقط برای دیباگ:
        // console.log('[SCANNER] frame error:', errorMessage);
      }
    );

    isScanning = true;
    if (statusEl) statusEl.textContent = 'آماده اسکن... کد را مقابل دوربین بگیرید';

  } catch (err) {
    console.error('[SCANNER] start error:', err);
    handleStartError(err, statusEl);
  }
}

// alias
export const openScanner = startScanner;

// ═══════════════════════════════════════════════════════
// بستن
// ═══════════════════════════════════════════════════════
export async function closeScanner() {
  const wrap = $('scannerWrap');
  if (wrap) wrap.classList.remove('active');

  await stopInternal();

  const reader = $('reader');
  if (reader) reader.innerHTML = '';

  const statusEl = $('scannerStatus');
  if (statusEl) statusEl.textContent = 'آماده اسکن...';

  const popup = $('cameraPopup');
  if (popup) popup.style.display = 'none';

  isScanning = false;
  console.log('[SCANNER] closed');
}

async function stopInternal() {
  if (html5QrCode && isScanning) {
    try {
      await html5QrCode.stop();
      await html5QrCode.clear();
    } catch (e) {
      console.warn('[SCANNER] stop warning:', e);
    }
  }
  html5QrCode = null;
  isScanning = false;
}

// ═══════════════════════════════════════════════════════
// تغییر دوربین
// ═══════════════════════════════════════════════════════
async function switchCamera(deviceId) {
  if (!html5QrCode || !isScanning) return;

  const statusEl = $('scannerStatus');
  if (statusEl) statusEl.textContent = 'در حال تغییر دوربین...';

  try {
    await html5QrCode.stop();
    
    const config = {
      fps: 12,
      qrbox: function(w, h) {
        const size = Math.floor(Math.min(w, h) * 0.72);
        return { width: size, height: size };
      },
      aspectRatio: 1.0,
      disableFlip: false,
    };

    await html5QrCode.start(
      deviceId,
      config,
      (decodedText) => {
        if (statusEl) statusEl.textContent = '✅ اسکن شد';
        if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
        playBeep();
        if (onScanCallback) onScanCallback(decodedText);
        closeScanner();
      },
      () => {}
    );

    currentCameraId = deviceId;
    if (statusEl) statusEl.textContent = 'آماده اسکن...';
  } catch (e) {
    console.error('[SCANNER] switch error:', e);
    toast('خطا در تغییر دوربین', 'danger');
    if (statusEl) statusEl.textContent = 'خطا — دوباره تلاش کنید';
  }
}

// ═══════════════════════════════════════════════════════
// انتخاب دوربین
// ═══════════════════════════════════════════════════════
async function showCameraPicker() {
  const popup = $('cameraPopup');
  if (!popup) return;

  if (popup.style.display === 'block') {
    popup.style.display = 'none';
    return;
  }

  popup.style.display = 'block';
  popup.innerHTML = '<div style="color:#fff;font-size:0.8rem;text-align:center;padding:8px;">در حال بارگذاری...</div>';

  try {
    if (!camerasCache.length) {
      camerasCache = await Html5Qrcode.getCameras() || [];
    }

    if (!camerasCache.length) {
      popup.innerHTML = `
        <div style="color:#fff;font-size:0.8rem;text-align:center;padding:12px;">
          دوربینی یافت نشد
        </div>`;
      return;
    }

    popup.innerHTML = camerasCache.map((d, i) => `
      <div class="camera-option" data-id="${d.id}" style="
        padding: 10px 12px;
        border-radius: 8px;
        margin-bottom: 4px;
        cursor: pointer;
        color: #fff;
        font-size: 0.82rem;
        background: ${d.id === currentCameraId ? '#0d6efd' : 'rgba(255,255,255,0.1)'};
        display: flex;
        align-items: center;
        gap: 8px;
      ">
        <i class="bi bi-camera-video${d.id === currentCameraId ? '-fill' : ''}"></i>
        <span style="flex:1;">${d.label || 'دوربین ' + (i + 1)}</span>
        ${d.id === currentCameraId ? '<i class="bi bi-check2"></i>' : ''}
      </div>
    `).join('');

    popup.querySelectorAll('.camera-option').forEach(el => {
      el.onclick = async (e) => {
        e.stopPropagation();
        const id = el.dataset.id;
        popup.style.display = 'none';
        await switchCamera(id);
      };
    });
  } catch (e) {
    console.warn('[SCANNER] camera list error:', e);
    popup.innerHTML = '<div style="color:#fff;font-size:0.8rem;text-align:center;padding:8px;">خطا در بارگذاری</div>';
  }
}

// ═══════════════════════════════════════════════════════
// چسباندن از کلیپ‌بورد
// ═══════════════════════════════════════════════════════
async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      toast('کلیپ‌بورد خالیه', 'warning');
      return;
    }
    console.log('[SCANNER] pasted:', text);
    if (onScanCallback) onScanCallback(text.trim());
    closeScanner();
  } catch (e) {
    console.error('[SCANNER] paste error:', e);
    toast('دسترسی به کلیپ‌بورد ممکن نیست', 'warning');
    const manual = prompt('کد را وارد کنید:');
    if (manual && manual.trim()) {
      if (onScanCallback) onScanCallback(manual.trim());
      closeScanner();
    }
  }
}

// ═══════════════════════════════════════════════════════
// مدیریت خطا
// ═══════════════════════════════════════════════════════
function handleStartError(err, statusEl) {
  if (statusEl) statusEl.textContent = 'خطا در راه‌اندازی دوربین';

  let msg = 'خطا در دسترسی به دوربین';
  const name = err?.name || '';
  const message = err?.message || String(err);

  if (name === 'NotAllowedError' || message.includes('Permission')) {
    msg = 'دسترسی به دوربین رد شد. از تنظیمات مرورگر اجازه دهید.';
  } else if (name === 'NotFoundError') {
    msg = 'دوربینی روی دستگاه پیدا نشد';
  } else if (name === 'NotReadableError' || message.includes('could not start')) {
    msg = 'دوربین در حال استفاده است. برنامه‌های دیگر را ببندید و دوباره امتحان کنید.';
  } else if (name === 'OverconstrainedError') {
    msg = 'تنظیمات دوربین با دستگاه سازگار نیست';
  } else {
    msg += ': ' + message;
  }

  toast(msg, 'danger');

  if (name === 'NotAllowedError' || name === 'NotFoundError') {
    setTimeout(() => closeScanner(), 2500);
  }
}

// ═══════════════════════════════════════════════════════
// صدای بیپ ساده (اختیاری)
// ═══════════════════════════════════════════════════════
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {}
}
