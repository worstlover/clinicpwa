// js/scanner.js
import { $, toast } from './utils.js';

let codeReader = null;
let controls = null;
let currentDeviceId = null;
let onScanCallback = null;
let cachedDevices = [];

// ═══════════════════════════════════════════════════════
// راه‌اندازی دکمه‌ها
// ═══════════════════════════════════════════════════════
export function initScannerButtons() {
  const btnCamera = $('btnCameraSelect');
  const btnPaste = $('btnScanPaste');
  const btnClose = $('btnScanClose');

  if (btnClose) btnClose.onclick = () => closeScanner();
  if (btnPaste) btnPaste.onclick = () => pasteFromClipboard();
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

  console.log('[SCANNER] buttons initialized');
}

// ═══════════════════════════════════════════════════════
// ⭐ درخواست اجازه + گرفتن استریم + لیست دوربین‌ها
// ═══════════════════════════════════════════════════════
async function acquireStream() {
  try {
    // ⭐ constraints آزاد: روی دسکتاپ و موبایل کار می‌کنه
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    // ⭐ در حین فعال بودن استریم، لیست دوربین‌ها رو کش کن
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      cachedDevices = allDevices.filter(d => d.kind === 'videoinput');
      console.log('[SCANNER] cached devices:', cachedDevices);
    } catch (e) {
      console.warn('[SCANNER] enumerate failed:', e);
    }

    // ⭐ ذخیره deviceId فعلی
    const track = stream.getVideoTracks()[0];
    if (track) {
      const settings = track.getSettings();
      currentDeviceId = settings.deviceId;
      console.log('[SCANNER] current device:', currentDeviceId);
    }

    return stream;
  } catch (err) {
    console.warn('[SCANNER] acquire stream failed:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// ساخت <video>
// ═══════════════════════════════════════════════════════
function createVideoElement() {
  const reader = $('reader');
  if (!reader) return null;

  reader.innerHTML = '';

  const videoEl = document.createElement('video');
  videoEl.setAttribute('autoplay', '');
  videoEl.setAttribute('muted', '');
  videoEl.setAttribute('playsinline', '');
  videoEl.setAttribute('webkit-playsinline', '');
  videoEl.style.width = '100%';
  videoEl.style.height = '100%';
  videoEl.style.objectFit = 'cover';
  videoEl.style.display = 'block';

  reader.appendChild(videoEl);
  return videoEl;
}

// ═══════════════════════════════════════════════════════
// ⭐ انتخاب بک‌کمرا
// ═══════════════════════════════════════════════════════
function pickBestCamera(devices) {
  if (!devices || !devices.length) return null;

  const backKeywords = ['back', 'rear', 'environment', 'پشت', 'عقب'];
  const backDevice = devices.find(d => {
    const label = (d.label || '').toLowerCase();
    return backKeywords.some(k => label.includes(k));
  });

  if (backDevice) return backDevice.deviceId;
  return devices[0].deviceId;
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
    // چک ZXing
    if (typeof ZXing === 'undefined' || !ZXing.BrowserMultiFormatReader) {
      if (statusEl) statusEl.textContent = 'کتابخانه اسکنر بارگذاری نشده';
      toast('کتابخانه اسکنر پیدا نشد. اتصال اینترنت را چک کنید.', 'danger');
      return;
    }

    // ⭐ آزاد کردن استریم قبلی (اگه هست)
    await releaseCurrentStream();

    // ⭐ گرفتن استریم جدید
    if (statusEl) statusEl.textContent = 'درخواست دسترسی به دوربین...';
    const stream = await acquireStream();

    if (!stream) {
      if (statusEl) statusEl.textContent = 'دسترسی به دوربین رد شد';
      toast('برای اسکن، اجازه دسترسی به دوربین را بدهید', 'danger');
      setTimeout(() => closeScanner(), 2500);
      return;
    }

    // ⭐ شروع دیکود با همون استریم
    await startDecodeWithStream(stream, statusEl);
    if (statusEl) statusEl.textContent = 'آماده اسکن...';

  } catch (err) {
    console.error('[SCANNER] start error:', err);
    handleStartError(err, statusEl);
  }
}

// alias
export const openScanner = startScanner;

// ═══════════════════════════════════════════════════════
// ⭐ آزاد کردن استریم فعلی
// ═══════════════════════════════════════════════════════
async function releaseCurrentStream() {
  if (controls) {
    try {
      controls.stop();
    } catch (e) {
      console.warn('[SCANNER] controls.stop failed:', e);
    }
    controls = null;
  }
  // یه وقفه کوچیک برای آزاد شدن دوربین
  await new Promise(r => setTimeout(r, 250));
}

// ═══════════════════════════════════════════════════════
// ⭐ شروع دیکود با استریم موجود
// ═══════════════════════════════════════════════════════
async function startDecodeWithStream(stream, statusEl) {
  const videoEl = createVideoElement();
  if (!videoEl) throw new Error('reader element not found');

  // وصل کردن stream به video
  videoEl.srcObject = stream;

  if (!codeReader) {
    codeReader = new ZXing.BrowserMultiFormatReader();
  }

  // ⭐ استفاده از decodeFromStream (نه decodeFromVideoDevice)
  // چون استریم از قبل داریم، ZXing نمی‌خواد دوربین رو دوباره باز کنه
  controls = await codeReader.decodeFromStream(
    stream,
    videoEl,
    (result) => {
      if (result) {
        const text = result.getText();
        console.log('[SCANNER] scanned:', text);
        if (statusEl) statusEl.textContent = '✅ اسکن شد';
        if (navigator.vibrate) navigator.vibrate(100);
        if (onScanCallback) onScanCallback(text);
        closeScanner();
      }
    }
  );

  return controls;
}

// ═══════════════════════════════════════════════════════
// مدیریت خطا
// ═══════════════════════════════════════════════════════
function handleStartError(err, statusEl) {
  if (statusEl) statusEl.textContent = 'خطا در راه‌اندازی دوربین';

  let msg = 'خطا در دسترسی به دوربین: ';
  if (err.name === 'NotAllowedError' || err.message?.includes('Permission')) {
    msg = 'دسترسی به دوربین رد شد. از تنظیمات مرورگر اجازه دهید.';
  } else if (err.name === 'NotFoundError' || err.message?.includes('not found')) {
    msg = 'دوربینی روی دستگاه پیدا نشد';
  } else if (err.name === 'NotReadableError' || err.message?.includes('could not start')) {
    msg = 'دوربین در حال استفاده است. لطفاً چند لحظه صبر کنید یا برنامه‌های دیگر را ببندید.';
  } else if (err.name === 'OverconstrainedError') {
    msg = 'تنظیمات دوربین با دستگاه سازگار نیست';
  } else {
    msg += err.message;
  }
  toast(msg, 'danger');

  if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
    setTimeout(() => closeScanner(), 2500);
  }
}

