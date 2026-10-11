import { Html5Qrcode } from 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/+esm';
import { $, beep } from './utils.js';

let scanner = null;
let callback = null;
let lastScan = '';
let lastScanTime = 0;

export async function openScanner(cb) {
  callback = cb;
  $('scannerWrap').classList.add('active');
  $('scannerStatus').textContent = 'در حال راه‌اندازی...';
  if (!scanner) scanner = new Html5Qrcode('reader');
  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 12, qrbox: { width: 260, height: 260 }, aspectRatio: 1.0 },
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
  try { if (scanner) { await scanner.stop(); await scanner.clear(); scanner = null; } } catch (e) {}
  $('scannerWrap').classList.remove('active');
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
}