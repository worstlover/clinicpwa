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
let consecutiveFailures = 0;

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
  consecutiveFailures = 0;
  $('scannerWrap').classList.add('active');
  $('scannerStatus').textContent = 'در حال راه‌اندازی...';

  // گرفتن لیست دوربین‌ها
  if (cameras.length === 0) {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
      tmp.getTracks().forEach(t => t.stop());
      await new Promise(r => setTimeout(r, 150));
      const devs = await Html5Qrcode.getCameras();
      cameras = devs || [];
      buildCameraMenu();
    } catch (e) {
      cameras = [];
    }
  } else {
    buildCameraMenu();
  }

  await new Promise(r => setTimeout(r, 200));

  if (supportsNative()) {
    await startNative();
  } else {
    await startHtml5();
  }
}

// ═══════════════════════════════════════════════════════
// اسکنر نیتیو (سریع‌ترین حالت)
// ═══════════════════════════════════════════════════════
async function startNative() {
  try {
    // فورمت‌های اصلی - ترتیب: سریع‌ترین اول
    const formats = ['qr_code', 'ean_13', 'code_128', 'code_39', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar', 'data_matrix', 'pdf417'];
    nativeDetector = new BarcodeDetector({ formats });

    // ⭐ رزولوشن پایین‌تر = تشخیص سریع‌تر
    const constraints = currentCameraId
      ? {
          video: {
            deviceId: { exact: currentCameraId },
            width: { ideal: 1280 },  // ⭐ 1280 کافیه برای اکثر بارکدها
            height: { ideal: 720 },
            frameRate: { ideal: 30, min: 15 },
            focusMode: 'continuous'
          }
        }
      : {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, min: 15 },
            focusMode: 'continuous'
          }
        };

    nativeStream = await navigator.mediaDevices.getUserMedia(constraints);

    // تلاش برای فعال کردن autofocus و torch settings
    try {
      const track = nativeStream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      const constraints2 = {};
      if (caps.focusMode && caps.focusMode.includes('continuous')) {
        constraints2.focusMode = 'continuous';
      }
      if (Object.keys(constraints2).length) {
        await track.applyConstraints({ advanced: [constraints2] });
      }
    } catch (e) {}

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
    setTimeout(nativeLoop, 200);
  } catch (e) {
    console.warn('Native failed:', e);
    await cleanupNative();
    await startHtml5();
  }
}

// ═══════════════════════════════════════════════════════
// حلقه تشخیص سریع
// ═══════════════════════════════════════════════════════
async function nativeLoop() {
  if (isClosing || !nativeStream || !nativeVideo || !nativeDetector) return;

  try {
    if (nativeVideo.readyState >= 2 && nativeVideo.videoWidth > 0) {
      // ⭐ چند بار تلاش برای تشخیص سریع
      const barcodes = await nativeDetector.detect(nativeVideo);

      if (barcodes.length > 0) {
        const val = barcodes[0].rawValue;
        const now = Date.now();
        if (!(val === lastScan && now - lastScanTime < 2000)) {
          lastScan = val;
          lastScanTime = now;
          consecutiveFailures = 0;
          beep();
          $('scannerStatus').textContent = '✓ شناسایی شد';
          const savedCb = callback;
          await closeScanner();
          setTimeout(() => savedCb && savedCb(val), 250);
          return;
        }
      } else {
        consecutiveFailures++;
      }
    }
  } catch (e) {
    consecutiveFailures++;
    // اگر چند بار پشت‌سرهم خطا داد، به html5 سوییچ کن
    if (consecutiveFailures > 30) {
      console.warn('Too many native failures, switching to html5');
      await cleanupNative();
      await startHtml5();
      return;
    }
  }

  // ⭐ استفاده از requestAnimationFrame برای سرعت بیشتر
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

  // ⭐ کانفیگ سریع - فقط QR و بارکدهای رایج
  const config = {
    fps: 20,                       // ⭐ فریم بالاتر برای تشخیص سریع‌تر
    qrbox: function(viewfinderWidth, viewfinderHeight) {
      // باکس داینامیک
      const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
      const size = Math.floor(minEdge * 0.7);
      return { width: size, height: size };
    },
    aspectRatio: 1.0,
    disableFlip: false,
    experimentalFeatures: {
      useBarCodeDetectorIfSupported: true   // ⭐ استفاده از Native API
    },
    formatsToSupport: [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.ITF,
      Html5QrcodeSupportedFormats.CODABAR,
      Html5QrcodeSupportedFormats.DATA_MATRIX
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
        if (text === lastScan && now - lastScanTime < 2000) return;
        lastScan = text;
        lastScanTime = now;
        beep();
        $('scannerStatus').textContent = '✓ شناسایی شد';
        const savedCb = callback;
        closeScanner().then(() => setTimeout(() => savedCb && savedCb(text), 250));
      },
      () => {}  // خطاهای معمول رو نادیده بگیر
    );
    $('scannerStatus').textContent = 'بارکد را مقابل دوربین بگیرید';
  } catch (e) {
    $('scannerStatus').textContent = '❌ ' + (e.message || e);
    beep(300);
  }
}

// ═══════════════════════════════════════════════════════
// بستن و پاکسازی کامل
// ═══════════════════════════════════════════════════════
export async function closeScanner() {
  if (isClosing) return;
  isClosing = true;

  // توقف loop
  if (nativeLoopId) {
    cancelAnimationFrame(nativeLoopId);
    nativeLoopId = null;
  }

  // پاکسازی native
  await cleanupNative();

  // پاکسازی html5
  if (html5) {
    try {
      const st = html5.getState ? html5.getState() : null;
      if (st === 2 || st === 3) {
        await html5.stop();
      }
      await html5.clear();
    } catch (e) {}
    html5 = null;
  }

  // پاک کردن DOM
  const reader = $('reader');
  if (reader) reader.innerHTML = '';

  $('scannerWrap').classList.remove('active');
  await new Promise(r => setTimeout(r, 350));
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

export function initScannerButtons() {
  $('btnScanClose').onclick = async () => {
    callback = null;
    await closeScanner();
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
      const popup = $('cameraPopup');
      if (!popup) return;
      popup.style.display = popup.style.display === 'block' ? 'none' : 'block';
    };
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#btnCameraSelect')) closeCameraPopup();
  });
}
