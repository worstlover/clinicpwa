// js/scanner.js
import { $, toast } from './utils.js';

let html5QrCode = null;
let onScanCallback = null;
let isScanning = false;
let currentCameraId = null;
let camerasCache = [];
let currentPreset = localStorage.getItem('scannerPreset') || 'classic';

// برای حالت هوشمند
let smartStream = null;
let smartVideo = null;
let smartCanvas = null;
let smartCtx = null;
let smartDetector = null;
let smartRafId = null;
let smartRunning = false;

// ═══════════════════════════════════════════════════════
// تشخیص اندروید کروم + پشتیبانی نیتیو
// ═══════════════════════════════════════════════════════
function isAndroidChromeNative() {
  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isChrome = /Chrome/i.test(ua) && !/Edg|OPR|SamsungBrowser|Firefox/i.test(ua);
  const hasNative = 'BarcodeDetector' in window;
  return isAndroid && isChrome && hasNative;
}

// ═══════════════════════════════════════════════════════
// پریست‌ها
// ═══════════════════════════════════════════════════════
const PRESETS = {
  classic: {
    name: 'کلاسیک (کار کرده)',
    desc: 'fps:10 • باکس ۲۵۰×۲۵۰',
    type: 'html5',
    config: {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0,
      disableFlip: false,
    },
    formats: null,
    videoConstraints: { facingMode: 'environment' }
  },

  native: {
    name: 'نیتیو + DataMatrix',
    desc: 'سریع روی کروم اندروید',
    type: 'html5',
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
      'DATA_MATRIX', 'QR_CODE', 'CODE_128', 'CODE_39',
      'EAN_13', 'EAN_8', 'UPC_A', 'UPC_E'
    ],
    videoConstraints: {
      facingMode: 'environment',
      width:  { ideal: 1920, min: 1280 },
      height: { ideal: 1080, min: 720 },
    }
  },

  full: {
    name: 'کل صفحه (مطمئن)',
    desc: 'بدون محدودیت باکس',
    type: 'html5',
    config: {
      fps: 12,
      aspectRatio: 1.0,
      disableFlip: false,
    },
    formats: ['DATA_MATRIX', 'QR_CODE', 'CODE_128', 'CODE_39'],
    videoConstraints: { facingMode: 'environment' }
  },

  pharma: {
    name: 'دارویی کوچک',
    desc: 'باکس ۲۲۰×۲۲۰ + رزولوشن بالا',
    type: 'html5',
    config: {
      fps: 12,
      qrbox: { width: 220, height: 220 },
      aspectRatio: 1.0,
      disableFlip: false,
    },
    formats: ['DATA_MATRIX', 'QR_CODE', 'CODE_128'],
    videoConstraints: {
      facingMode: 'environment',
      width:  { ideal: 1920 },
      height: { ideal: 1080 },
    }
  },

  smart: {
    name: 'هوشمند (کراپ + آپ‌اسکیل)',
    desc: 'مثل QR Detector گوشی • فقط اندروید کروم',
    type: 'smart',
    onlyAndroidChrome: true
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
  if (document.getElementById('btnScannerPreset')) return;

  const controls = document.querySelector('.scanner-controls');
  if (!controls) return;

  const btn = document.createElement('button');
  btn.id = 'btnScannerPreset';
  btn.className = 'scan-btn';
  btn.title = 'تغییر حالت اسکن';
  btn.innerHTML = `<i class="bi bi-sliders"></i>`;
  btn.style.cssText = `background: rgba(255,255,255,0.2); border: none; color: #fff; width: 54px; height: 54px; border-radius: 50%; cursor: pointer; font-size: 20px; display: flex; align-items: center; justify-content: center;`;
  
  btn.onclick = (e) => {
    e.stopPropagation();
    showPresetPicker();
  };

  controls.appendChild(btn);
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
  if (statusEl) statusEl.textContent = 'در حال راه‌اندازی...';

  // بررسی پشتیبانی از حالت هوشمند
  if (currentPreset === 'smart' && !isAndroidChromeNative()) {
    currentPreset = 'classic';
    localStorage.setItem('scannerPreset', 'classic');
    toast('حالت هوشمند فقط روی اندروید کروم کار می‌کند', 'warning');
  }

  const preset = PRESETS[currentPreset] || PRESETS.classic;

  try {
    if (preset.type === 'smart') {
      await startSmartScanner(statusEl);
    } else {
      await startHtml5Scanner(preset, statusEl);
    }
  } catch (err) {
    console.error('[SCANNER] start error:', err);
    handleStartError(err, statusEl);
  }
}

