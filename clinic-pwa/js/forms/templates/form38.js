// js/forms/templates/form38.js
import { wrap, head, lbl, val, e, ltr, dots, opt } from '../fs.js';

export function render(d) {
  d = d || {};
  const g = (k) => d[k] ?? '';

  // ⚠️ اصلاح باگ: نام پرستار/پزشک را از _userOptions پیدا کن
  const nameOf = (id) => (d._userOptions || []).find(o => String(o.value) === String(id))?.label || '';

  return wrap(`
    ${head({ code: 'BR-FR-HS-38-00', title: 'فرم گزارش شیفت بهداری' })}
    <table class="fs-grid">
      <tr>
        <td>${lbl('تاریخ:')} ${val(g('_date'), { ltr: true })}</td>
        <td>${lbl('ساعت (از … تا …):')} ${dots(g('_timeFrom'), 'w40')} - ${dots(g('_timeTo'), 'w40')}</td>
        <td>${lbl('شیفت:')} ${val(g('shift'))}</td>
        <td>${lbl('پرستار:')} ${val(nameOf(g('nurseId')))}</td>
        <td>${lbl('پزشک:')} ${val(nameOf(g('doctorId')))}</td>
      </tr>
      <tr>
        <td colspan="5" class="fs-mid">
          <div>${lbl('پزشک: فعالیت /اعزام انجام شده:')}</div>
          <div class="fs-hand">${e(g('doctorActivity'))}</div>
          <div>${lbl('فعالیت های برنامه ریزی برای شیفت بعدی:')}</div>
          <div class="fs-hand">${e(g('nextShiftPlan'))}</div>
        </td>
      </tr>
      <tr>
        <td colspan="5">
          ${lbl('تعداد مراجعات:')}
          <table class="fs-grid fs-count" style="margin-top:4px">
            <tr>
              <td>${lbl('سرپایی:')} ${dots(g('outpatientCount'), 'w40')} نفر</td>
              <td>${lbl('اعزامی به بهاباد:')} ${dots(g('dispatchCount'), 'w40')} مورد</td>
              <td>${lbl('خدمات پرستاری:')} ${dots(g('nursingCount'), 'w40')} مورد</td>
            </tr>
            <tr>
              <td>${lbl('واکسیناسیون:')} ${dots(g('vaccinationCount'), 'w40')} نفر</td>
              <td>${lbl('معاینه و ویزیت:')} ${dots(g('visitCount'), 'w40')} نفر</td>
              <td>${lbl('مشاوره پزشکی:')} ${dots(g('consultCount'), 'w40')} مورد</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td colspan="5" class="fs-small">
          ${lbl('توضیحات:')} <span class="fs-hand sm">${e(g('notes'))}</span>
        </td>
      </tr>
      <tr>
        <td colspan="5" class="fs-small">
          ${lbl('وضعیت تجهیزات و داروهای بهداری:')} <span class="fs-hand sm">${e(g('equipmentStatus'))}</span>
        </td>
      </tr>
      <tr>
        <td colspan="5" class="fs-small">
          ${lbl('خودرو آمبولانس (وضعیت کلی، وجود مورد خاص، سطح سوخت، کیلومتر تحویلی، نظافت و...):')}
          <span class="fs-hand sm">${e(g('ambulanceStatus'))}</span>
        </td>
      </tr>
      <tr>
        <td colspan="5" class="fs-small">
          ${lbl('پیگیری های معاینات شغلی:')} <span class="fs-hand sm">${e(g('occupationalFollowup'))}</span>
        </td>
      </tr>
      <tr>
        <td colspan="5" class="fs-small">
          ${lbl('هشدارها:')} <span class="fs-hand sm">${e(g('alerts'))}</span>
        </td>
      </tr>
      <tr>
        <td colspan="5" class="fs-small">
          ${lbl('بروشورها یا پیام های بهداشتی:')} <span class="fs-hand sm">${e(g('healthMessages'))}</span>
        </td>
      </tr>
      <tr>
        <td colspan="5" class="fs-small">
          ${lbl('بازدید های بهداشتی (آب، رستوران، خوابگاه، محیط کار و....):')}
          <span class="fs-hand sm">${e(g('healthInspections'))}</span>
        </td>
      </tr>
      <tr>
        <td colspan="5" class="fs-small">
          ${lbl('نیازمندی‌های شناسایی شده:')} <span class="fs-hand sm">${e(g('requirements'))}</span>
        </td>
      </tr>
      <tr>
        <td colspan="3" class="fs-small">${lbl('پرستار/ فوریت های پزشکی (نظرات، امضاء):')}</td>
        <td colspan="2" class="fs-small">${lbl('سرپرست بهداشت و فوریت های پزشکی: (نظرات، امضاء)')}</td>
      </tr>
      <tr>
        <td colspan="5" class="fs-small">${lbl('رئیس HSE (اظهار نظر، امضاء):')}</td>
      </tr>
    </table>
  `);
}

// ⚠️ fields و load دست‌نخورده باقی بمانند
export const fields = /* ... */;
export async function load(id) { /* ... */ }
