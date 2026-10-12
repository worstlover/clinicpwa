import { Html5Qrcode } from '../lib/html5-qrcode.js';
import { $, beep, toast } from './utils.js';

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
let hwBuffer = '';
let hwTimer = null;

function supportsNative() {
  return 'BarcodeDetector' in window;
}

// ═══════════════════════════════════════════════════════
// باز کردن اسکنر
// ═══════════════════════════════════════════════════════
export async function openScanner(cb) {
  if (isOpening || isClosing) {
    console.warn('Scanner busy, closing first...');
    try { await closeScanner(); } catch (e) {}
    await new Promise(r => setTimeout(r, 400));
  }
  isOpening = true;

  try {
    await forceCleanup();

    callback = cb;
    lastScan = '';
    lastScanTime = 0;
    nativeFails = 0;

    $('scannerWrap').classList.add('active');
    $('scannerStatus').textContent = 'در حال راه‌اندازی...';

    // لیست دوربین‌ها
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

    await new Promise(r => setTimeout(r, 400));

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
// پاکسازی کامل
// ═══════════════════════════════════════════════════════
async function forceCleanup() {
  if (nativeLoopId) {
    cancelAnimationFrame(nativeLoopId);
    nativeLoopId = null;
  }
  if (nativeStream) {
    try {
      nativeStream.getTracks().forEach(t => {
        try { t.enabled = false; t.stop(); } catch (e) {}
      });
    } catch (e) {}
    nativeStream = null;
  }
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

  if (html5) {
    try {
      const st = html5.getState ? html5.getState() : null;
      if (st === 2 || st === 3) await html5.stop();
      await html5.clear();
    } catch (e) {}
    html5 = null;
  }

  const reader = $('reader');
  if (reader) reader.innerHTML = '';

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

    let attempts = 0;
    while (attempts < 3) {
      try {
        nativeStream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (e) {
        attempts++;
        if (e.name === 'NotReadableError' && attempts < 3) {
          $('scannerStatus').textContent = `دوربین مشغول، تلاش ${attempts}/3...`;
          await new Promise(r => setTimeout(r, 800));
        } else {
          throw e;
        }
      }
    }
    if (!nativeStream) throw new Error('دوربین در دسترس نیست');

    try {
      const track = nativeStream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.focusMode && caps.focusMode.includes('continuous')) {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      }
    } catch (e) {}

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

    $('scannerStatus').textContent = '⚡ بارکد را مقابل دوربین بگیرید یا از کلیپ‌بورد بچسبانید';
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
    await forceCleanup();
    await startHtml5();
    return;
  }

  try {
    if (nativeVideo.readyState >= 2 && nativeVideo.videoWidth > 0) {
      const barcodes = await nativeDetector.detect(nativeVideo);
      if (barcodes.length > 0) {
        const val = barcodes[0].rawValue;
        handleDetected(val);
        return;
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

async function startHtml5() {
  const reader = $('reader');
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

  let attempts = 0;
  while (attempts < 3) {
    try {
      await html5.start(
        target,
        config,
        (text) => handleDetected(text),
        () => {}
      );
      $('scannerStatus').textContent = 'بارکد را مقابل دوربین بگیرید یا از کلیپ‌بورد بچسبانید';
      return;
    } catch (e) {
      attempts++;
      if (attempts < 3) {
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
// پردازش بارکد شناسایی‌شده
// ═══════════════════════════════════════════════════════
async function handleDetected(val) {
  if (isClosing) return;
  const now = Date.now();
  if (val === lastScan && now - lastScanTime < 2000) return;
  lastScan = val;
  lastScanTime = now;

  beep();
  $('scannerStatus').textContent = '✓ شناسایی شد: ' + val.substring(0, 30);

  const savedCb = callback;
  await closeScanner();
  setTimeout(() => {
    if (savedCb) savedCb(val);
  }, 300);
}

// ═══════════════════════════════════════════════════════
// بستن
// ═══════════════════════════════════════════════════════
export async function closeScanner() {
  if (isClosing) return;
  isClosing = true;
  try {
    await forceCleanup();
    $('scannerWrap').classList.remove('active');
  } finally {
    isClosing = false;
  }
}

// ═══════════════════════════════════════════════════════
// ورودی بارکدخوان سخت‌افزاری (USB/Bluetooth)
// ═══════════════════════════════════════════════════════
function setupHardwareScannerListener() {
  document.addEventListener('keydown', (e) => {
    if (!$('scannerWrap').classList.contains('active')) return;

    const tag = (e.target.tagName || '').toUpperCase();
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

    if (e.key === 'Escape') {
      closeScanner();
      return;
    }

    if (e.key === 'Enter') {
      const code = hwBuffer.trim();
      hwBuffer = '';
      clearTimeout(hwTimer);
      if (code.length >= 4) {
        handleDetected(code);
      }
      return;
    }

    if (e.key.length === 1) {
      hwBuffer += e.key;
      clearTimeout(hwTimer);
      hwTimer = setTimeout(() => { hwBuffer = ''; }, 100);
    }
  });
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

// ═══════════════════════════════════════════════════════
// چسباندن از کلیپ‌بورد
// ═══════════════════════════════════════════════════════
async function pasteFromClipboard() {
  const cb = callback;
  if (!cb) {
    toast('اسکنر آماده نیست', 'warning');
    return;
  }

  let code = '';

  // روش ۱: Clipboard API
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      code = (await navigator.clipboard.readText() || '').trim();
    }
  } catch (e) {
    console.warn('Clipboard read failed:', e);
  }

  // روش ۲: اگر روش ۱ خطا داد یا خالی بود → prompt
  if (!code) {
    code = (prompt('بارکد را وارد یا paste کنید:') || '').trim();
  }

  if (!code) {
    toast('کلیپ‌بورد خالی است', 'warning');
    return;
  }

  beep();
  $('scannerStatus').textContent = '✓ ' + code.substring(0, 30);
  await closeScanner();
  setTimeout(() => cb(code), 250);
}

// ═══════════════════════════════════════════════════════
// راه‌اندازی دکمه‌ها
// ═══════════════════════════════════════════════════════
export function initScannerButtons() {
  setupHardwareScannerListener();

  // ⭐ گوش دادن به رویداد ورودی دستی از app.js
  document.addEventListener('manualBarcode', async (e) => {
    const val = e.detail;
    if (!val) return;
    const cb = callback;
    if (cb) {
      await closeScanner();
      setTimeout(() => cb(val), 250);
    }
  });

  // دکمه بستن
  $('btnScanClose').onclick = async () => {
    callback = null;
    await closeScanner();
  };

  // ⭐ دکمه چسباندن از کلیپ‌بورد (اصلی)
  const btnPaste = $('btnScanPaste');
  if (btnPaste) {
    btnPaste.onclick = (e) => {
      e.stopPropagation();
      pasteFromClipboard();
    };
  }

  // ⭐ دکمه ورودی دستی (اگر باشد)
  const btnManual = $('btnScanManual');
  if (btnManual) {
    btnManual.onclick = (e) => {
      e.stopPropagation();
      pasteFromClipboard();
    };
  }

  // انتخاب دوربین
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
