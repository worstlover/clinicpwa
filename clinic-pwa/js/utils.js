import jalaali from '../lib/jalaali.js';

export const $ = id => document.getElementById(id);

export const faNum = n => String(n ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

// ═══════════════════════════════════════════════════════
// 🌟 جدید: تبدیل اعداد فارسی/عربی به انگلیسی
// برای جستجوی صحیح در دیتابیس (کد ملی، شماره پرسنلی و...)
// ═══════════════════════════════════════════════════════
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

export const parseGS1 = (raw) => {
  const r = { gtin: null, exp: null, batch: null, serial: null };
  if (!raw) return r;

  // پاک کردن پیشوندهای رایج
  let s = String(raw).replace(/^\]C1/, '').replace(/\x1d/g, '|').trim();

  // پارس ترتیبی از چپ به راست
  let i = 0;
  while (i < s.length) {
    // AI دو رقمی
    const ai = s.substr(i, 2);

    if (ai === '01' && i + 16 <= s.length) {          // GTIN - ۱۴ رقم ثابت
      r.gtin = s.substr(i + 2, 14);
      i += 16;
    }
    else if (ai === '17' && i + 8 <= s.length) {      // تاریخ انقضا - ۶ رقم ثابت
      // فقط اگر هنوز تاریخ نگرفته باشیم (اولین ۱۷ معتبر)
      if (!r.exp) {
        const ds = s.substr(i + 2, 6);
        const yy = parseInt(ds.substring(0, 2), 10);
        const year = yy < 70 ? 2000 + yy : 1900 + yy;
        r.exp = `${year}-${ds.substring(2, 4)}-${ds.substring(4, 6)}`;
      }
      i += 8;
    }
    else if (ai === '10') {                           // Batch - طول متغیر
      i += 2;
      let end = s.indexOf('|', i);                    // تا جداکننده
      if (end === -1) end = s.length;
      r.batch = s.substring(i, end).trim();
      i = end + (s[end] === '|' ? 1 : 0);
    }
    else if (ai === '21') {                           // Serial - طول متغیر
      i += 2;
      let end = s.indexOf('|', i);
      if (end === -1) end = s.length;
      r.serial = s.substring(i, end).trim();
      i = end + (s[end] === '|' ? 1 : 0);
    }
    else {
      // AI ناشناخته → یک کاراکتر جلو برو تا گیر نکنه
      i += 1;
    }
  }

  // اگر GTIN پیدا نشد، کل رشته رو به‌عنوان fallback بذار
  if (!r.gtin) r.gtin = s.replace(/\|/g, '');

  return r;
};

export const cleanGTIN = s => String(s || '').replace(/^0+/, '');

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
export function beep(freq = 880, dur = 0.12) {
  try {
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
