import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/+esm';
import { $, beep } from './utils.js';

let html5 = null;
let nativeDetector = null;
let nativeStream = null;
let nativeVideo = null;
let nativeLoopId = null;
let callback = null;
let lastScan = '';
let lastScanTime = 0;
let cameras = [];
let isClosing = false;
let currentCameraId = localStorage.getItem('scanner_camera_id') || null;

function supportsNative() {
  return 'BarcodeDetector' in window;
}

// ═══════════════════════════════════════════════════════
// باز کردن اسکنر
// ═══════════════════════════════════════════════════════
export async function openScanner(cb) {
  callback = cb;
  isClosing = false;
  lastScan = '';
  lastScanTime = 0;
  $('scannerWrap').classList.add('active');
  $('scannerStatus').textContent = 'در حال راه‌اندازی...';

  // لیست دوربین‌ها را یک بار بگیر
  if (cameras.length === 0) {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
      tmp.getTracks().forEach(t => t.stop());
      await new Promise(r => setTimeout(r, 200));
      const devs = await Html5Qrcode.getCameras();
      cameras = devs || [];
      buildCameraMenu();
    } catch (e) {
      cameras = [];
    }
  } else {
    buildCameraMenu();
  }

  await new Promise(r => setTimeout(r, 250));

  if (supportsNative()) {
    await startNative();
  } else {
    await startHtml5();
  }
}

// ═══════════════════════════════════════════════════════
// اسکنر نیتیو
// ═══════════════════════════════════════════════════════
async function startNative() {
  try {
    const formats = ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39',
                     'data_matrix', 'pdf417', 'upc_a', 'upc_e', 'itf', 'codabar'];
    nativeDetector = new BarcodeDetector({ formats });

    const constraints = currentCameraId
      ? { video: { deviceId: { exact: currentCameraId }, width: { ideal: 1920 }, height: { ideal: 1080 } } }
      : { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } };

    nativeStream = await navigator.mediaDevices.getUserMedia(constraints);

    nativeVideo = document.createElement('video');
    nativeVideo.autoplay = true;
    nativeVideo.playsInline = true;
    nativeVideo.muted = true;
    nativeVideo.setAttribute('playsinline', '');
    nativeVideo.setAttribute('webkit-playsinline', '');
    nativeVideo.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
    nativeVideo.srcObject = nativeStream;

    const reader = $('reader');
    reader.innerHTML = '';
    reader.appendChild(nativeVideo);

    $('scannerStatus').textContent = '⚡ اسکنر سریع - بارکد را مقابل دوربین بگیرید';

    await nativeVideo.play().catch(() => {});
    nativeLoop();
  } catch (e) {
    console.warn('Native failed, fallback to html5:', e);
    await cleanupNative();
    await startHtml5();
  }
}

async function nativeLoop() {
  if (isClosing || !nativeStream || !nativeVideo || !nativeDetector) return;
  try {
    if (nativeVideo.readyState >= 2 && nativeVideo.videoWidth > 0) {
      const barcodes = await nativeDetector.detect(nativeVideo);
      if (barcodes.length > 0) {
        const val = barcodes[0].rawValue;
        const now = Date.now();
        if (!(val === lastScan && now - lastScanTime < 2500)) {
          lastScan = val; lastScanTime = now;
          beep();
          $('scannerStatus').textContent = '✓ شناسایی شد';
          const savedCb = callback;
          await closeScanner();
          setTimeout(() => savedCb && savedCb(val), 300);
          return;
        }
      }
    }
  } catch (e) {
    // اگر خطا داد، loop را ادامه بده
  }
  if (!isClosing && nativeStream) {
    nativeLoopId = requestAnimationFrame(nativeLoop);
  }
}

// ═══════════════════════════════════════════════════════
// اسکنر html5-qrcode (fallback)
// ═══════════════════════════════════════════════════════
async function startHtml5() {
  const reader = $('reader');
  reader.innerHTML = '<div id="html5-reader" style="width:100%;height:100%;"></div>';

  html5 = new Html5Qrcode('html5-reader');

  const config = {
    fps: 12,
    qrbox: { width: 260, height: 260 },
    aspectRatio: 1.0,
    formatsToSupport: [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.DATA_MATRIX,
      Html5QrcodeSupportedFormats.PDF_417,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.ITF,
      Html5QrcodeSupportedFormats.CODABAR
    ]
  };

  const target = currentCameraId
    ? { deviceId: { exact: currentCameraId } }
    : { facingMode: 'environment' };

  try {
    await html5.start(
      target,
      config,
      (text) => {
        const now = Date.now();
        if (text === lastScan && now - lastScanTime < 2500) return;
        lastScan = text; lastScanTime = now;
        beep();
        $('scannerStatus').textContent = '✓ شناسایی شد';
        const savedCb = callback;
        closeScanner().then(() => setTimeout(() => savedCb && savedCb(text), 300));
      },
      () => {}
    );
    $('scannerStatus').textContent = 'بارکد را مقابل دوربین بگیرید';
  } catch (e) {
    $('scannerStatus').textContent = '❌ ' + (e.message || e);
    beep(300);
  }
}

