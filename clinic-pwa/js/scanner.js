import { Html5Qrcode, Html5QrcodeSupportedFormats as F }
  from 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/+esm';
import { $, beep } from './utils.js';

let scanner = null;
let callback = null;
let lastScan = '';
let lastScanTime = 0;
let hintTimer = null;
let torchOn = false;
let busy = false;

function createScanner() {
  return new Html5Qrcode('reader', {
    verbose: false,
    // فقط QR (و چند فرمت رایج بارکد خطی برای اقلام قدیمی).
    // محدود کردن فرمت‌ها سرعت و دقت را بالا می‌برد.
    formatsToSupport: [F.QR_CODE, F.DATA_MATRIX, F.EAN_13, F.CODE_128],
    // استفاده از اسکنر بومی کروم اندروید (خیلی سریع‌تر برای QR متراکم)
    experimentalFeatures: { useBarCodeDetectorIfSupported: true }
  });
}

export async function openScanner(cb) {
  if (busy) return;
  busy = true;
  callback = cb;
  torchOn = false;
  $('scannerWrap').classList.add('active');
  $('scannerStatus').textContent = 'در حال راه‌اندازی...';

  if (!scanner) scanner = createScanner();

  try {
    await scanner.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        // QR داروها متراکم است؛ کادر بزرگ و مربع (۸۰٪ عرض) تا ناحیه‌ی خواندن کوچک نشود
        qrbox: (w, h) => {
          const side = Math.floor(Math.min(w, h) * 0.8);
          return { width: side, height: side };
        },
        // رزولوشن بالا برای QR ریز و پرجزئیات
        videoConstraints: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [{ focusMode: 'continuous' }]
        }
      },
      onSuccess,
      () => {} // خطای هر فریم بی‌اهمیت است
    );

    $('scannerStatus').textContent = 'QR کد را داخل کادر بگیرید';

    // اگر ۱۰ ثانیه چیزی نخواند راهنمایی بده
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      $('scannerStatus').textContent =
        'گوشی را کمی دورتر کنید تا فوکوس شود، نور را بهتر کنید، یا «ورود دستی» را بزنید';
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
  // متن خام QR دقیقاً همان‌طور که هست به callback داده می‌شود
  closeScanner().then(() => setTimeout(() => callback && callback(text), 200));
}

export async function closeScanner() {
  clearTimeout(hintTimer);
  try {
    if (scanner) {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    }
  } catch (e) { /* ignore */ }
  scanner = null;
  torchOn = false;
  $('scannerWrap').classList.remove('active');
}

// چراغ‌قوه (اختیاری؛ فقط اگر دکمه‌اش در HTML باشد)
async function toggleTorch() {
  if (!scanner) return;
  try {
    torchOn = !torchOn;
    await scanner.applyVideoConstraints({ advanced: [{ torch: torchOn }] });
  } catch (e) {
    torchOn = false;
    $('scannerStatus').textContent = 'چراغ‌قوه در این دستگاه پشتیبانی نمی‌شود';
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
