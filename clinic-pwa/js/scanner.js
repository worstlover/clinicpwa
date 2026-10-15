// js/scanner.js
import { $, toast } from './utils.js';

let codeReader = null;
let controls = null;
let currentDeviceId = null;
let onScanCallback = null;

// ═══════════════════════════════════════════════════════
// راه‌اندازی دکمه‌ها
// ═══════════════════════════════════════════════════════
export function initScannerButtons() {
  const btnCamera = $('btnCameraSelect');
  const btnPaste = $('btnScanPaste');
  const btnClose = $('btnScanClose');

  if (btnClose) btnClose.onclick = () => closeScanner();
  if (btnPaste) btnPaste.onclick = () => pasteFromClipboard();
  if (btnCamera) btnCamera.onclick = (e) => { e.stopPropagation(); showCameraPicker(); };

  const wrap = $('scannerWrap');
  if (wrap) {
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) closeScanner();
    });
  }

  console.log('[SCANNER] buttons initialized');
}

// ═══════════════════════════════════════════════════════
// شروع اسکن — نسخه مقاوم
// ═══════════════════════════════════════════════════════
export async function startScanner(callback) {
  onScanCallback = callback;
  const wrap = $('scannerWrap');
  const statusEl = $('scannerStatus');
  if (!wrap) return;

  wrap.classList.add('active');
  if (statusEl) statusEl.textContent = 'در حال راه‌اندازی دوربین...';

  try {
    // چک ZXing
    if (typeof ZXing === 'undefined' || !ZXing.BrowserMultiFormatReader) {
      if (statusEl) statusEl.textContent = 'کتابخانه اسکنر بارگذاری نشده';
      toast('کتابخانه اسکنر پیدا نشد. اتصال اینترنت را چک کنید.', 'danger');
      return;
    }

    // ساخت خواننده
    codeReader = new ZXing.BrowserMultiFormatReader();

    // گرفتن لیست دوربین‌ها
    let devices = [];
    try {
      devices = await ZXing.BrowserCodeReader.listVideoInputDevices();
      console.log('[SCANNER] devices:', devices);
    } catch (e) {
      console.warn('[SCANNER] list devices failed:', e);
    }

    // اگه هیچ دوربینی نبود
    if (!devices || devices.length === 0) {
      if (statusEl) statusEl.textContent = 'دوربینی یافت نشد';
      toast('دوربینی روی دستگاه پیدا نشد', 'danger');
      return;
    }

    // انتخاب دوربین: ترجیحاً بک‌کمرا
    let deviceId = null;
    const backKeywords = ['back', 'rear', 'environment', 'پشت', 'عقب'];
    const backDevice = devices.find(d => {
      const label = (d.label || '').toLowerCase();
      return backKeywords.some(k => label.includes(k));
    });

    if (backDevice) {
      deviceId = backDevice.deviceId;
    } else if (devices.length > 1) {
      // آخرین دوربین (معمولاً بک‌کمرا)
      deviceId = devices[devices.length - 1].deviceId;
    } else {
      deviceId = devices[0].deviceId;
    }

    console.log('[SCANNER] selected device:', deviceId);

    // شروع دیکود
    await startDecodeWithDevice(deviceId, statusEl);

    currentDeviceId = deviceId;
    if (statusEl) statusEl.textContent = 'آماده اسکن...';

  } catch (err) {
    console.error('[SCANNER] start error:', err);
    if (statusEl) statusEl.textContent = 'خطا در راه‌اندازی دوربین';

    let userMessage = 'خطا در دسترسی به دوربین: ';
    if (err.name === 'NotAllowedError' || err.message?.includes('Permission')) {
      userMessage = 'دسترسی به دوربین رد شد. از تنظیمات مرورگر اجازه دهید.';
    } else if (err.name === 'NotFoundError' || err.message?.includes('not found')) {
      userMessage = 'دوربینی پیدا نشد';
    } else if (err.name === 'NotReadableError' || err.message?.includes('could not start')) {
      userMessage = 'دوربین در حال استفاده توسط برنامه دیگر است. برنامه‌های دیگر را ببندید.';
    } else if (err.name === 'OverconstrainedError') {
      userMessage = 'تنظیمات دوربین با دستگاه سازگار نیست';
    } else {
      userMessage += err.message;
    }

    toast(userMessage, 'danger');

    if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
      setTimeout(() => closeScanner(), 1500);
    }
  }
}

