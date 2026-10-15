// js/forms/fs.js — کمک‌تابع‌های مشترک قالب فرم‌ها (فقط HTML می‌سازند؛ هیچ‌چیز را ذخیره نمی‌کنند)
import { escapeHtml } from '../utils.js';

/** escape امن برای هر مقدار (null/undefined ⇒ رشته‌ی خالی) */
export const e = (v) => escapeHtml(v == null ? '' : String(v));

/** عدد/تاریخ/ساعت/کد را در یک بلوک چپ‌به‌راست قرار می‌دهد تا در متن فارسی برعکس نشود */
export const ltr = (v) => (v == null || v === '') ? '' : `<bdi dir="ltr">${e(v)}</bdi>`;

/** «تاریخ ساعت» با ترتیب درست */
export const dt = (date, time) => [date && ltr(date), time && ltr(time)].filter(Boolean).join(' ');

/** برچسب پررنگ */
export const lbl = (t) => `<span class="fs-lbl">${e(t)}</span>`;

/** مقدار پرشده (معمولی)؛ { ltr: true } برای عدد/تاریخ */
export const val = (v, o = {}) => `<span class="fs-val">${o.ltr ? ltr(v) : e(v)}</span>`;

/** برچسب + مقدار در یک خانه */
export const field = (label, v, o = {}) => `${lbl(label)} ${val(v, o)}`;

/** جای خالی نقطه‌چین؛ w = '', 'w40','w60','w90','w120','w160','w220' */
export const dots = (v, w = '') => `<span class="fs-dots ${w}">${v ? e(v) : '&nbsp;'}</span>`;

/** چک‌باکس و گزینه‌ی چک‌باکس‌دار */
export const cb = (on) => `<i class="fs-cb${on ? ' on' : ''}"></i>`;
export const opt = (on, label) => `<span class="fs-opt">${cb(on)} ${e(label)}</span>`;

/** خط نقطه‌چین بلوکی (برای نوشتن دستی) */
export const dline = (n = 1) => Array.from({ length: n }, () => '<div class="fs-dline">&nbsp;</div>').join('');

/** سرتیتر استاندارد: [لوگو | عنوان | کد فرم] (در RTL لوگو سمت راست) */
export function head({ code, title }) {
  return `<table class="fs-head"><tr>
    <td class="fs-logo"><img src="icons/logo-form.png" alt="" onerror="this.style.visibility='hidden'"></td>
    <td class="fs-title">${e(title)}</td>
    <td class="fs-code">کد فرم:<bdi>${e(code)}</bdi></td>
  </tr></table>`;
}

/** پوشش نهایی؛ compact=true برای فرم‌های پرمحتوا */
export const wrap = (inner, { compact = false } = {}) =>
  `<div class="fs${compact ? ' compact' : ''}">${inner}</div>`;
