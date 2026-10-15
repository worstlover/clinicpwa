// js/scanner.js
import { $, toast } from './utils.js';

let html5QrCode = null;
let onScanCallback = null;
let isScanning = false;
let currentCameraId = null;
let camerasCache = [];
let currentPreset = localStorage.getItem('scannerPreset') || 'classic';

// ═══════════════════════════════════════════════════════
// پریست‌های اسکن (از فایل‌های خودت + یکی قوی)
// ═══════════════════════════════════════════════════════
const PRESETS = {
  // دقیقاً همون چیزی که توی add_drug_from_qr و receive_drug_form بود
  classic: {
    name: 'کلاسیک (کار کرده)',
    desc: 'fps:10 • باکس ۲۵۰×۲۵۰',
    config: {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0,
      disableFlip: false,
    },
    formats: null, // همه فرمت‌ها
    videoConstraints: { facingMode: 'environment' }
  },

  // نسخه تهاجمی با نیتیو + اولویت Data Matrix
  native: {
    name: 'نیتیو + DataMatrix',
    desc: 'سریع‌ترین روی کروم اندروید',
    config: {
      fps: 15,
      qrbox: function (w, h) {
        const size = Math.floor(Math.min(w, h) * 0.82);
        return { width: size, height: size };
      },
      aspectRatio: 1.0,
      disableFlip: false,
    },
    formats: [
      Html5QrcodeSupportedFormats.DATA_MATRIX,
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
    ],
    videoConstraints: {
      facingMode: 'environment',
      width:  { ideal: 1920, min: 1280 },
      height: { ideal: 1080, min: 720 },
    }
  },

  // کل صفحه رو اسکن می‌کنه (کندتر ولی مطمئن‌تر)
  full: {
    name: 'کل صفحه (مطمئن)',
    desc: 'بدون محدودیت باکس',
    config: {
      fps: 12,
      // بدون qrbox = کل فریم
      aspectRatio: 1.0,
      disableFlip: false,
    },
    formats: [
      Html5QrcodeSupportedFormats.DATA_MATRIX,
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
    ],
    videoConstraints: { facingMode: 'environment' }
  },

  // مخصوص کدهای کوچک دارویی
  pharma: {
    name: 'دارویی کوچک',
    desc: 'باکس کوچک‌تر + رزولوشن بالا',
    config: {
      fps: 12,
      qrbox: { width: 220, height: 220 },
      aspectRatio: 1.0,
      disableFlip: false,
    },
    formats: [
      Html5QrcodeSupportedFormats.DATA_MATRIX,
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.CODE_128,
    ],
    videoConstraints: {
      facingMode: 'environment',
      width:  { ideal: 1920 },
      height: { ideal: 1080 },
    }
  }
};

// ═══════════════════════════════════════════════════════
// دکمه‌ها
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

  // دکمه انتخاب پریست
  ensurePresetButton();

  const wrap = $('scannerWrap');
  if (wrap) {
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) closeScanner();
    });
  }
  console.log('[SCANNER] ready | preset:', currentPreset);
}

function ensurePresetButton() {
  // اگر قبلاً ساخته شده، کاری نکن
  if (document.getElementById('btnScannerPreset')) return;

  const controls = document.querySelector('.scanner-controls');
  if (!controls) return;

  const btn = document.createElement('button');
  btn.id = 'btnScannerPreset';
  btn.className = 'scan-btn';
  btn.title = 'تغییر حالت اسکن';
  btn.innerHTML = `<i class="bi bi-sliders"></i>`;
  btn.onclick = (e) => {
    e.stopPropagation();
    showPresetPicker();
  };

  // قبل از دکمه بستن قرار بده
  const closeBtn = $('btnScanClose');
  if (closeBtn) controls.insertBefore(btn, closeBtn);
  else controls.appendChild(btn);
}