export const openScanner = startScanner;

// ═══════════════════════════════════════════════════════
// حالت عادی (html5-qrcode)
// ═══════════════════════════════════════════════════════
async function startHtml5Scanner(preset, statusEl) {
  if (typeof Html5Qrcode === 'undefined') {
    toast('کتابخانه اسکنر بارگذاری نشده', 'danger');
    return;
  }

  await stopInternal();
  const reader = $('reader');
  if (reader) reader.innerHTML = '';

  const constructorConfig = {
    verbose: false,
    useBarCodeDetectorIfSupported: true,
  };

  // ⭐ اصلاح: دسترسی ایمن به Enum فرمت‌های پشتیبانی شده
  const html5Formats = window.Html5QrcodeSupportedFormats || (typeof Html5QrcodeSupportedFormats !== 'undefined' ? Html5QrcodeSupportedFormats : null);
  
  if (preset.formats && html5Formats) {
    constructorConfig.formatsToSupport = preset.formats
      .map(f => html5Formats[f])
      .filter(Boolean);
  }

  html5QrCode = new Html5Qrcode('reader', constructorConfig);

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
    (decodedText) => {
      onSuccess(decodedText, statusEl);
    },
    () => {}
  );

  isScanning = true;
  if (statusEl) statusEl.textContent = `${preset.name} • آماده اسکن`;
}

// ═══════════════════════════════════════════════════════
// حالت هوشمند (فقط اندروید کروم)
// ═══════════════════════════════════════════════════════
async function startSmartScanner(statusEl) {
  await stopInternal();
  await stopSmart();

  const reader = $('reader');
  if (!reader) throw new Error('reader not found');
  reader.innerHTML = '';

  smartVideo = document.createElement('video');
  smartVideo.setAttribute('playsinline', '');
  smartVideo.setAttribute('muted', '');
  smartVideo.setAttribute('autoplay', '');
  smartVideo.style.width = '100%';
  smartVideo.style.height = '100%';
  smartVideo.style.objectFit = 'cover';
  reader.appendChild(smartVideo);

  smartCanvas = document.createElement('canvas');
  smartCtx = smartCanvas.getContext('2d', { willReadFrequently: true });

  const formats = [
    'data_matrix', 'qr_code', 'code_128', 'code_39',
    'ean_13', 'ean_8', 'upc_a', 'upc_e', 'aztec', 'pdf417'
  ];
  smartDetector = new BarcodeDetector({ formats });

  smartStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width:  { ideal: 1920, min: 1280 },
      height: { ideal: 1080, min: 720 },
      advanced: [{ focusMode: 'continuous' }]
    }
  });

  smartVideo.srcObject = smartStream;
  await smartVideo.play();

  await new Promise(r => {
    if (smartVideo.readyState >= 2) r();
    else smartVideo.onloadeddata = r;
  });

  isScanning = true;
  smartRunning = true;
  if (statusEl) statusEl.textContent = 'هوشمند • دنبال کد می‌گردم...';

  const loop = async () => {
    if (!smartRunning || !smartVideo || smartVideo.readyState < 2) {
      smartRafId = requestAnimationFrame(loop);
      return;
    }

    try {
      const barcodes = await smartDetector.detect(smartVideo);

      if (barcodes && barcodes.length > 0) {
        const best = barcodes[0];
        const rawValue = best.rawValue;

        if (rawValue && rawValue.trim()) {
          await freezeAndEnhance(best);
          onSuccess(rawValue, statusEl);
          return;
        }
      }
    } catch (e) {}

    smartRafId = requestAnimationFrame(loop);
  };

  smartRafId = requestAnimationFrame(loop);
}

