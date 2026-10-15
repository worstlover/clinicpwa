// js/scanner.js
import { $, toast } from './utils.js';

let html5QrCode = null;
let onScanCallback = null;
let isScanning = false;
let currentCameraId = null;
let camerasCache = [];

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
  console.log('[SCANNER] ready (native-first + DataMatrix)');
}

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

    // 🔥 نیتیو اولویت اول + فرمت‌های دارویی
    html5QrCode = new Html5Qrcode('reader', {
      verbose: false,
      useBarCodeDetectorIfSupported: true,   // ← نیتیو کروم اندروید اول
      formatsToSupport: [
        Html5QrcodeSupportedFormats.DATA_MATRIX,  // اولویت ۱ (دارو)
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.AZTEC,
        Html5QrcodeSupportedFormats.PDF_417,
      ]
    });

    // چک کن نیتیو فعاله یا نه
    const isNative = 'BarcodeDetector' in window;
    console.log('[SCANNER] native BarcodeDetector:', isNative);

    const devices = await Html5Qrcode.getCameras();
    camerasCache = devices || [];

    if (!camerasCache.length) {
      toast('دوربین پیدا نشد', 'danger');
      setTimeout(() => closeScanner(), 2000);
      return;
    }

    // دوربین پشتی
    const backCam = camerasCache.find(d => {
      const l = (d.label || '').toLowerCase();
      return l.includes('back') || l.includes('rear') || l.includes('environment') ||
             l.includes('پشت') || l.includes('عقب');
    });
    const cameraId = backCam ? backCam.id : camerasCache[0].id;
    currentCameraId = cameraId;

    // کانفیگ تهاجمی برای Data Matrix کوچک
    const config = {
      fps: 15,                    // بالاتر برای سرعت
      qrbox: function (w, h) {
        // ناحیه بزرگ‌تر تا کد کامل داخلش باشه
        const size = Math.floor(Math.min(w, h) * 0.85);
        return { width: size, height: size };
      },
      aspectRatio: 1.0,
      disableFlip: false,
      // رزولوشن بالاتر برای کدهای کوچک دارویی
      videoConstraints: {
        facingMode: 'environment',
        width:  { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 },
      }
    };

    await html5QrCode.start(
      cameraId,
      config,
      (decodedText, decodedResult) => {
        console.log('[SCANNER] SUCCESS:', decodedText, decodedResult);
        if (statusEl) statusEl.textContent = '✅ اسکن شد';
        if (navigator.vibrate) navigator.vibrate([70, 30, 70]);
        playBeep();
        if (onScanCallback) onScanCallback(decodedText);
        closeScanner();
      },
      () => {} // خطاهای فریم رو نادیده بگیر
    );

    isScanning = true;
    if (statusEl) {
      statusEl.textContent = isNative
        ? 'نیتیو فعال • آماده اسکن Data Matrix'
        : 'آماده اسکن...';
    }

  } catch (err) {
    console.error('[SCANNER] start error:', err);
    handleStartError(err, statusEl);
  }
}

export const openScanner = startScanner;

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
}

async function stopInternal() {
  if (html5QrCode && isScanning) {
    try {
      await html5QrCode.stop();
      await html5QrCode.clear();
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
    const config = {
      fps: 15,
      qrbox: (w, h) => {
        const size = Math.floor(Math.min(w, h) * 0.85);
        return { width: size, height: size };
      },
      aspectRatio: 1.0,
      disableFlip: false,
    };
    await html5QrCode.start(deviceId, config,
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