// ⭐ alias برای ماژول‌های دیگر
export const openScanner = startScanner;

// ═══════════════════════════════════════════════════════
// شروع دیکود با deviceId مشخص
// ═══════════════════════════════════════════════════════
async function startDecodeWithDevice(deviceId, statusEl) {
  // اگه قبلی بازه، ببندش
  if (controls) {
    try { controls.stop(); } catch (e) {}
    controls = null;
  }

  // پاک کردن reader
  const reader = $('reader');
  if (reader) reader.innerHTML = '';

  // استفاده از decodeFromVideoDevice با deviceId مشخص
  controls = await codeReader.decodeFromVideoDevice(
    deviceId,
    'reader',
    (result, error, ctrls) => {
      if (result) {
        const text = result.getText();
        console.log('[SCANNER] scanned:', text);
        if (statusEl) statusEl.textContent = '✅ اسکن شد';
        if (navigator.vibrate) navigator.vibrate(100);
        if (onScanCallback) onScanCallback(text);
        closeScanner();
      }
      // error رو نادیده بگیر چون ZXing برای هر فریم خطا می‌ده وقتی چیزی نمی‌بینه
    }
  );

  return controls;
}

// ═══════════════════════════════════════════════════════
// توقف اسکن
// ═══════════════════════════════════════════════════════
export function closeScanner() {
  const wrap = $('scannerWrap');
  if (wrap) wrap.classList.remove('active');

  if (controls) {
    try { controls.stop(); } catch (e) { console.warn('[SCANNER] stop error:', e); }
    controls = null;
  }

  const reader = $('reader');
  if (reader) reader.innerHTML = '';

  const statusEl = $('scannerStatus');
  if (statusEl) statusEl.textContent = 'آماده اسکن...';

  // بستن پاپ‌آپ دوربین
  const popup = $('cameraPopup');
  if (popup) popup.style.display = 'none';

  console.log('[SCANNER] closed');
}

// ═══════════════════════════════════════════════════════
// انتخاب دوربین
// ═══════════════════════════════════════════════════════
async function showCameraPicker() {
  const popup = $('cameraPopup');
  if (!popup) return;

  // toggle
  if (popup.style.display === 'block') {
    popup.style.display = 'none';
    return;
  }

  popup.style.display = 'block';
  popup.innerHTML = '<div style="color:#fff;font-size:0.8rem;text-align:center;padding:8px;">در حال بارگذاری...</div>';

  try {
    const devices = await ZXing.BrowserCodeReader.listVideoInputDevices();
    if (!devices || devices.length === 0) {
      popup.innerHTML = '<div style="color:#fff;font-size:0.8rem;text-align:center;padding:8px;">دوربینی یافت نشد</div>';
      return;
    }

    popup.innerHTML = devices.map((d, i) => `
      <div class="camera-option" data-id="${d.deviceId}" style="
        padding: 10px 12px;
        border-radius: 8px;
        margin-bottom: 4px;
        cursor: pointer;
        color: #fff;
        font-size: 0.82rem;
        background: ${d.deviceId === currentDeviceId ? '#0d6efd' : 'rgba(255,255,255,0.1)'};
        display: flex;
        align-items: center;
        gap: 8px;
      ">
        <i class="bi bi-camera-video${d.deviceId === currentDeviceId ? '-fill' : ''}"></i>
        <span style="flex:1;">${d.label || 'دوربین ' + (i + 1)}</span>
        ${d.deviceId === currentDeviceId ? '<i class="bi bi-check2"></i>' : ''}
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

async function switchCamera(deviceId) {
  const statusEl = $('scannerStatus');
  if (statusEl) statusEl.textContent = 'در حال تغییر دوربین...';

  try {
    await startDecodeWithDevice(deviceId, statusEl);
    currentDeviceId = deviceId;
    if (statusEl) statusEl.textContent = 'آماده اسکن...';
  } catch (e) {
    console.error('[SCANNER] switch error:', e);
    toast('خطا در تغییر دوربین', 'danger');
    if (statusEl) statusEl.textContent = 'خطا';
  }
}

// ═══════════════════════════════════════════════════════
// چسباندن از clipboard
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
    const manual = prompt('کد را وارد کنید:');
    if (manual && manual.trim()) {
      if (onScanCallback) onScanCallback(manual.trim());
      closeScanner();
    }
  }
}