async function freezeAndEnhance(barcode) {
  if (!smartVideo || !smartCanvas || !smartCtx) return;
  const vw = smartVideo.videoWidth;
  const vh = smartVideo.videoHeight;
  if (!vw || !vh) return;
  smartCanvas.width = vw;
  smartCanvas.height = vh;
  smartCtx.drawImage(smartVideo, 0, 0, vw, vh);
  const box = barcode.boundingBox;
  if (!box) return;
  const padX = box.width * 0.18;
  const padY = box.height * 0.18;
  let x = Math.max(0, box.x - padX);
  let y = Math.max(0, box.y - padY);
  let w = Math.min(vw - x, box.width + padX * 2);
  let h = Math.min(vh - y, box.height + padY * 2);
  if (w < 80 || h < 80) return;
  const cropped = smartCtx.getImageData(x, y, w, h);
  const scale = 2;
  const upCanvas = document.createElement('canvas');
  upCanvas.width = Math.floor(w * scale);
  upCanvas.height = Math.floor(h * scale);
  const upCtx = upCanvas.getContext('2d');
  upCtx.imageSmoothingEnabled = true;
  upCtx.imageSmoothingQuality = 'high';
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  tmp.getContext('2d').putImageData(cropped, 0, 0);
  upCtx.drawImage(tmp, 0, 0, upCanvas.width, upCanvas.height);
}

// ═══════════════════════════════════════════════════════
// موفقیت اسکن
// ═══════════════════════════════════════════════════════
function onSuccess(text, statusEl) {
  console.log('[SCANNER] SUCCESS:', text);
  if (statusEl) statusEl.textContent = '✅ اسکن شد';
  if (navigator.vibrate) navigator.vibrate([70, 30, 70]);
  playBeep();
  if (onScanCallback) onScanCallback(text);
  closeScanner();
}

