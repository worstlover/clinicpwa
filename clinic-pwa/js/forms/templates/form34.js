// js/forms/templates/form34.js
import { wrap, head, lbl, val, e, dots, opt } from '../fs.js';
import {
  loadVisitFull, buildSummaryText, computeAge,
  formatTehranTime, tehranJalali, isIncidentVisit
} from '../visit-data.js';

export const fields = [
  { key: 'rowNumber', label: 'شماره ردیف فرم ثبت مراجعات', editable: true, col: 6 },
  { key: 'causeType', label: 'علت مراجعه', type: 'select', editable: true, col: 6,
    options: [
      { value: 'disease',  label: 'بیماری' },
      { value: 'incident', label: 'حادثه' }
    ]
  },
  { key: 'summaryText', label: 'شرح حال و شرح اقدامات انجام شده', type: 'textarea', rows: 3, editable: true, col: 12 },
  { key: 'dischargeAdvice', label: 'توصیه‌های پزشکی هنگام ترخیص', type: 'textarea', rows: 3, editable: true, col: 12,
    persist: { table: 'visit_extra', column: 'discharge_advice' } },
  { key: 'notifyPerson', label: 'توصیه‌ها به اطلاع اینجانب رسانده شد (نام)', editable: true, col: 6 },
  { key: 'supervisorName', label: 'نام سرشیفت بهداری (برای اعزام)', editable: true, col: 6 },
  { key: 'leftAgainstAdvice', label: 'ترک با رضایت شخصی', type: 'checkbox', editable: true, col: 6,
    persist: { table: 'visit_extra', column: 'left_against_advice' } },
  { key: 'leftAt', label: 'ساعت ترک با رضایت (HH:MM)', editable: true, col: 6,
    persist: { table: 'visit_extra', column: 'left_at' } }
];

export async function load({ visitId }) {
  if (!visitId) throw new Error('visitId لازم است');
  const d = await loadVisitFull(visitId);
  const v = d.visit;
  const e = d.extra || {};
  const pe = d.patientExtra || {};
  const isInc = isIncidentVisit(v);

  const sTime = isInc ? e.incident_at : e.symptom_onset_at;

  let dischargeDate = '', dischargeTime = '';
  if (v.status === 'completed' && !d.isDispatch && !d.isReferral) {
    const completed = v.completed_at || v.visit_date;
    dischargeDate = tehranJalali(completed);
    dischargeTime = formatTehranTime(completed);
  }

  let dispatchDate = '', dispatchTime = '';
  if (d.isDispatch && v.dispatch_time) {
    dispatchDate = tehranJalali(v.dispatch_time);
    dispatchTime = formatTehranTime(v.dispatch_time);
  }

  let leftAtHM = '';
  if (e.left_at) leftAtHM = formatTehranTime(e.left_at);

  return {
    data: {
      rowNumber: String(v.id),
      causeType: isInc ? 'incident' : 'disease',
      summaryText: buildSummaryText(d),
      dischargeAdvice: e.discharge_advice || '',
      notifyPerson: `${d.patient.first_name || ''} ${d.patient.last_name || ''}`.trim(),
      supervisorName: '',
      leftAgainstAdvice: !!e.left_against_advice,
      leftAt: leftAtHM,
      _patientName: `${d.patient.first_name || ''} ${d.patient.last_name || ''}`.trim(),
      _personnelNumber: d.patient.personnel_number || '',
      _phone: d.patient.phone_number || '',
      _visitDate: tehranJalali(v.visit_date),
      _age: computeAge(d.patient.date_of_birth),
      _incidentLocation: isInc ? (v.incident_location?.name || '') : '',
      _unitContractor: d.company?.name || '',
      _workUnit: pe.work_unit || d.patient.occupation || '',
      _symptomTime: sTime ? formatTehranTime(sTime) : '',
      _visitTime: formatTehranTime(v.visit_date),
      _bp: v.blood_pressure || '',
      _pr: v.heart_rate || '',
      _tem: v.temperature || '',
      _spo2: v.spo2 || '',
      _rr: e.rr || '',
      _dischargeDate: dischargeDate,
      _dischargeTime: dischargeTime,
      _dispatchDate: dispatchDate,
      _dispatchTime: dispatchTime,
      _fatherName: d.patient.father_name || '',
      _nationalCode: d.patient.is_foreign_national
        ? (d.patient.passport_number || '')
        : (d.patient.national_code || ''),
      _leftAtDate: e.left_at ? tehranJalali(e.left_at) : ''
    },
    meta: { isIncident: isInc, isDispatch: d.isDispatch, isReferral: d.isReferral }
  };
}

