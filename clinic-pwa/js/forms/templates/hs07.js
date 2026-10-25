// js/forms/templates/hs07.js
// فرم اخطار کتبی و جریمه HSE — BR-FR-HS-07-00

const YEKAN = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const DAHGAN = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const DAHYEK = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const SADGAN = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

function threeToWords(n) {
  const parts = [];
  const s = Math.floor(n / 100);
  const r = n % 100;
  if (s > 0) parts.push(SADGAN[s]);
  if (r > 0) {
    if (r < 10) parts.push(YEKAN[r]);
    else if (r < 20) parts.push(DAHYEK[r - 10]);
    else {
      const d = Math.floor(r / 10);
      const y = r % 10;
      parts.push(DAHGAN[d]);
      if (y > 0) parts.push(YEKAN[y]);
    }
  }
  return parts.join(' و ');
}

export function toPersianWords(num) {
  let n = Math.abs(Math.floor(Number(num) || 0));
  if (n === 0) return 'صفر';
  const groups = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    const w = threeToWords(groups[i]);
    const scale = SCALES[i] || '';
    parts.push(scale ? `${w} ${scale}` : w);
  }
  return parts.join(' و ');
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function render(data = {}) {
  const d = {
    serialNumber: data.serialNumber || '......',
    fullName: data.fullName || '......',
    personnelNumber: data.personnelNumber || '......',
    unit: data.unit || '......',
    jalaliDate: data.jalaliDate || '......',
    time: data.time || '......',
    reason: data.reason || '......',
    amount: data.amount,
    isWarning: data.isWarning === true,
    record_type: data.record_type || 'fine'
  };

  if (d.record_type === 'reward') return '';

  const amountNum = Number(d.amount) || 0;
  const amountFmt = amountNum > 0 ? amountNum.toLocaleString('fa-IR') : '......';
  const amountWords = amountNum > 0 ? toPersianWords(amountNum) : '......';
  const showFine = !d.isWarning && amountNum > 0;

  return `
    <div class="hs07-form">
      <div class="hs07-serial">شماره: ${esc(d.serialNumber)}</div>
      <table class="hs07-header-table">
        <tr>
          <td class="hs07-logo-cell">
            <img src="assets/forms/br-logo.png" alt="برنا" onerror="this.style.display='none'">
          </td>
          <td class="hs07-title-cell">
            <div class="hs07-title">فـرم اخطار کتبی و جریمه HSE</div>
          </td>
          <td class="hs07-code-cell">
            <div>کد فرم:</div>
            <div>BR-FR-HS-07-00</div>
          </td>
        </tr>
      </table>
      <div class="hs07-body">
        <p class="hs07-text">
          بدینوسیله به آقای/خانم/شرکت پیمانکاری <span class="hs07-fill">${esc(d.fullName)}</span>
          به شماره پرسنلی <span class="hs07-fill">${esc(d.personnelNumber)}</span>
          از واحد <span class="hs07-fill">${esc(d.unit)}</span>
          در تاریخ <span class="hs07-fill">${esc(d.jalaliDate)}</span>
          ساعت <span class="hs07-fill">${esc(d.time)}</span>
          به علت <span class="hs07-fill">${esc(d.reason)}</span>
          اخطار کتبی جهت درج در پرونده ابلاغ گردید.
          ${showFine ? `ضمناً نامبرده به مبلغ (به عدد) <span class="hs07-fill">${amountFmt}</span> ریال (به حروف) <span class="hs07-fill">${amountWords}</span> ریال جریمه شد که مراتب جهت اجرا به واحد اداری اعلام می‌گردد.` : ''}
        </p>
        <p class="hs07-bold">
          لازم به ذکر است در صورت تکرار تخلف بیش از سه مرتبه، مراتب در کمیته انضباطی بررسی و تصمیم‌گیری خواهد شد.
        </p>
        <div class="hs07-signatures">
          <div class="hs07-sign">امضاء افسر ایمنی:<br><br><br></div>
          <div class="hs07-sign">امضاء رئیس ایمنی، بهداشت و محیط زیست:<br><br><br></div>
        </div>
      </div>
      <div class="hs07-footer">
        نسخه سفید: واحد اداری &nbsp;&nbsp; نسخه زرد: خاطی &nbsp;&nbsp; نسخه قرمز: واحد HSE
      </div>
    </div>
  `;
}

export async function load() {
  return { data: {}, meta: {} };
}

export const fields = [];