import jalaali from 'https://cdn.jsdelivr.net/npm/jalaali-js@1.2.6/+esm';

export const $ = id => document.getElementById(id);

export const faNum = n => String(n ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

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
  const r = { gtin: null, exp: null, batch: null };
  if (!raw) return r;
  const s = String(raw).replace(/\]C1/g, '').trim();
  const g = s.match(/01(\d{14})/);
  r.gtin = g ? g[1] : s;
  const b = s.match(/10([^\x1d]+)/);
  if (b) r.batch = b[1].trim();
  const e = s.match(/17(\d{6})/);
  if (e) {
    const ds = e[1];
    const yy = parseInt(ds.substring(0, 2), 10);
    const year = yy < 70 ? 2000 + yy : 1900 + yy;
    r.exp = `${year}-${ds.substring(2,4)}-${ds.substring(4,6)}`;
  }
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