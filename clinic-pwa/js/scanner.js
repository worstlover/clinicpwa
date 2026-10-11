import { Html5Qrcode } from 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/+esm';
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
let isOpening = false;
let currentCameraId = localStorage.getItem('scanner_camera_id') || null;
let nativeFails = 0;
let nativeStartTime = 0;

function supportsNative() {
  return 'BarcodeDetector' in window;
}

// ═══════════════════════════════════════════════════════
// باز کردن اسکنر
// ═══════════════════════════════════════════════════════
export async function openScanner(cb) {
  if (isOpening) {
    console.warn('Scanner already opening, ignoring');
    return;
  }
  isOpening = true;

  // ⭐ اطمینان از پاکسازی قبلی
  await forceCleanup();

  callback = cb;
  isClosing = false;
  lastScan = '';
  lastScanTime = 0;
  nativeFails = 0;

  $('scannerWrap').classList.add('active');
  $('scannerStatus').textContent = 'در حال راه‌اندازی...';

  // ⭐ گرفتن لیست دوربین‌ها
  if (cameras.length === 0) {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
      tmp.getTracks().forEach(t => t.stop());
      await new Promise(r => setTimeout(r, 400));
      const devs = await Html5Qrcode.getCameras();
      cameras = devs || [];
      buildCameraMenu();
    } catch (e) {
      console.warn('Cannot enumerate cameras:', e);
      cameras = [];
    }
  } else {
    buildCameraMenu();
  }

  // ⭐ مکث لازم قبل از باز کردن استریم جدید
  await new Promise(r => setTimeout(r, 400));

  try {
    if (supportsNative()) {
      await startNative();
    } else {
      await startHtml5();
    }
  } catch (e) {
    console.error('Scanner start failed:', e);
    $('scannerStatus').textContent = '❌ ' + (e.message || e);
  } finally {
    isOpening = false;
  }
}

// ═══════════════════════════════════════════════════════
// پاکسازی کامل قبل از شروع
// ═══════════════════════════════════════════════════════
async function forceCleanup() {
  // توقف loop
  if (nativeLoopId) {
    cancelAnimationFrame(nativeLoopId);
    nativeLoopId = null;
  }

  // توقف استریم native
  if (nativeStream) {
    try {
      nativeStream.getTracks().forEach(t => {
        try { t.enabled = false; t.stop(); } catch (e) {}
      });
    } catch (e) {}
    nativeStream = null;
  }

  // پاک کردن video
  if (nativeVideo) {
    try {
      nativeVideo.pause();
      nativeVideo.srcObject = null;
      nativeVideo.removeAttribute('src');
      nativeVideo.load();
    } catch (e) {}
    nativeVideo = null;
  }

  nativeDetector = null;

  // توقف html5
  if (html5) {
    try {
      const st = html5.getState ? html5.getState() : null;
      if (st === 2 || st === 3) await html5.stop();
      await html5.clear();
    } catch (e) {}
    html5 = null;
  }

  // پاک کردن DOM reader
  const reader = $('reader');
  if (reader) reader.innerHTML = '';

  // ⭐ مکث لازم برای آزاد شدن دوربین توسط سیستم‌عامل
  await new Promise(r => setTimeout(r, 500));
}

// ═══════════════════════════════════════════════════════
// اسکنر نیتیو
// ═══════════════════════════════════════════════════════
async function startNative() {
  try {
    const formats = ['qr_code', 'ean_13', 'code_128', 'code_39', 'ean_8'];
    nativeDetector = new BarcodeDetector({ formats });

    const constraints = currentCameraId
      ? { video: { deviceId: { exact: currentCameraId }, width: { ideal: 1280 }, height: { ideal: 720 } } }
      : { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } };

    // ⭐ اگر خطای NotReadableError داد، ۳ بار تلاش مجدد
    let attempts = 0;
    while (attempts < 3) {
      try {
        nativeStream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (e) {
        attempts++;
        if (e.name === 'NotReadableError' && attempts < 3) {
          console.warn(`Camera busy, retry ${attempts}/3...`);
          $('scannerStatus').textContent = `دوربین مشغول است، تلاش مجدد (${attempts})...`;
          await new Promise(r => setTimeout(r, 800));
        } else {
          throw e;
        }
      }
    }

    if (!nativeStream) throw new Error('دوربین در دسترس نیست');

    // autofocus
    try {
      const track = nativeStream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.focusMode && caps.focusMode.includes('continuous')) {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      }
    } catch (e) {}

    // ساخت video
    nativeVideo = document.createElement('video');
    nativeVideo.autoplay = true;
    nativeVideo.playsInline = true;
    nativeVideo.muted = true;
    nativeVideo.setAttribute('playsinline', '');
    nativeVideo.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
    nativeVideo.srcObject = nativeStream;

    const reader = $('reader');
    reader.innerHTML = '';
    reader.appendChild(nativeVideo);

    $('scannerStatus').textContent = '⚡ اسکنر سریع - بارکد را مقابل دوربین بگیرید';
    await nativeVideo.play().catch(() => {});

    nativeStartTime = Date.now();
    setTimeout(nativeLoop, 250);
  } catch (e) {
    console.warn('Native failed, switching to html5:', e);
    await forceCleanup();
    await startHtml5();
  }
}