// ═══════════════════════════════════════════════════════
// شروع اسکن با پریست انتخاب‌شده
// ═══════════════════════════════════════════════════════
export async function startScanner(callback) {
  onScanCallback = callback;
  const wrap = $('scannerWrap');
  const statusEl = $('scannerStatus');
  if (!wrap) return;

  wrap.classList.add('active');
  if (statusEl) statusEl.textContent = 'در حال راه‌اندازی...';

  try {
    if (typeof Html5Qrcode === 'undefined') {
      toast('کتابخانه اسکنر بارگذاری نشده', 'danger');
      return;
    }

    await stopInternal();
    const reader = $('reader');
    if (reader) reader.innerHTML = '';

    const preset = PRESETS[currentPreset] || PRESETS.classic;

    const constructorConfig = {
      verbose: false,
      useBarCodeDetectorIfSupported: true, // همیشه نیتیو اول
    };
    if (preset.formats) {
      constructorConfig.formatsToSupport = preset.formats;
    }

    html5QrCode = new Html5Qrcode('reader', constructorConfig);

    const isNative = 'BarcodeDetector' in window;
    console.log('[SCANNER] native:', isNative, '| preset:', currentPreset);

    const devices = await Html5Qrcode.getCameras();
    camerasCache = devices || [];
    if (!camerasCache.length) {
      toast('دوربین پیدا نشد', 'danger');
      setTimeout(() => closeScanner(), 2000);
      return;
    }

    const backCam = camerasCache.find(d => {
      const l = (d.label || '').toLowerCase();
      return l.includes('back') || l.includes('rear') || l.includes('environment') ||
             l.includes('پشت') || l.includes('عقب');
    });
    const cameraId = backCam ? backCam.id : camerasCache[0].id;
    currentCameraId = cameraId;

    const startConfig = {
      ...preset.config,
      videoConstraints: preset.videoConstraints || { facingMode: 'environment' }
    };

    await html5QrCode.start(
      cameraId,
      startConfig,
      (decodedText, decodedResult) => {
        console.log('[SCANNER] SUCCESS:', decodedText);
        if (statusEl) statusEl.textContent = '✅ اسکن شد';
        if (navigator.vibrate) navigator.vibrate([70, 30, 70]);
        playBeep();
        if (onScanCallback) onScanCallback(decodedText);
        closeScanner();
      },
      () => {}
    );

    isScanning = true;
    if (statusEl) {
      statusEl.textContent = `${preset.name} • آماده اسکن`;
    }

  } catch (err) {
    console.error('[SCANNER] start error:', err);
    handleStartError(err, statusEl);
  }
}

export const openScanner = startScanner;

// ═══════════════════════════════════════════════════════
// انتخاب پریست
// ═══════════════════════════════════════════════════════
function showPresetPicker() {
  // اگر پاپ‌آپ قبلی هست حذفش کن
  const old = document.getElementById('presetPopup');
  if (old) {
    old.remove();
    return;
  }

  const popup = document.createElement('div');
  popup.id = 'presetPopup';
  popup.style.cssText = `
    position: absolute;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.95);
    padding: 12px;
    border-radius: 14px;
    min-width: 260px;
    max-width: 90vw;
    z-index: 120;
    color: #fff;
  `;

  popup.innerHTML = `
    <div style="font-size:0.85rem;margin-bottom:10px;opacity:0.8;text-align:center;">
      حالت اسکن را انتخاب کنید
    </div>
    ${Object.entries(PRESETS).map(([key, p]) => `
      <div class="preset-option" data-preset="${key}" style="
        padding: 11px 14px;
        border-radius: 10px;
        margin-bottom: 6px;
        cursor: pointer;
        background: ${key === currentPreset ? '#0d6efd' : 'rgba(255,255,255,0.1)'};
        display: flex;
        flex-direction: column;
        gap: 2px;
      ">
        <div style="font-weight:600;font-size:0.9rem;">${p.name}</div>
        <div style="font-size:0.75rem;opacity:0.75;">${p.desc}</div>
      </div>
    `).join('')}
  `;

  document.querySelector('.scanner-controls')?.appendChild(popup);

  popup.querySelectorAll('.preset-option').forEach(el => {
    el.onclick = async (e) => {
      e.stopPropagation();
      const key = el.dataset.preset;
      if (key === currentPreset) {
        popup.remove();
        return;
      }
      currentPreset = key;
      localStorage.setItem('scannerPreset', key);
      popup.remove();
      toast(`حالت «${PRESETS[key].name}» فعال شد`, 'info');

      // اگر الان اسکنر بازه، ری‌استارت کن
      if (isScanning) {
        const cb = onScanCallback;
        await closeScanner();
        // کمی صبر کن تا دوربین آزاد بشه
        setTimeout(() => startScanner(cb), 400);
      }
    };
  });

  // بستن با کلیک بیرون
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!popup.contains(e.target) && e.target.id !== 'btnScannerPreset') {
        popup.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 50);
}

