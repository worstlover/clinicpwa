// js/utils.js
import jalaali from '../lib/jalaali.js';

export const $ = id => document.getElementById(id);

export const faNum = n => String(n ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

export const faToEn = (str) => {
  if (!str) return str;
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arabicDigits  = '٠١٢٣٤٥٦٧٨٩';
  const englishDigits = '0123456789';
  const table = {};
  for (let i = 0; i < 10; i++) {
    table[persianDigits[i]] = englishDigits[i];
    table[arabicDigits[i]]  = englishDigits[i];
  }
  return String(str).replace(/[۰-۹٠-٩]/g, d => table[d] || d);
};

export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const todayJalali = () => {
  const g = new Date();
  const j = jalaali.toJalaali(g.getFullYear(), g.getMonth() + 1, g.getDate());
  return `${j.jy}/${String(j.jm).padStart(2,'0')}/${String(j.jd).padStart(2,'0')}`;
};

export const gregorianToJalali = (str) => {
  if (!str) return '';
  try {
    const d = new Date(str);
    if (isNaN(d)) return '';
    const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return `${j.jy}/${String(j.jm).padStart(2,'0')}/${String(j.jd).padStart(2,'0')}`;
  } catch (e) { return ''; }
};

export const jalaliToGregorian = (str) => {
  if (!str) return null;
  try {
    const p = String(str).trim().split('/');
    if (p.length !== 3) return null;
    const y = parseInt(p[0]), m = parseInt(p[1]), d = parseInt(p[2]);
    if (!y || !m || !d) return null;
    const g = jalaali.toGregorian(y, m, d);
    return `${g.gy}-${String(g.gm).padStart(2,'0')}-${String(g.gd).padStart(2,'0')}`;
  } catch (e) { return null; }
};

// ⭐ اصلاح شد: استخراج دقیق GTIN
export const cleanGTIN = (raw) => {
  if (!raw) return '';
  let digits = String(raw).replace(/[^0-9]/g, '');
  if (digits.length > 14) digits = digits.slice(-14);
  if (digits.length === 14 && digits.startsWith('0')) digits = digits.substring(1);
  return digits;
};

// ⭐ اصلاح کامل: استخراج دقیق تاریخ انقضا (بدون ۱۷) و بچ
export const parseGS1 = (raw) => {
  const r = { gtin: null, exp: null, exps: [], batch: null, serial: null };
  if (!raw) return r;

  // تمیز کردن رشته ورودی
  let s = String(raw)
    .replace(/^\]C1/, '')
    .replace(/[\u001d\u241d]/g, '|')
    .replace(/<GS>|<FNC1>/gi, '|')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();

  // ۱. استخراج GTIN (شناسه ۰۱)
  const m01_14 = s.match(/(?:^|[^0-9])01(\d{14})/);
  const m01_13 = s.match(/(?:^|[^0-9])01(\d{13})/);
  if (m01_14) r.gtin = m01_14[1];
  else if (m01_13) r.gtin = m01_13[1];

  // ۲. استخراج تاریخ انقضا (شناسه ۱۷)
  // پیدا کردن دقیقاً ۶ رقم بعد از ۱۷ که بعد از آن عدد نباشد
  const expMatches = [...s.matchAll(/(?:^|[^0-9])17(\d{6})(?=[^0-9]|$)/g)].map(m => m[1]);
  r.exps = expMatches;

  if (expMatches.length > 0) {
    // اگر چند تاریخ بود، دومی را بردار (بعضی بارکدها تاریخ تولید و انقضا دارند)
    let targetRaw = expMatches.length >= 2 ? expMatches[1] : expMatches[0];
    
    // اطمینان از اینکه ۱۷ داخل رشته نیست
    if (targetRaw.startsWith('17')) targetRaw = targetRaw.substring(2);

    const yy = parseInt(targetRaw.substring(0, 2), 10);
    const mm = parseInt(targetRaw.substring(2, 4), 10);
    const dd = parseInt(targetRaw.substring(4, 6), 10);
    
    // تبدیل سال دو رقمی به چهار رقمی (تا ۷۰ میلادی ۲۰۰۰، بعد از آن ۱۹۰۰)
    const year = yy < 70 ? 2000 + yy : 1900 + yy;

    // اعتبارسنجی دقیق تاریخ (ماه ۱ تا ۱۲ و روز ۱ تا ۳۱)
    const expDate = new Date(year, mm - 1, dd);
    const isValid = mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && 
                    expDate.getMonth() === mm - 1 && expDate.getDate() === dd;

    if (isValid) {
      r.exp = `${year}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
    } else {
      r.exp = targetRaw; // اگر نامعتبر بود، همان ۶ رقم خام را برمی‌گردانیم تا در مودال دستی اصلاح شود
    }
  }

  // ۳. استخراج بچ (۱۰) و سریال (۲۱)
  if (s.includes('|')) {
    const parts = s.split('|');
    for (let p of parts) {
      if (/^10/.test(p) && !r.batch) r.batch = p.slice(2).trim();
      else if (/^21/.test(p) && !r.serial) r.serial = p.slice(2).trim();
    }
  }
  
  // اگر بچ پیدا نشد، تلاش برای پیدا کردن بدون جداکننده
  if (!r.batch) {
    const bm = s.match(/(?:^|[^0-9])10([^]*?)(?=|17|21|$)/);
    if (bm) r.batch = bm[1].replace(/\|/g, '').trim();
  }

  // اگر GTIN پیدا نشد، کل رشته (بدون جداکننده) را به عنوان GTIN در نظر بگیر
  if (!r.gtin) {
    r.gtin = s.replace(/[^0-9]/g, '');
  }

  return r;
};

const audioCtx = window.AudioContext || window.webkitAudioContext ? new (window.AudioContext || window.webkitAudioContext)() : null;

export function beep(freq = 880, dur = 0.12) {
  try {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = freq;
    g.gain.setValueAtTime(1, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) {}
  if (navigator.vibrate) navigator.vibrate(40);
}

export function toast(msg, type = 'info') {
  const el = document.createElement('div');
  const colors = { info: '#0d6efd', success: '#059669', warning: '#d97706', danger: '#dc3545' };
  el.style.cssText = `position:fixed;top:80px;right:12px;left:12px;z-index:10000;
    background:${colors[type] || colors.info};color:#fff;padding:12px 18px;
    border-radius:14px;text-align:center;font-weight:600;
    box-shadow:0 8px 24px rgba(0,0,0,.2);`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

export function makeBatchNumber(drugName, drugForm, expiryGregorian) {
  if (!drugName || !expiryGregorian) return null;
  const name = String(drugName).slice(0, 12).replace(/\s+/g, '');
  const form = drugForm ? String(drugForm).slice(0, 4).toUpperCase() : 'UNK';
  const d = new Date(expiryGregorian);
  if (isNaN(d)) return null;
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${name}-${form}-${yy}${mm}`;
}

export function checkExpiry(greg) {
  if (!greg) return null;
  try {
    const exp = new Date(greg);
    const today = new Date();
    if (isNaN(exp)) return null;
    const days = Math.ceil((exp - today) / 86400000);
    if (days < 0)     return { level: 'expired', days, msg: `🚫 گذشته (${Math.abs(days)} روز)` };
    if (days <= 120)  return { level: 'danger',  days, msg: `⚠️ کمتر از ۴ ماه (${days} روز)` };
    if (days <= 180)  return { level: 'warning', days, msg: `🟡 کمتر از ۶ ماه (${days} روز)` };
    return { level: 'ok', days, msg: `✅ ${days} روز تا انقضا` };
  } catch (e) { return null; }
                                                      }