// ═══════════════════════════════════════════════════════
// ⭐ انتخاب پریست (کاملاً بازنویسی شد)
// ═══════════════════════════════════════════════════════
function showPresetPicker() {
  const old = document.getElementById('presetPopup');
  if (old) { old.remove(); return; }

  const popup = document.createElement('div');
  popup.id = 'presetPopup';
  // استایل به صورت لایه تمام صفحه تا مطمئن باشیم دیده می‌شود
  popup.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.7);
    z-index: 9999999; display: flex; align-items: center; justify-content: center;
    direction: rtl; padding: 16px; font-family: inherit;
  `;

  const available = Object.entries(PRESETS).filter(([key, p]) => {
    if (p.onlyAndroidChrome) return isAndroidChromeNative();
    return true;
  });

  popup.innerHTML = `
    <div style="background: #1e293b; border-radius: 16px; padding: 16px; width: 100%; max-width: 400px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); color: #fff;">
      <div style="font-weight: 700; font-size: 16px; margin-bottom: 16px; text-align: center; color: #fbbf24;">
        حالت اسکن را انتخاب کنید
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${available.map(([key, p]) => `
          <div class="preset-option" data-preset="${key}" style="
            padding: 12px;
            border-radius: 10px;
            cursor: pointer;
            background: ${key === currentPreset ? '#0d6efd' : 'rgba(255,255,255,0.1)'};
            border: 2px solid ${key === currentPreset ? '#60a5fa' : 'transparent'};
            transition: background 0.15s;
          ">
            <div style="font-weight: 700; font-size: 14px;">${p.name} ${key === currentPreset ? '✓' : ''}</div>
            <div style="font-size: 12px; opacity: 0.75; margin-top: 4px;">${p.desc}</div>
          </div>
        `).join('')}
      </div>

      <button id="presetCancelBtn" style="width: 100%; margin-top: 16px; padding: 12px; background: rgba(255,255,255,0.15); color: #fff; border: none; border-radius: 10px; cursor: pointer; font-family: inherit; font-weight: 600;">
        انصراف
      </button>
    </div>
  `;

  document.body.appendChild(popup);

  const close = () => popup.remove();
  popup.querySelector('#presetCancelBtn').onclick = close;
  popup.addEventListener('click', e => { if (e.target === popup) close(); });

  popup.querySelectorAll('.preset-option').forEach(el => {
    el.onclick = async (e) => {
      e.stopPropagation();
      const key = el.dataset.preset;
      if (key === currentPreset) { close(); return; }
      
      currentPreset = key;
      localStorage.setItem('scannerPreset', key);
      close();
      toast(`حالت «${PRESETS[key].name}» فعال شد`, 'success');

      if (isScanning) {
        const cb = onScanCallback;
        await closeScanner();
        setTimeout(() => startScanner(cb), 450);
      }
    };
  });
}

// ═══════════════════════════════════════════════════════
// بستن
// ═══════════════════════════════════════════════════════
export async function closeScanner() {
  const wrap = $('scannerWrap');
  if (wrap) wrap.classList.remove('active');

  await stopInternal();
  await stopSmart();

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
    try { await html5QrCode.stop(); await html5QrCode.clear(); } catch (e) {}
  }
  html5QrCode = null;
}

async function stopSmart() {
  smartRunning = false;
  if (smartRafId) { cancelAnimationFrame(smartRafId); smartRafId = null; }
  if (smartStream) { smartStream.getTracks().forEach(t => t.stop()); smartStream = null; }
  if (smartVideo) { smartVideo.srcObject = null; smartVideo = null; }
  smartCanvas = null;
  smartCtx = null;
  smartDetector = null;
}

// ═══════════════════════════════════════════════════════
// تغییر دوربین
// ═══════════════════════════════════════════════════════
async function switchCamera(deviceId) {
  if (currentPreset === 'smart') {
    toast('در حالت هوشمند تغییر دوربین پشتیبانی نمی‌شود', 'info');
    return;
  }
  if (!html5QrCode || !isScanning) return;

  const statusEl = $('scannerStatus');
  if (statusEl) statusEl.textContent = 'تغییر دوربین...';

  try {
    await html5QrCode.stop();
    const preset = PRESETS[currentPreset] || PRESETS.classic;
    const startConfig = { ...preset.config };
    await html5QrCode.start(deviceId, startConfig,
      (text) => onSuccess(text, statusEl),
      () => {}
    );
    currentCameraId = deviceId;
    if (statusEl) statusEl.textContent = 'آماده اسکن...';
  } catch (e) {
    toast('خطا در تغییر دوربین', 'danger');
  }
}

async function showCameraPicker() {
  if (currentPreset === 'smart') {
    toast('در حالت هوشمند فقط دوربین پشتی استفاده می‌شود', 'info');
    return;
  }

  const popup = $('cameraPopup');
  if (!popup) return;
  if (popup.style.display === 'block') {
    popup.style.display = 'none';
    return;
  }
  popup.style.display = 'block';
  popup.innerHTML = '<div style="color:#fff;text-align:center;padding:8px;">...</div>';

  try {
    if (!camerasCache.length) {
      camerasCache = await Html5Qrcode.getCameras() || [];
    }
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

// ═══════════════════════════════════════════════════════
// چسباندن
// ═══════════════════════════════════════════════════════
async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text?.trim()) { toast('کلیپ‌بورد خالیه', 'warning'); return; }
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
