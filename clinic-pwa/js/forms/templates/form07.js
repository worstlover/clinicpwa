// js/forms/templates/form07.js
import { escapeHtml, faNum, gregorianToJalali } from '../../utils.js';

// تابع تبدیل عدد به حروف (کپی شده از fine-reward.js)
function numberToWords(num) {
  if (num === 0) return 'صفر';
  const yekan = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
  const dahgan = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
  const sadgan = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
  const scales = ['', 'هزار', 'میلیون', 'میلیارد'];
  let words = [];
  let scaleIndex = 0;
  while (num > 0) {
    let chunk = num % 1000;
    if (chunk > 0) {
      let chunkWords = [];
      let s = Math.floor(chunk / 100);
      let d = Math.floor((chunk % 100) / 10);
      let y = chunk % 10;
      if (s > 0) chunkWords.push(sadgan[s]);
      let remainder = chunk % 100;
      if (remainder >= 11 && remainder <= 19) {
        const teens = ['', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
        chunkWords.push(teens[remainder - 10]);
      } else {
        if (d > 1) chunkWords.push(dahgan[d]);
        if (y > 0) chunkWords.push(yekan[y]);
      }
      if (scaleIndex > 0) chunkWords.push(scales[scaleIndex]);
      words.unshift(chunkWords.join(' و '));
    }
    num = Math.floor(num / 1000);
    scaleIndex++;
  }
  return words.join(' و ');
}

export function render(data) {
  // data باید شامل: patient_name, personnel_number, company_name, date, time, reason, amount, record_type باشد
  const name = data.patient_name || '—';
  const pCode = data.personnel_number || '—';
  const company = data.company_name || '—';
  const date = data.date || '—';
  const time = data.time || '—';
  const reason = data.reason || '—';
  const amountNum = data.amount || 0;
  const amountStr = numberToWords(amountNum);
  const typeLabel = data.record_type === 'fine' ? 'جریمه' : (data.record_type === 'reward' ? 'پاداش' : 'اخطار');

  return `
    <div class="form-sheet fs compact" dir="rtl">
      <table class="fs-head">
        <tr>
          <td class="fs-logo"><img src="icons/logo-transparent.png" alt="Logo"></td>
          <td class="fs-title">فرم اخطار کتبی و ${typeLabel}</td>
          <td class="fs-code">کد فرم: <bdi>BR-FR-HS-07-00</bdi></td>
        </tr>
      </table>

      <div class="fs-para" style="margin-top: 20px; text-align: justify; font-size: 14px; line-height: 2.5;">
        بدینوسیله به آقای/خانم/شرکت پیمانکاری 
        <span class="fs-dots w160" style="font-size: 16px;">${escapeHtml(name)}</span> 
        به شماره پرسنلی 
        <span class="fs-dots w90" dir="ltr">${escapeHtml(pCode)}</span> 
        از واحد 
        <span class="fs-dots w120">${escapeHtml(company)}</span> 
        در تاریخ 
        <span class="fs-dots w90" dir="ltr">${escapeHtml(date)}</span> 
        ساعت 
        <span class="fs-dots w60" dir="ltr">${escapeHtml(time)}</span>
        <br><br>
        به علت 
        <span class="fs-dots w220" style="font-size: 16px;">${escapeHtml(reason)}</span> 
        اخطار کتبی جهت درج در پرونده ابلاغ گردید. ضمنا نامبرده به مبلغ (به عدد) 
        <span class="fs-dots w120" dir="ltr">${faNum(amountNum)}</span> 
        ریال (به حروف) 
        <span class="fs-dots w220">${escapeHtml(amountStr)}</span> 
        ریال ${typeLabel} شد که مراتب جهت اجرا به واحد اداری اعلام می‌گردد.
        <br><br>
        لازم به ذکر است در صورت تکرار تخلف بیش از سه مرتبه، مراتب در کمیته انضباطی بررسی و تصمیم‌گیری خواهد شد.
      </div>

      <div style="display: flex; justify-content: space-between; margin-top: 40px; font-size: 13px; font-weight: 700;">
        <div style="text-align: center;">
          امضاء رئیس ایمنی، بهداشت و محیط زیست
          <br><br><br>
          ....................
        </div>
        <div style="text-align: center;">
          امضاء افسر ایمنی
          <br><br><br>
          ....................
        </div>
      </div>

      <div style="margin-top: 40px; font-size: 11px; text-align: center; border-top: 1px solid #ccc; padding-top: 10px;">
        نسخه سفید: واحد اداری &nbsp;&nbsp;&nbsp; نسخه زرد: خاطی &nbsp;&nbsp;&nbsp; نسخه قرمز: واحد HSE
      </div>
    </div>
  `;
}

export const fields = [
  { key: 'patient_name', label: 'نام' },
  { key: 'personnel_number', label: 'کد پرسنلی' },
  { key: 'reason', label: 'علت' },
  { key: 'amount', label: 'مبلغ' }
];