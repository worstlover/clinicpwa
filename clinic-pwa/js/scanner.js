import { Html5Qrcode, Html5QrcodeSupportedFormats as F } from '../lib/html5-qrcode.js';
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
let currentId = null;
let zoomDelay = null;
let zoomTimer = null;

// زوم خودکار: اگر چند ثانیه چیزی خوانده نشد، دوربین آرام‌آرام زوم می‌کند (برای QR دور/ریز)
function stopAutoZoom() {
  clearTimeout(zoomDelay);
  clearInterval(zoomTimer);
  zoomDelay = zoomTimer = null;
}
function startAutoZoom() {
  stopAutoZoom();
  let zf;
  try {
    zf = scanner.getRunningTrackCameraCapabilities().zoomFeature();
    if (!zf.isSupported()) return;
  } catch (e) { return; }
  const min = zf.min(), max = zf.max();
  const steps = [1, 1.7, 2.5, 3.5].map(z => Math.min(max, Math.max(min, z)));
  zoomDelay = setTimeout(() => {
    let i = 0;
    zoomTimer = setInterval(() => {
      i = (i + 1) % steps.length;
      try { zf.apply(steps[i]); } catch (e) {}
    }, 1800);
  }, 3000);
}

const store = {
  get: () => { try { return localStorage.getItem(CAM_KEY); } catch (e) { return null; } },
  set: (v) => { try { localStorage.setItem(CAM_KEY, v); } catch (e) {} }
};

function createScanner() {
  return new Html5Qrcode('reader', {
    verbose: false,
    formatsToSupport: [F.QR_CODE, F.DATA_MATRIX, F.EAN_13, F.CODE_128],
    // اسکنر بومی کروم اندروید (سریع‌تر برای QR متراکم)
    experimentalFeatures: { useBarCodeDetectorIfSupported: true }
  });
}

async function listCameras() {
  try { return await Html5Qrcode.getCameras(); } catch (e) { return []; }
}

// پیش‌فرض: دوربین ذخیره‌شده؛ وگرنه دوربین اصلی پشت (نه واید/ماکرو)
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

// ─── منوی انتخاب دوربین (دکمه btnCameraSelect و cameraPopup در index.html) ───
function fillPopup() {
  const p = $('cameraPopup');
  p.innerHTML = '';
  if (!cameras.length) {
    p.innerHTML = '<div style="color:#fff;font-size:.85rem;padding:6px;">دوربینی پیدا نشد</div>';
    return;
  }
  cameras.forEach((c, i) => {
    const row = document.createElement('div');
    const active = c.id === currentId;
    row.textContent = (active ? '✓ ' : '') + (c.label || ('دوربین ' + (i + 1)));
    row.style.cssText =
      'color:#fff;font-size:.85rem;padding:10px 8px;border-radius:8px;cursor:pointer;direction:ltr;text-align:left;' +
      (active ? 'background:rgba(13,110,253,.8);' : '');
    row.onclick = async (e) => {
      e.stopPropagation();
      p.style.display = 'none';
      if (c.id === currentId) return;
      store.set(c.id);
      await stopOnly();
      startScan(c.id);
    };
    p.appendChild(row);
  });
}

export async function openScanner(cb) {
  if (busy) return;
  callback = cb;
  $('scannerWrap').classList.add('active');
  $('cameraPopup').style.display = 'none';
  $('scannerStatus').textContent = 'در حال راه‌اندازی...';

  cameras = await listCameras();
  const id = pickDefault(cameras);
  if (!cameras.length) {
    $('scannerStatus').textContent = 'دوربینی پیدا نشد؛ مجوز دوربین را بررسی کنید';
  }
  await startScan(id);
}

async function startScan(cameraId) {
  if (busy) return;
  busy = true;
  torchOn = false;
  currentId = cameraId || null;
  fillPopup();
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
        // عمداً qrbox نداریم: کل تصویر دوربین اسکن می‌شود.
        // (با qrbox و ظاهر object-fit: cover ناحیه‌ی اسکن با تصویر نمایش‌داده‌شده جور درنمی‌آید)
        videoConstraints: video
      },
      onSuccess,
      () => {}
    );
    $('scannerStatus').textContent = 'QR کد را مقابل دوربین بگیرید';
    startAutoZoom();
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      $('scannerStatus').textContent =
        'کمی دورتر بگیرید تا فوکوس شود، یا با دکمه دوربین، دوربین دیگری انتخاب کنید';
    }, 10000);
  } catch (e) {
    $('scannerStatus').textContent = '❌ ' + (e?.message || e);
    beep(300);
  } finally {
    busy = false;
  }
}

function onSuccess(text) {
  stopAutoZoom();
  const now = Date.now();
  if (text === lastScan && now - lastScanTime < 2500) return;
  lastScan = text;
  lastScanTime = now;
  beep();
  $('scannerStatus').textContent = '✓ شناسایی شد';
  closeScanner().then(() => setTimeout(() => callback && callback(text), 200));
}

async function stopOnly() {
  stopAutoZoom();
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
  $('cameraPopup').style.display = 'none';
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

  // دکمه انتخاب دوربین
  $('btnCameraSelect').onclick = (e) => {
    if (e.target.closest('#cameraPopup')) return;
    const p = $('cameraPopup');
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
  };

  // چسباندن از کلیپ‌بورد (مثلاً بعد از اسکن با QR detector خود گوشی و Copy)
  const pasteBtn = document.getElementById('btnScanPaste');
  if (pasteBtn) pasteBtn.onclick = async () => {
    try {
      const t = (await navigator.clipboard.readText() || '').trim();
      if (!t) { $('scannerStatus').textContent = 'کلیپ‌بورد خالی است'; return; }
      await closeScanner();
      setTimeout(() => callback && callback(t), 150);
    } catch (e) {
      $('scannerStatus').textContent = 'اجازه خواندن کلیپ‌بورد داده نشد؛ از دکمه ورود دستی استفاده کنید';
    }
  };

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