// ═══════════════════════════════════════════════════════
// بستن
// ═══════════════════════════════════════════════════════
export async function closeScanner() {
  const wrap = $('scannerWrap');
  if (wrap) wrap.classList.remove('active');

  if (controls) {
    try { controls.stop(); } catch (e) {}
    controls = null;
  }

  const reader = $('reader');
  if (reader) reader.innerHTML = '';

  const statusEl = $('scannerStatus');
  if (statusEl) statusEl.textContent = 'آماده اسکن...';

  const popup = $('cameraPopup');
  if (popup) popup.style.display = 'none';

  console.log('[SCANNER] closed');
}

// ═══════════════════════════════════════════════════════
// ⭐ لیست دوربین‌ها (با استفاده از کش)
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
    // اگه کش خالیه، دوباره enumerate کن
    if (!cachedDevices.length) {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      cachedDevices = allDevices.filter(d => d.kind === 'videoinput');
    }

    if (!cachedDevices.length) {
      popup.innerHTML = `
        <div style="color:#fff;font-size:0.8rem;text-align:center;padding:12px;">
          دوربینی یافت نشد<br>
          <span style="font-size:0.7rem;opacity:0.7;">دسترسی به دوربین را چک کنید</span>
        </div>`;
      return;
    }

    popup.innerHTML = cachedDevices.map((d, i) => `
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

// ═══════════════════════════════════════════════════════
// ⭐ تغییر دوربین
// ═══════════════════════════════════════════════════════
async function switchCamera(deviceId) {
  const statusEl = $('scannerStatus');
  if (statusEl) statusEl.textContent = 'در حال تغییر دوربین...';

  try {
    // ⭐ آزاد کردن استریم قبلی با تاخیر
    await releaseCurrentStream();

    // ⭐ گرفتن استریم از دوربین جدید
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    // شروع دیکود با استریم جدید
    await startDecodeWithStream(stream, statusEl);
    currentDeviceId = deviceId;
    if (statusEl) statusEl.textContent = 'آماده اسکن...';

  } catch (e) {
    console.error('[SCANNER] switch error:', e);

    let msg = 'خطا در تغییر دوربین';
    if (e.name === 'NotReadableError') {
      msg = 'دوربین آزاد نشد. چند ثانیه صبر کنید و دوباره امتحان کنید.';
    } else if (e.name === 'NotAllowedError') {
      msg = 'دسترسی به دوربین رد شد';
    } else if (e.name === 'OverconstrainedError') {
      msg = 'این دوربین در دسترس نیست';
    } else {
      msg += ': ' + e.message;
    }
    toast(msg, 'danger');

    if (statusEl) statusEl.textContent = 'خطا — دوباره تلاش کنید';
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
    toast('دسترسی به کلیپ‌بورد ممکن نیست', 'warning');
    const manual = prompt('کد را وارد کنید:');
    if (manual && manual.trim()) {
      if (onScanCallback) onScanCallback(manual.trim());
      closeScanner();
    }
  }
}
