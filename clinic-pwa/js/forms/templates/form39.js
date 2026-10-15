// js/forms/templates/form39.js
import { wrap, head, lbl, val, e, dots } from '../fs.js';
import { todayJalali } from '../../utils.js';
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

export function render(d) {
  d = d || {};
  const g = (k) => d[k] ?? '';

  return wrap(`
    ${head({ code: 'BR-FR-HS-39-00', title: 'فرم تحویل Safety box/ پسماند عفونی به بیمارستان' })}
    <table class="fs-grid">
      <tr>
        <td style="height:260px;">
          <p class="fs-para bold">
            بدین وسیله گواهی می شود
            ${dots(g('count'), 'w60')}
            عدد ظرف پسماند عفونی Safety box / حاوی اجسام تیز و برنده بیمارستانی و درمانی (ست و ظرف سرم، سرنگ بدون نیدل و باند و گاز پانسمان های تعویض شده) در تاریخ
            ${dots(g('date'), 'w90')}
            ، به بیمارستان
            ${dots(g('hospitalName'), 'w180')}
            تحویل داده شد.
          </p>

          <table style="width:100%;border:none;margin-top:30px;">
            <tr>
              <td style="border:none;width:50%;padding:4px 8px;">
                <div>${lbl('تحویل دهنده:')} ${dots(g('deliverer'), 'w160')}</div>
                <div class="fs-sign">امضاء</div>
              </td>
              <td style="border:none;width:50%;padding:4px 8px;">
                <div>${lbl('تحویل گیرنده:')} ${dots(g('receiver'), 'w160')}</div>
                <div class="fs-sign">امضاء</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `));
}