// ═══════════════════════════════════════════════════════
// بقیه توابع (بدون تغییر اساسی)
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
  const presetPopup = document.getElementById('presetPopup');
  if (presetPopup) presetPopup.remove();
  isScanning = false;
}

async function stopInternal() {
  if (html5QrCode && isScanning) {
    try {
      await html5QrCode.stop();
      await html5Qrcode.clear?.();
    } catch (e) {}
  }
  html5QrCode = null;
  isScanning = false;
}

async function switchCamera(deviceId) {
  if (!html5QrCode || !isScanning) return;
  const statusEl = $('scannerStatus');
  if (statusEl) statusEl.textContent = 'تغییر دوربین...';

  try {
    await html5QrCode.stop();
    const preset = PRESETS[currentPreset] || PRESETS.classic;
    const startConfig = { ...preset.config };
    await html5QrCode.start(deviceId, startConfig,
      (text) => {
        if (navigator.vibrate) navigator.vibrate([70, 30, 70]);
        playBeep();
        if (onScanCallback) onScanCallback(text);
        closeScanner();
      },
      () => {}
    );
    currentCameraId = deviceId;
    if (statusEl) statusEl.textContent = 'آماده اسکن...';
  } catch (e) {
    toast('خطا در تغییر دوربین', 'danger');
  }
}

async function showCameraPicker() {
  const popup = $('cameraPopup');
  if (!popup) return;
  if (popup.style.display === 'block') {
    popup.style.display = 'none';
    return;
  }
  popup.style.display = 'block';
  popup.innerHTML = '<div style="color:#fff;text-align:center;padding:8px;">...</div>';

  try {
    if (!camerasCache.length) camerasCache = await Html5Qrcode.getCameras() || [];
    if (!camerasCache.length) {
      popup.innerHTML = '<div style="color:#fff;text-align:center;padding:12px;">دوربین یافت نشد</div>';
      return;
    }
    popup.innerHTML = camerasCache.map((d, i) => `
      <div class="camera-option" data-id="${d.id}" style="
        padding:10px 12px;border-radius:8px;margin-bottom:4px;cursor:pointer;
        color:#fff;font-size:0.82rem;
        background:${d.id === currentCameraId ? '#0d6efd' : 'rgba(255,255,255,0.1)'};
        display:flex;align-items:center;gap:8px;">
        <i class="bi bi-camera-video${d.id === currentCameraId ? '-fill' : ''}"></i>
        <span style="flex:1;">${d.label || 'دوربین ' + (i + 1)}</span>
        ${d.id === currentCameraId ? '<i class="bi bi-check2"></i>' : ''}
      </div>
    `).join('');

    popup.querySelectorAll('.camera-option').forEach(el => {
      el.onclick = async (e) => {
        e.stopPropagation();
        popup.style.display = 'none';
        await switchCamera(el.dataset.id);
      };
    });
  } catch (e) {
    popup.innerHTML = '<div style="color:#fff;text-align:center;padding:8px;">خطا</div>';
  }
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text?.trim()) {
      toast('کلیپ‌بورد خالیه', 'warning');
      return;
    }
    if (onScanCallback) onScanCallback(text.trim());
    closeScanner();
  } catch (e) {
    const manual = prompt('کد را وارد کنید:');
    if (manual?.trim()) {
      if (onScanCallback) onScanCallback(manual.trim());
      closeScanner();
    }
  }
}

function handleStartError(err, statusEl) {
  if (statusEl) statusEl.textContent = 'خطا در دوربین';
  let msg = 'خطا در دسترسی به دوربین';
  const name = err?.name || '';
  if (name === 'NotAllowedError') msg = 'دسترسی به دوربین رد شد';
  else if (name === 'NotFoundError') msg = 'دوربین پیدا نشد';
  else if (name === 'NotReadableError') msg = 'دوربین در حال استفاده است';
  toast(msg, 'danger');
  if (name === 'NotAllowedError' || name === 'NotFoundError') {
    setTimeout(() => closeScanner(), 2500);
  }
}

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
