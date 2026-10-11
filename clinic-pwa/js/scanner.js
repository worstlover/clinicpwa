import { Html5Qrcode, Html5QrcodeSupportedFormats as F }
  from 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/+esm';
import { $, beep } from './utils.js';

const CAM_KEY = 'scannerCameraId';

let scanner = null;
let callback = null;
let lastScan = '';
let lastScanTime = 0;
let hintTimer = null;
let torchOn = false;
let busy = false;
let cameras = [];

const store = {
  get: () => { try { return localStorage.getItem(CAM_KEY); } catch (e) { return null; } },
  set: (v) => { try { localStorage.setItem(CAM_KEY, v); } catch (e) {} }
};

function createScanner() {
  return new Html5Qrcode('reader', {
    verbose: false,
    formatsToSupport: [F.QR_CODE, F.DATA_MATRIX, F.EAN_13, F.CODE_128],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true }
  });
}

async function listCameras() {
  try { return await Html5Qrcode.getCameras(); } catch (e) { return []; }
}

// انتخاب پیش‌فرض: دوربین ذخیره‌شده، وگرنه دوربین اصلی پشت (نه واید/ماکرو)
function pickDefault(cams) {
  const saved = store.get();
  if (saved && cams.some(c => c.id === saved)) return saved;
  const back = cams.filter(c => !/front|user/i.test(c.label));
  const bad = /wide|ultra|macro|depth|tele/i;
  const best =
    back.find(c => /camera\s*0\b/i.test(c.label)) ||
    back.find(c => !bad.test(c.label)) ||
    back[0] || cams[0];
  return best ? best.id : null;
}

function ensureSelect() {
  let sel = document.getElementById('cameraSelect');
  if (!sel) {
    sel = document.createElement('select');
    sel.id = 'cameraSelect';
    sel.className = 'form-select form-select-sm mb-2';
    const st = $('scannerStatus');
    st.parentNode.insertBefore(sel, st);
  }
  return sel;
}

function fillSelect(selectedId) {
  const sel = ensureSelect();
  sel.innerHTML = '';
  cameras.forEach((c, i) => {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.label || ('دوربین ' + (i + 1));
    sel.appendChild(o);
  });
  sel.disabled = cameras.length === 0;
  if (selectedId) sel.value = selectedId;
  sel.onchange = async () => {
    store.set(sel.value);
    await stopOnly();
    startScan(sel.value);
  };
}

export async function openScanner(cb) {
  if (busy) return;
  callback = cb;
  $('scannerWrap').classList.add('active');
  $('scannerStatus').textContent = 'در حال راه‌اندازی...';

  cameras = await listCameras();
  const id = pickDefault(cameras);
  fillSelect(id);
  if (!cameras.length) {
    $('scannerStatus').textContent = 'دوربینی پیدا نشد؛ مجوز دوربین را بررسی کنید';
  }
  await startScan(id);
}

async function startScan(cameraId) {
  if (busy) return;
  busy = true;
  torchOn = false;
  $('scannerStatus').textContent = 'در حال راه‌اندازی...';
  if (!scanner) scanner = createScanner();

  const video = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    advanced: [{ focusMode: 'continuous' }]
  };
  if (cameraId) video.deviceId = { exact: cameraId };
  else video.facingMode = 'environment';

  try {
    await scanner.start(
      cameraId || { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: (w, h) => {
          const side = Math.floor(Math.min(w, h) * 0.8);
          return { width: side, height: side };
        },
        videoConstraints: video
      },
      onSuccess,
      () => {}
    );
    $('scannerStatus').textContent = 'QR کد را داخل کادر بگیرید';
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      $('scannerStatus').textContent =
        'گوشی را کمی دورتر کنید تا فوکوس شود، نور را بهتر کنید، یا دوربین دیگری را از لیست انتخاب کنید';
    }, 10000);
  } catch (e) {
    $('scannerStatus').textContent = '❌ ' + (e?.message || e);
    beep(300);
  } finally {
    busy = false;
  }
}

function onSuccess(text) {
  const now = Date.now();
  if (text === lastScan && now - lastScanTime < 2500) return;
  lastScan = text;
  lastScanTime = now;
  beep();
  $('scannerStatus').textContent = '✓ شناسایی شد';
  closeScanner().then(() => setTimeout(() => callback && callback(text), 200));
}

async function stopOnly() {
  clearTimeout(hintTimer);
  try {
    if (scanner) {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    }
  } catch (e) { /* ignore */ }
  scanner = null;
  torchOn = false;
}

export async function closeScanner() {
  await stopOnly();
  $('scannerWrap').classList.remove('active');
}

async function toggleTorch() {
  if (!scanner) return;
  try {
    torchOn = !torchOn;
    await scanner.applyVideoConstraints({ advanced: [{ torch: torchOn }] });
  } catch (e) {
    torchOn = false;
    $('scannerStatus').textContent = 'چراغ‌قوه در این دوربین پشتیبانی نمی‌شود';
  }
}

export function initScannerButtons() {
  $('btnScanClose').onclick = closeScanner;
  const torchBtn = document.getElementById('btnScanTorch');
  if (torchBtn) torchBtn.onclick = toggleTorch;

  $('btnScanManual').onclick = async () => {
    const v = prompt('بارکد را وارد کنید:');
    if (v?.trim()) {
      await closeScanner();
      setTimeout(() => callback && callback(v.trim()), 150);
    }
  };
}