export function render(d) {
  d = d || {};
  const g = (k) => d[k] ?? '';
  const isInc = d.causeType === 'incident';

  return wrap(`
    ${head({ code: 'BR-FR-HS-34-00', title: 'فرم بستری موقت مراجعه کننده' })}

    <table class="fs-grid">
      <tr>
        <td class="fs-side gray" rowspan="4"><span>مشخصات مراجعه کننده: (بیمار/مصدوم)</span></td>
        <td>${lbl('نام و نام خانوادگی:')} ${val(g('_patientName'))}</td>
        <td>${lbl('کد پرسنلی:')} ${val(g('_personnelNumber'), { ltr: true })}</td>
        <td>${lbl('تاریخ:')} ${val(g('_visitDate'), { ltr: true })}</td>
      </tr>
      <tr>
        <td>${lbl('سن:')} ${val(g('_age'), { ltr: true })}</td>
        <td>${lbl('شماره تماس:')} ${val(g('_phone'), { ltr: true })}</td>
        <td>${lbl('شماره ردیف فرم ثبت مراجعات:')} ${val(g('rowNumber'), { ltr: true })}</td>
      </tr>
      <tr>
        <td>${lbl('در صورت وقوع حادثه محل آن:')} ${val(g('_incidentLocation'))}</td>
        <td>${lbl('نام واحد/پیمانکار:')} ${val(g('_unitContractor'))}</td>
        <td>${lbl('محل کار:')} ${val(g('_workUnit'))}</td>
      </tr>
      <tr>
        <td colspan="2">${lbl('ساعت شروع علائم/وقوع حادثه:')} ${val(g('_symptomTime'), { ltr: true })}</td>
        <td>${lbl('ساعت مراجعه به واحد بهداری:')} ${val(g('_visitTime'), { ltr: true })}</td>
      </tr>
    </table>

    <table class="fs-grid">
      <tr>
        <td style="height:240px;">
          <div>${lbl('علت مراجعه:')} ${opt(!isInc, 'بیماری')} ${opt(isInc, 'حادثه')}</div>
          <div>
            ${lbl('وضعیت مراجعه کننده:')}
            BP: ${dots(g('_bp'), 'w60')}
            PR: ${dots(g('_pr'), 'w40')}
            RR: ${dots(g('_rr'), 'w40')}
            Tem: ${dots(g('_tem'), 'w40')}
            SPO₂: ${dots(g('_spo2'), 'w40')}
          </div>
          <div>${lbl('شرح حال و شرح اقدامات انجام شده:')}</div>
          <div class="fs-dline fs-hand" style="min-height:70px;">${e(g('summaryText'))}</div>
          <div class="fs-sign">نام و نام خانوادگی و امضاء پرستار</div>
        </td>
      </tr>
    </table>

    <table class="fs-grid">
      <tr>
        <td class="fs-side gray" rowspan="3"><span>تعیین تکلیف بیمار/مصدوم</span></td>
        <td>
          <strong>(الف)</strong>
          بیمار در تاریخ ${dots(g('_dischargeDate'), 'w90')}
          ساعت ${dots(g('_dischargeTime'), 'w60')}
          با توصیه های پزشکی زیر مرخص شد:
          <div class="fs-dline fs-hand" style="min-height:60px;">${e(g('dischargeAdvice'))}</div>
          <div class="fs-sign">نام و نام خانوادگی و امضاء پرستار</div>
          <div>توصیه های فوق به اطلاع اینجانب ${dots(g('notifyPerson'), 'w160')} رسانده شد.</div>
          <div class="fs-sign">امضاء مراجعه کننده</div>
        </td>
      </tr>
      <tr>
        <td>
          <strong>(ب)</strong>
          بیمار در تاریخ ${dots(g('_dispatchDate'), 'w90')}
          ساعت ${dots(g('_dispatchTime'), 'w60')}
          با نظر آقای(سرشیفت بهداری) ${dots(g('supervisorName'), 'w120')}
          بوسیله آمبولانس / آژانس به بیمارستان اعزام گردید و فرم اعزام به بیمارستان برای ایشان تکمیل گردید.
          <div class="fs-sign">نام و نام خانوادگی و امضاء پرستار</div>
        </td>
      </tr>
      <tr>
        <td>
          <p class="fs-para" style="font-size:10px;">
            <strong>(پ)</strong>
            اینجانب آقا/خانم ${dots(g('_patientName'), 'w140')}
            فرزند ${dots(g('_fatherName'), 'w90')}
            به کد ملی ${dots(g('_nationalCode'), 'w110')}
            از واحد/پیمانکاری ${dots(g('_unitContractor'), 'w120')}
            به شماره پرسنلی ${dots(g('_personnelNumber'), 'w80')}
            در روز ${dots('', 'w70')} مورخ ${dots(g('_leftAtDate'), 'w90')}
            ساعت ${dots(g('leftAt'), 'w60')}
            علیرغم توصیه کادر درمان، مبنی بر عدم ترخیص، با صلاحدید و رضایت شخصی خود واحد بهداری را ترک نمودم، هرگونه عواقب ناشی از این موضوع که سلامت اینجانب را تحت تاثیر قرار دهد بر عهده می گیرم و متعهد می شوم که در اسرع وقت نسبت به درمان بیماری خود شخصا اقدام نمایم.
          </p>
          <div class="fs-sign">امضاء و اثر انگشت مراجعه کننده</div>
        </td>
      </tr>
    </table>
  `, { compact: true });
}