// ═══════════════════════════════════════════════════════
// بستن و پاکسازی
// ═══════════════════════════════════════════════════════
export async function closeScanner() {
  if (isClosing) return;
  isClosing = true;

  // ۱. توقف loop
  if (nativeLoopId) {
    cancelAnimationFrame(nativeLoopId);
    nativeLoopId = null;
  }

  // ۲. توقف naitve
  await cleanupNative();

  // ۳. توقف html5
  if (html5) {
    try {
      const st = html5.getState ? html5.getState() : null;
      if (st === 2 || st === 3) { // SCANNING or PAUSED
        await html5.stop();
      }
      await html5.clear();
    } catch (e) {}
    html5 = null;
  }

  // ۴. پاک کردن reader
  const reader = $('reader');
  if (reader) reader.innerHTML = '';

  // ۵. مخفی کردن
  $('scannerWrap').classList.remove('active');

  // ۶. مکث کوتاه برای آزاد شدن دوربین
  await new Promise(r => setTimeout(r, 400));

  isClosing = false;
}

async function cleanupNative() {
  if (nativeVideo) {
    try {
      nativeVideo.pause();
      nativeVideo.srcObject = null;
      nativeVideo.removeAttribute('src');
      nativeVideo.load();
    } catch (e) {}
    nativeVideo = null;
  }
  if (nativeStream) {
    try {
      nativeStream.getTracks().forEach(t => { t.enabled = false; t.stop(); });
    } catch (e) {}
    nativeStream = null;
  }
  nativeDetector = null;
}

// ═══════════════════════════════════════════════════════
// منوی انتخاب دوربین
// ═══════════════════════════════════════════════════════
function buildCameraMenu() {
  const popup = document.getElementById('cameraPopup');
  if (!popup) return;

  if (cameras.length === 0) {
    popup.innerHTML = '<div style="color:#fff;font-size:12px;text-align:center;">دوربینی یافت نشد</div>';
    return;
  }

  popup.innerHTML = `
    <div style="color:#fff;font-size:12px;text-align:center;margin-bottom:8px;">انتخاب دوربین</div>
    ${cameras.map((c, i) => {
      const active = (currentCameraId === c.id) || (!currentCameraId && i === 0);
      const lbl = c.label || `دوربین ${i + 1}`;
      return `<button data-cam-id="${c.id}" style="display:block;width:100%;text-align:right;
        background:${active ? 'rgba(13,110,253,.6)' : 'rgba(255,255,255,.1)'};
        color:#fff;border:none;border-radius:8px;padding:10px 12px;margin-bottom:6px;
        cursor:pointer;font-family:inherit;font-size:13px;">
        ${active ? '✓ ' : ''}${lbl}
      </button>`;
    }).join('')}
  `;
  popup.querySelectorAll('[data-cam-id]').forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      selectCamera(b.dataset.camId);
    };
  });
}

async function selectCamera(id) {
  if (!id) return;
  currentCameraId = id;
  localStorage.setItem('scanner_camera_id', id);
  closeCameraPopup();
  $('scannerStatus').textContent = 'در حال تغییر دوربین...';

  const savedCb = callback;
  await closeScanner();
  await new Promise(r => setTimeout(r, 500));
  await openScanner(savedCb);
}

function closeCameraPopup() {
  const popup = document.getElementById('cameraPopup');
  if (popup) popup.style.display = 'none';
}

// ═══════════════════════════════════════════════════════
// راه‌اندازی دکمه‌ها
// ═══════════════════════════════════════════════════════
export function initScannerButtons() {
  $('btnScanClose').onclick = async () => {
    const cb = callback;
    callback = null;
    await closeScanner();
    // اگر می‌خواهی برگشت به صفحه اصلی، اینجا می‌تونی منطق بذاری
  };

  $('btnScanManual').onclick = async () => {
    const v = prompt('بارکد را وارد کنید:');
    if (v?.trim()) {
      const cb = callback;
      await closeScanner();
      setTimeout(() => cb && cb(v.trim()), 200);
    }
  };

  const camBtn = $('btnCameraSelect');
  if (camBtn) {
    camBtn.onclick = (e) => {
      e.stopPropagation();
      if (cameras.length === 0) {
        // اگر هنوز لیست نشده، دوباره بگیر
        Html5Qrcode.getCameras().then(devs => {
          cameras = devs || [];
          buildCameraMenu();
          const popup = $('cameraPopup');
          if (popup) popup.style.display = popup.style.display === 'block' ? 'none' : 'block';
        });
        return;
      }
      buildCameraMenu();
      const popup = $('cameraPopup');
      if (popup) popup.style.display = popup.style.display === 'block' ? 'none' : 'block';
    };
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#btnCameraSelect')) closeCameraPopup();
  });
}
