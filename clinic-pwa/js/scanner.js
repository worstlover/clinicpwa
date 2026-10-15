// js/scanner.js
import { $, toast } from './utils.js';

let codeReader = null;
let controls = null;
let currentDeviceId = null;
let onScanCallback = null;

// ═══════════════════════════════════════════════════════
// راه‌اندازی اولیه اسکنر
// ═══════════════════════════════════════════════════════
export function initScannerButtons() {
  const btnCamera = $('btnCameraSelect');
  const btnPaste = $('btnScanPaste');
  const btnClose = $('btnScanClose');

  if (btnClose) btnClose.onclick = () => closeScanner();
  if (btnPaste) btnPaste.onclick = () => pasteFromClipboard();
  if (btnCamera) btnCamera.onclick = () => showCameraPicker();

  // کلیک روی پس‌زمینه اسکنر هم ببنده
  const wrap = $('scannerWrap');
  if (wrap) {
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) closeScanner();
    });
  }

  console.log('[SCANNER] buttons initialized');
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
    // ساخت خواننده با تنظیمات بهینه
    if (!codeReader) {
      codeReader = new ZXing.BrowserMultiFormatReader();
    }

    // تنظیمات دوربین: اولویت به دوربین پشت
    const constraints = {
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        // focusMode در صورت پشتیبانی
        ...(navigator.mediaDevices.getSupportedConstraints().focusMode
          ? { focusMode: 'continuous' }
          : {})
      }
    };

    // شروع دیکود کردن
    controls = await codeReader.decodeFromConstraints(
      constraints,
      'reader',
      (result, error) => {
        if (result) {
          console.log('[SCANNER] scanned:', result.getText());
          if (statusEl) statusEl.textContent = '✅ اسکن شد: ' + result.getText().substring(0, 30);
          if (onScanCallback) onScanCallback(result.getText());
          // لرزش کوتاه
          if (navigator.vibrate) navigator.vibrate(100);
          closeScanner();
        }
        // error رو نادیده بگیر (وقتی چیزی پیدا نمی‌شه خطا می‌ده)
      }
    );

    if (statusEl) statusEl.textContent = 'آماده اسکن...';

    // ذخیره device id برای انتخاب دوربین
    if (controls && controls.stream) {
      const track = controls.stream.getVideoTracks()[0];
      if (track) {
        const settings = track.getSettings();
        currentDeviceId = settings.deviceId;
      }
    }

    // پر کردن لیست دوربین‌ها
    setTimeout(() => populateCameraList(), 500);

  } catch (err) {
    console.error('[SCANNER] start error:', err);
    if (statusEl) statusEl.textContent = 'خطا در راه‌اندازی دوربین';
    toast('خطا در دسترسی به دوربین: ' + err.message, 'danger');
    // اگه اجازه نداشت، ببند
    if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
      closeScanner();
    }
  }
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

  // پاک کردن video element
  const reader = $('reader');
  if (reader) {
    reader.innerHTML = '';
  }

  const statusEl = $('scannerStatus');
  if (statusEl) statusEl.textContent = 'آماده اسکن...';

  console.log('[SCANNER] closed');
}

// ═══════════════════════════════════════════════════════
// انتخاب دوربین
// ═══════════════════════════════════════════════════════
async function populateCameraList() {
  const popup = $('cameraPopup');
  if (!popup || !codeReader) return;

  try {
    // دریافت لیست دوربین‌ها
    const devices = await ZXing.BrowserCodeReader.listVideoInputDevices();
    if (!devices || devices.length <= 1) {
      popup.style.display = 'none';
      return;
    }

    popup.innerHTML = devices.map((d, i) => `
      <div class="camera-option" data-id="${d.deviceId}" style="
        padding: 10px 12px;
        border-radius: 8px;
        margin-bottom: 4px;
        cursor: pointer;
        color: #fff;
        font-size: 0.85rem;
        background: ${d.deviceId === currentDeviceId ? '#0d6efd' : 'rgba(255,255,255,0.1)'};
        display: flex;
        align-items: center;
        gap: 8px;
      ">
        <i class="bi bi-camera-video${d.deviceId === currentDeviceId ? '-fill' : ''}"></i>
        <span>${d.label || 'دوربین ' + (i + 1)}</span>
        ${d.deviceId === currentDeviceId ? '<i class="bi bi-check2" style="margin-right:auto;"></i>' : ''}
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
  }
}

async function switchCamera(deviceId) {
  if (controls) {
    try { controls.stop(); } catch (e) {}
  }
  const statusEl = $('scannerStatus');
  if (statusEl) statusEl.textContent = 'در حال تغییر دوربین...';

  try {
    if (!codeReader) codeReader = new ZXing.BrowserMultiFormatReader();
    controls = await codeReader.decodeFromVideoDevice(
      deviceId,
      'reader',
      (result, error) => {
        if (result) {
          if (statusEl) statusEl.textContent = '✅ اسکن شد';
          if (onScanCallback) onScanCallback(result.getText());
          if (navigator.vibrate) navigator.vibrate(100);
          closeScanner();
        }
      }
    );
    currentDeviceId = deviceId;
    if (statusEl) statusEl.textContent = 'آماده اسکن...';
  } catch (e) {
    console.error('[SCANNER] switch error:', e);
    toast('خطا در تغییر دوربین', 'danger');
    if (statusEl) statusEl.textContent = 'خطا';
  }
}

function showCameraPicker() {
  const popup = $('cameraPopup');
  if (!popup) return;
  popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
  if (popup.style.display === 'block') populateCameraList();
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
    toast('دسترسی به کلیپ‌بورد ممکن نیست', 'warning');
    // روش قدیمی
    const manual = prompt('کد را وارد کنید:');
    if (manual && manual.trim()) {
      if (onScanCallback) onScanCallback(manual.trim());
      closeScanner();
    }
  }
}
