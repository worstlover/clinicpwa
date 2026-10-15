// js/forms/templates/form49.js
import { wrap, head, lbl, val, e, ltr, dots, opt } from '../fs.js';

export function render(d) {
  d = d || {};
  const g = (k) => d[k] ?? '';

  return wrap(`
    ${head({ code: 'BR-FR-HS-49-00', title: 'فـرم اعلام نتایج معاینات طب کار' })}
    <table class="fs-grid">
      <tr>
        <td colspan="2" class="fs-tall" style="height:480px">
          <div>${lbl('نوع معاینات:')} ${opt(g('examType') === 'pre_employment', 'بدو استخدام')} ${opt(g('examType') === 'periodic', 'دوره ای')} ${opt(g('examType') === 'return_to_work', 'بازگشت به کار')} ${opt(g('examType') === 'job_transfer', 'جابجایی شغلی')}</div>
          <div>${lbl('شماره پرسنلی:')} ${val(g('_personnelNumber'), { ltr: true })}</div>
          <div>${lbl('نتیجه معاینات:')} ${opt(g('result') === 'healthy', 'صحت و سلامت کامل')} ${opt(g('result') === 'partial', 'سلامت نسبی')} ${opt(g('result') === 'conditional', 'مشروط')}</div>
          <div class="fs-para fs-hand">
            آقای/خانم ${dots(g('_patientName'), 'w160')} با پست ${dots(g('position'), 'w120')}
            نتایج معاینات شما در سال ${dots(g('_year'), 'w60')} به شرح ذیل می‌باشد.
          </div>
          <div>${lbl('شرح معاینات:')} ${opt(g('cho'), 'CHO')} ${opt(g('tg'), 'TG')} ${opt(g('sgot'), 'SGOT')} ${opt(g('sgpt'), 'SGPT')} ${opt(g('alk'), 'ALK')} ${opt(g('fbs'), 'FBS')} ${lbl('(مقدار)')} ${dots(g('labValues'), 'w220')}</div>
          <div>${lbl('سایر موارد:')} <span class="fs-hand sm">${e(g('otherResults'))}</span></div>
          <div>${lbl('توصیه پزشک:')} ${opt(g('advice_fat') === 'yes', 'کاهش مصرف غذاهای چرب')} ${opt(g('advice_exercise') === 'yes', 'انجام ورزش روزانه')} ${opt(g('advice_weight') === 'yes', 'کاهش وزن')} ${opt(g('advice_diet') === 'yes', 'استفاده از تغذیه سالم')}</div>
          <div>${lbl('سایر موارد:')} <span class="fs-hand sm">${e(g('otherAdvice'))}</span></div>
          ${g('opinionText') ? `
            <div class="fs-bar" style="margin-top:8px">نظریه ثبت‌شده در پرونده</div>
            <div class="fs-hand">${e(g('opinionText'))}</div>
          ` : ''}
          <div class="fs-para bold" style="font-size:11px;margin-top:10px">
            در صورت مشروط، بایستی فرد به متخصص مراجعه (به مدت ۱ ماه) و سوابق ارجاع و دستور پزشک به واحد HSE تحویل گردد.
          </div>
        </td>
      </tr>
      <tr>
        <td class="fs-small">${lbl('تاریخ و امضاء پزشک:')}</td>
        <td class="fs-small">${lbl('تاریخ و امضاء متقاضی:')}</td>
      </tr>
    </table>
  `);
}

// ⚠️ fields و load دست‌نخورده باقی بمانند
export const fields = /* ... */;
export async function load(id) { /* ... */ }
