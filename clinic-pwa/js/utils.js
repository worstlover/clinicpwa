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

  // ═══ پاکسازی ورودی و یکسان‌سازی جداکننده‌ها ═══
  let s = String(raw)
    .replace(/^\]C1/, '')            // پیشوند ]C1
    .replace(/\u001d/g, '|')         // FNC1 واقعی (GS)
    .replace(/<GS>/gi, '|')          // اگر به شکل متنی آمد
    .replace(/<FNC1>/gi, '|')
    .replace(/\u241d/g, '|')         // نمایش نمادین GS
    .replace(/[\r\n\t]+/g, ' ')      // حذف خط جدید
    .trim();

  // اگر هیچ جداکننده‌ای نیست ولی رشته طولانی است، شاید FNC1 حذف شده.
  // در این حالت از قبل AI های ثابت‌طول را با regex پیدا می‌کنیم.

  // ═══ ۱. GTIN (AI=01، ثابت ۱۴ رقم) ═══
  // اول از ابتدای رشته (استاندارد)، اگر نبود هرجای رشته
  let m01 = s.match(/(?:^|[^0-9])01(\d{14})/);
  if (!m01) m01 = s.match(/01(\d{14})/);
  if (m01) r.gtin = m01[1];

  // ═══ ۲. تاریخ انقضا (AI=17، ثابت ۶ رقم YYMMDD) ═══
  // این را قبل از AIهای متغیر پیدا می‌کنیم تا اگر FNC1 حذف شده بود،
  // رشته‌ی بچ آن را نخورد.
  let m17 = s.match(/(?:^|[^0-9])17(\d{2})(\d{2})(\d{2})/);
  if (!m17) m17 = s.match(/17(\d{2})(\d{2})(\d{2})/);
  if (m17) {
    const yy = parseInt(m17[1], 10);
    const mm = m17[2];
    const dd = m17[3];
    const year = yy < 70 ? 2000 + yy : 1900 + yy;
    // اعتبارسنجی ساده: ماه ۰۱-۱۲، روز ۰۱-۳۱
    if (+mm >= 1 && +mm <= 12 && +dd >= 1 && +dd <= 31) {
      r.exp = `${year}-${mm}-${dd}`;
    }
  }

  // ═══ ۳. AIهای متغیر (10 = بچ، 21 = سریال) با جداکننده '|' ═══
  // فقط اگر '|' داریم این کار را می‌کنیم تا رشته خراب نشود.
  if (s.includes('|')) {
    const parts = s.split('|');
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k];
      // AI=10 : بچ
      if (/^10/.test(p) && !r.batch) {
        r.batch = p.slice(2).trim();
      }
      // AI=21 : سریال
      else if (/^21/.test(p) && !r.serial) {
        r.serial = p.slice(2).trim();
      }
    }

    // اگر آخرین بخش بدون جداکننده بود ولی شامل AI=10 یا 21 به‌هم‌چسبیده بود
    // (مثلاً "...10BATCH|21SER" یا برعکس)
    const last = parts[parts.length - 1];
    if (last && !r.batch) {
      const bm = last.match(/10([^|]*?)(?:17|21|$)/);
      if (bm) r.batch = bm[1].trim();
    }
  } else {
    // ═══ حالت اضطراری: FNC1 حذف شده و هیچ جداکننده‌ای نیست ═══
    // فقط می‌توانیم بچ را بعد از AI=10 تا قبل از AI=17 یا AI=21 بگیریم
    if (!r.batch) {
      const bm = s.match(/10([^]*?)(?=17\d{6}|21|$)/);
      if (bm) r.batch = bm[1].replace(/\|/g, '').trim();
    }
    if (!r.serial) {
      const sm = s.match(/21([^]*?)$/);
      if (sm) r.serial = sm[1].replace(/\|/g, '').trim();
    }
  }

  // اگر GTIN پیدا نشد، کل رشته را به‌عنوان fallback بگذار
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
