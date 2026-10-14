// js/forms/templates/form39.js
import { escapeHtml, todayJalali } from '../../utils.js';
import { sb } from '../../sb.js';

export const fields = [
  { key: 'count', label: 'تعداد ظرف Safety box', editable: true, col: 6 },
  { key: 'date', label: 'تاریخ تحویل (شمسی)', editable: true, col: 6 },
  { key: 'hospitalName', label: 'نام بیمارستان', editable: true, col: 12 },
  { key: 'deliverer', label: 'تحویل‌دهنده', editable: true, col: 6 },
  { key: 'receiver', label: 'تحویل‌گیرنده', editable: true, col: 6 }
];

export async function load() {
  let email = '';
  try {
    const { data: { user } } = await sb.auth.getUser();
    email = user?.email || '';
  } catch {}

  let lastHospital = '';
  try {
    const { data } = await sb.from('visits_visit')
      .select('dispatch_destination')
      .not('dispatch_destination', 'is', null)
      .order('visit_date', { ascending: false })
      .limit(1);
    if (data?.[0]?.dispatch_destination) lastHospital = data[0].dispatch_destination;
  } catch {}

  let hospitals = [];
  try {
    const { data } = await sb.from('form_records')
      .select('data').eq('form_code', 'BR-FR-HS-39-00')
      .order('created_at', { ascending: false }).limit(20);
    const s = new Set();
    (data || []).forEach(r => { if (r.data?.hospitalName) s.add(r.data.hospitalName); });
    hospitals = Array.from(s);
  } catch {}

  return {
    data: {
      count: '',
      date: todayJalali(),
      hospitalName: lastHospital,
      deliverer: email ? email.split('@')[0] : '',
      receiver: '',
      _hospitals: hospitals
    },
    meta: {}
  };
}

function line(v, w) {
  return `<span style="display:inline-block;min-width:${w || 100}px;border-bottom:1px dotted #000;padding:0 4px;">${escapeHtml(v || '')}</span>`;
}

export function render(d) {
  d = d || {};
  const get = (k, def = '') => d[k] ?? def;

  return `
    <div style="font-family:Vazirmatn,Tahoma,sans-serif;direction:rtl;font-size:12px;line-height:2.2;color:#000;">
      <div style="text-align:center;font-weight:700;font-size:10px;margin-bottom:4px;" dir="ltr">کد فرم: BR-FR-HS-39-00</div>

      <table style="width:100%;border:none;margin-bottom:10px;">
        <tr>
          <td style="border:none;width:80px;text-align:center;">
            <img src="icons/logo-form.png" style="max-width:60px;max-height:60px;"
              onerror="this.style.display='none'">
          </td>
          <td style="border:none;text-align:center;font-size:14px;font-weight:800;">
            فرم تحویل Safety box / پسماند عفونی به بیمارستان
          </td>
          <td style="border:none;width:80px;"></td>
        </tr>
      </table>

      <p style="text-align:justify;line-height:2.4;margin-top:16px;">
        بدین وسیله گواهی می‌شود
        ${line(get('count'), 60)}
        عدد ظرف پسماند عفونی Safety box / حاوی اجسام تیز و برنده بیمارستانی و درمانی (ست و ظرف سرم، سرنگ بدون نیدل و باند و گاز پانسمان های تعویض شده) در تاریخ
        ${line(get('date'), 90)}
        ، به بیمارستان
        ${line(get('hospitalName'), 180)}
        تحویل داده شد.
      </p>

      <div style="display:flex;justify-content:space-between;margin-top:24px;gap:20px;">
        <div style="flex:1;">
          <div>تحویل دهنده</div>
          <div style="border-bottom:1px dotted #000;min-height:26px;margin-top:4px;">${escapeHtml(get('deliverer'))}</div>
          <div style="text-align:center;font-size:10px;">امضاء</div>
        </div>
        <div style="flex:1;">
          <div>تحویل گیرنده</div>
          <div style="border-bottom:1px dotted #000;min-height:26px;margin-top:4px;">${escapeHtml(get('receiver'))}</div>
          <div style="text-align:center;font-size:10px;">امضاء</div>
        </div>
      </div>
    </div>
  `;
}