async function nativeLoop() {
  if (isClosing || !nativeStream || !nativeVideo || !nativeDetector) return;

  if (Date.now() - nativeStartTime > 8000 && nativeFails > 100) {
    console.warn('Native too slow, switching to html5');
    await forceCleanup();
    await startHtml5();
    return;
  }

  try {
    if (nativeVideo.readyState >= 2 && nativeVideo.videoWidth > 0) {
      const barcodes = await nativeDetector.detect(nativeVideo);
      if (barcodes.length > 0) {
        const val = barcodes[0].rawValue;
        const now = Date.now();
        if (!(val === lastScan && now - lastScanTime < 2000)) {
          lastScan = val; lastScanTime = now;
          beep();
          $('scannerStatus').textContent = '✓ شناسایی شد';
          const savedCb = callback;
          await closeScanner();
          setTimeout(() => savedCb && savedCb(val), 300);
          return;
        }
      }
      nativeFails++;
    }
  } catch (e) {
    nativeFails++;
  }

  if (!isClosing && nativeStream) {
    nativeLoopId = requestAnimationFrame(nativeLoop);
  }
}

// ═══════════════════════════════════════════════════════
// html5-qrcode
// ═══════════════════════════════════════════════════════
async function startHtml5() {
  const reader = $('reader');
  // ⭐ یک div تازه با id یکتا
  const uid = 'reader_' + Date.now();
  reader.innerHTML = `<div id="${uid}" style="width:100%;height:100%;"></div>`;

  html5 = new Html5Qrcode(uid, { verbose: false });

  const config = {
    fps: 20,
    qrbox: function(vw, vh) {
      const min = Math.min(vw, vh);
      const size = Math.floor(min * 0.75);
      return { width: size, height: size };
    },
    aspectRatio: 1.0,
    disableFlip: true,
    experimentalFeatures: { useBarCodeDetectorIfSupported: true }
  };

  const target = currentCameraId
    ? { deviceId: { exact: currentCameraId } }
    : { facingMode: 'environment' };

  // ⭐ تلاش مجدد در صورت خطای دوربین
  let attempts = 0;
  while (attempts < 3) {
    try {
      await html5.start(
        target,
        config,
        (text) => {
          const now = Date.now();
          if (text === lastScan && now - lastScanTime < 2000) return;
          lastScan = text; lastScanTime = now;
          beep();
          $('scannerStatus').textContent = '✓ شناسایی شد';
          const savedCb = callback;
          closeScanner().then(() => setTimeout(() => savedCb && savedCb(text), 300));
        },
        () => {}
      );
      $('scannerStatus').textContent = 'بارکد را مقابل دوربین بگیرید';
      return;
    } catch (e) {
      attempts++;
      if (attempts < 3) {
        console.warn(`html5 start failed, retry ${attempts}/3...`);
        $('scannerStatus').textContent = `تلاش مجدد (${attempts})...`;
        await forceCleanup();
        await new Promise(r => setTimeout(r, 800));
        reader.innerHTML = `<div id="${uid}" style="width:100%;height:100%;"></div>`;
        html5 = new Html5Qrcode(uid, { verbose: false });
      } else {
        $('scannerStatus').textContent = '❌ ' + (e.message || e);
        beep(300);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════
// بستن
// ═══════════════════════════════════════════════════════
export async function closeScanner() {
  if (isClosing) return;
  isClosing = true;
  await forceCleanup();
  $('scannerWrap').classList.remove('active');
  isClosing = false;
}

// ═══════════════════════════════════════════════════════
// انتخاب دوربین
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
    b.onclick = (e) => { e.stopPropagation(); selectCamera(b.dataset.camId); };
  });
}

async function selectCamera(id) {
  if (!id) return;
  currentCameraId = id;
  localStorage.setItem('scanner_camera_id', id);
  closeCameraPopup();
  $('scannerStatus').textContent = 'در حال تغییر دوربین...';
  const savedCb = callback;
  await forceCleanup();
  await new Promise(r => setTimeout(r, 600));
  await openScanner(savedCb);
}

function closeCameraPopup() {
  const popup = document.getElementById('cameraPopup');
  if (popup) popup.style.display = 'none';
}

export function initScannerButtons() {
  $('btnScanClose').onclick = async () => { callback = null; await closeScanner(); };
  $('btnScanManual').onclick = async () => {
    const v = prompt('بارکد را وارد کنید:');
    if (v?.trim()) {
      const cb = callback;
      await closeScanner();
      setTimeout(() => cb && cb(v.trim()), 300);
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
