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
let currentCameraId = localStorage.getItem('scanner_camera_id') || null;

function supportsNative() {
  return 'BarcodeDetector' in window;
}

export async function openScanner(cb) {
  callback = cb;
  $('scannerWrap').classList.add('active');
  $('scannerStatus').textContent = 'در حال راه‌اندازی...';

  if (cameras.length === 0) {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      const devs = await Html5Qrcode.getCameras();
      cameras = devs || [];
      buildCameraMenu();
    } catch (e) { cameras = []; }
  }

  if (supportsNative()) {
    await startNative();
  } else {
    await startHtml5();
  }
}

async function startNative() {
  try {
    const formats = ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'data_matrix', 'pdf417', 'upc_a', 'upc_e', 'itf', 'codabar'];
    nativeDetector = new BarcodeDetector({ formats });

    const constraints = currentCameraId
      ? { video: { deviceId: { exact: currentCameraId }, width: { ideal: 1920 } } }
      : { video: { facingMode: 'environment', width: { ideal: 1920 } } };

    nativeStream = await navigator.mediaDevices.getUserMedia(constraints);
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

    await nativeVideo.play();
    setTimeout(nativeLoop, 300);
  } catch (e) {
    console.warn('Native failed:', e);
    await startHtml5();
  }
}

async function nativeLoop() {
  if (!nativeStream || !nativeVideo || !nativeDetector) return;
  try {
    if (nativeVideo.readyState >= 2) {
      const barcodes = await nativeDetector.detect(nativeVideo);
      if (barcodes.length > 0) {
        const val = barcodes[0].rawValue;
        const now = Date.now();
        if (!(val === lastScan && now - lastScanTime < 2500)) {
          lastScan = val; lastScanTime = now;
          beep();
          $('scannerStatus').textContent = '✓ شناسایی شد';
          await closeScanner();
          setTimeout(() => callback && callback(val), 200);
          return;
        }
      }
    }
  } catch (e) {}
  nativeLoopId = requestAnimationFrame(nativeLoop);
}

async function startHtml5() {
  if (!html5) html5 = new Html5Qrcode('reader');
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
  const target = currentCameraId || { facingMode: 'environment' };
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
        closeScanner().then(() => setTimeout(() => callback && callback(text), 200));
      },
      () => {}
    );
    $('scannerStatus').textContent = 'بارکد را مقابل دوربین بگیرید';
  } catch (e) {
    $('scannerStatus').textContent = '❌ ' + e.message;
    beep(300);
  }
}

export async function closeScanner() {
  if (nativeLoopId) { cancelAnimationFrame(nativeLoopId); nativeLoopId = null; }
  if (nativeStream) {
    nativeStream.getTracks().forEach(t => t.stop());
    nativeStream = null;
  }
  nativeVideo = null;
  nativeDetector = null;
  $('reader').innerHTML = '';
  try { if (html5) { await html5.stop(); await html5.clear(); html5 = null; } } catch (e) {}
  $('scannerWrap').classList.remove('active');
}

function buildCameraMenu() {
  const popup = document.getElementById('cameraPopup');
  if (!popup) return;
  popup.innerHTML = `
    <div style="color:#fff;font-size:12px;text-align:center;margin-bottom:8px;">انتخاب دوربین</div>
    ${cameras.map((c, i) => {
      const active = (currentCameraId === c.id) || (!currentCameraId && i === 0);
      return `<button data-cam-id="${c.id}" style="display:block;width:100%;text-align:right;
        background:${active ? 'rgba(13,110,253,.5)' : 'rgba(255,255,255,.1)'};
        color:#fff;border:none;border-radius:8px;padding:10px 12px;margin-bottom:6px;cursor:pointer;font-family:inherit;">
        ${active ? '✓ ' : ''}${c.label || 'دوربین ' + (i + 1)}
      </button>`;
    }).join('')}
  `;
  popup.querySelectorAll('[data-cam-id]').forEach(b => {
    b.onclick = () => selectCamera(b.dataset.camId);
  });
}

async function selectCamera(id) {
  currentCameraId = id;
  localStorage.setItem('scanner_camera_id', id);
  closeCameraPopup();
  const cb = callback;
  await closeScanner();
  setTimeout(() => openScanner(cb), 300);
}

function closeCameraPopup() {
  const popup = document.getElementById('cameraPopup');
  if (popup) popup.style.display = 'none';
}

export function initScannerButtons() {
  $('btnScanClose').onclick = closeScanner;
  $('btnScanManual').onclick = async () => {
    const v = prompt('بارکد را وارد کنید:');
    if (v?.trim()) {
      await closeScanner();
      setTimeout(() => callback && callback(v.trim()), 150);
    }
  };
  const camBtn = document.getElementById('btnCameraSelect');
  if (camBtn) {
    camBtn.onclick = (e) => {
      e.stopPropagation();
      const popup = document.getElementById('cameraPopup');
      if (!popup) return;
      popup.style.display = popup.style.display === 'block' ? 'none' : 'block';
    };
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#btnCameraSelect')) closeCameraPopup();
  });
}
