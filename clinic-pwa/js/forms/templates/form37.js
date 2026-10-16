// js/forms/templates/form37.js
import { wrap, head, lbl, val, e, ltr, dots, opt, dline } from '../fs.js';
import { escapeHtml, gregorianToJalali } from '../../utils.js';
import {
  loadVisitFull, buildSummaryText, buildMedicalHistoryText, buildVitalsSummary,
  formatTehranTime, tehranJalali, isIncidentVisit,
  isDispatchTreatment, isReferralTreatment
} from '../visit-data.js';

export const fields = [
  { key: 'rowNumber', label: 'شماره ردیف فرم ثبت مراجعات', editable: true, col: 6 },
  { key: 'birthPlace', label: 'محل تولد', editable: true, col: 6,
    persist: { table: 'patient_extra', column: 'birth_place' } },
  { key: 'summaryText', label: 'خلاصه شرح حال و مراقبت‌های پزشکی', type: 'textarea', rows: 3, editable: true, col: 12 },
  { key: 'medicalHistoryText', label: 'خلاصه سوابق پزشکی', type: 'textarea', rows: 2, editable: true, col: 12 },
  { key: 'companionNeeded', label: 'نیاز به همراه', type: 'select', editable: true, col: 6,
    options: [{ value: 'no', label: 'ندارد' }, { value: 'yes', label: 'دارد' }],
    persist: { table: 'visit_extra', column: 'companion_needed' } },
  { key: 'companionName', label: 'نام همراه', editable: true, col: 6,
    persist: { table: 'visit_extra', column: 'companion_name' } },
  { key: 'companionPhone', label: 'شماره تماس همراه', editable: true, col: 6,
    persist: { table: 'visit_extra', column: 'companion_phone' } },
  { key: 'transportType', label: 'نحوه ارجاع (غیر از آمبولانس)', type: 'select', editable: true, col: 6,
    options: [
      { value: '', label: '—' },
      { value: 'agency', label: 'آژانس' },
      { value: 'personal', label: 'وسیله شخصی' },
      { value: 'transport', label: 'ترانسپورت' },
      { value: 'other', label: 'سایر' }
    ],
    persist: { table: 'visit_extra', column: 'transport_type' } },
  { key: 'hospitalEmergency', label: 'اورژانس بیمارستان (نام)', editable: true, col: 12 },
  { key: 'copyCount', label: 'تعداد نسخه چاپ', type: 'select', editable: true, col: 6,
    options: [
      { value: '1', label: '۱ نسخه' },
      { value: '2', label: '۲ نسخه' }
    ]
  }
];

export async function load({ visitId }) {
  if (!visitId) throw new Error('visitId لازم است');
  const d = await loadVisitFull(visitId);
  const v = d.visit;
  const e = d.extra || {};
  const pe = d.patientExtra || {};
  const isInc = isIncidentVisit(v);
  const isDispatch = isDispatchTreatment(v.treatment_result_id);
  const isReferral = isReferralTreatment(v.treatment_result_id);

  const sTime = isInc ? e.incident_at : e.symptom_onset_at;
  const gcsTotal = (v.gcs_eye && v.gcs_verbal && v.gcs_motor)
    ? Number(v.gcs_eye) + Number(v.gcs_verbal) + Number(v.gcs_motor)
    : '';

  return {
    data: {
      rowNumber: String(v.id),
      birthPlace: pe.birth_place || '',
      summaryText: buildSummaryText(d),
      medicalHistoryText: buildMedicalHistoryText(d),
      companionNeeded: e.companion_needed ? 'yes' : 'no',
      companionName: e.companion_name || '',
      companionPhone: e.companion_phone || '',
      transportType: isReferral ? (e.transport_type || '') : '',
      hospitalEmergency: v.dispatch_destination || '',
      copyCount: '2',
      _patientName: `${d.patient.first_name || ''} ${d.patient.last_name || ''}`.trim(),
      _fatherName: d.patient.father_name || '',
      _nationalCode: d.patient.is_foreign_national
        ? (d.patient.passport_number || '')
        : (d.patient.national_code || ''),
      _dob: d.patient.date_of_birth ? gregorianToJalali(d.patient.date_of_birth) : '',
      _phone: d.patient.phone_number || '',
      _personnelNumber: d.patient.personnel_number || '',
      _symptomTime: sTime ? formatTehranTime(sTime) : '',
      _visitTime: formatTehranTime(v.visit_date),
      _visitDate: tehranJalali(v.visit_date),
      _unitContractor: [pe.work_unit, d.company?.name].filter(Boolean).join('/'),
      _bp: v.blood_pressure || '',
      _pr: v.heart_rate || '',
      _rr: e.rr || '',
      _spo2: v.spo2 || '',
      _gcsE: v.gcs_eye || '',
      _gcsV: v.gcs_verbal || '',
      _gcsM: v.gcs_motor || '',
      _gcsTotal: gcsTotal,
      _vitalsSummary: buildVitalsSummary(d),
      _isDispatch: isDispatch,
      _isReferral: isReferral
    },
    meta: { isIncident: isInc, isDispatch, isReferral }
  };
}

function buildOneCopy(d) {
  const g = (k) => d[k] ?? '';
  const isDispatch = d._isDispatch;
  const isReferral = d._isReferral;
  const companionNeeded = d.companionNeeded === 'yes';
  const transportMap = { agency: 'آژانس', personal: 'وسیله شخصی', transport: 'ترانسپورت', other: 'سایر' };

  return wrap(`
    ${head({ code: 'BR-FR-HS-37-00', title: 'فرم اعزام / ارجاع به مرکز درمانی' })}

    <table class="fs-grid">
      <tr>
        <td class="fs-side" rowspan="4"><span>مشخصات مراجعه کننده</span></td>
        <td>${lbl('نام و نام خانوادگی:')} ${val(g('_patientName'))}</td>
        <td>${lbl('نام پدر:')} ${val(g('_fatherName'))}</td>
        <td>${lbl('کد ملی:')} ${val(g('_nationalCode'), { ltr: true })}</td>
      </tr>
      <tr>
        <td>${lbl('تاریخ تولد:')} ${val(g('_dob'), { ltr: true })}</td>
        <td>${lbl('محل تولد:')} ${val(g('birthPlace'))}</td>
        <td>${lbl('شماره تماس:')} ${val(g('_phone'), { ltr: true })}</td>
      </tr>
      <tr>
        <td>${lbl('کدپرسنلی:')} ${val(g('_personnelNumber'), { ltr: true })}</td>
        <td>${lbl('ساعت وقوع علائم بیماری/حادثه:')} ${val(g('_symptomTime'), { ltr: true })}</td>
        <td>${lbl('شماره ردیف فرم ثبت مراجعات:')} ${val(g('rowNumber'), { ltr: true })}</td>
      </tr>
      <tr>
        <td>${lbl('نام واحد/پیمانکار:')} ${val(g('_unitContractor'))}</td>
        <td>${lbl('ساعت مراجعه به بهداری:')} ${val(g('_visitTime'), { ltr: true })}</td>
        <td>${lbl('تاریخ:')} ${val(g('_visitDate'), { ltr: true })}</td>
      </tr>
    </table>

    <table class="fs-grid">
      <tr>
        <td class="fs-side" rowspan="1"><span>نظریه پزشکی</span></td>
        <td>
          <div>${lbl('خلاصه ای از شرح حال و مراقبت های پزشکی:')}</div>
          <div class="fs-dline fs-hand" style="min-height:50px;">${e(g('summaryText'))}</div>

          <div>${lbl('خلاصه سوابق پزشکی (معاینات دوره ای):')}</div>
          <div class="fs-dline fs-hand" style="min-height:40px;">${e(g('medicalHistoryText'))}</div>

          <div>${lbl('خلاصه ای از علائم حیاتی:')}</div>
          <div class="fs-dline fs-hand" style="min-height:30px;">${e(g('_vitalsSummary'))}</div>

          <div style="margin-top:4px;">
            PR: ${dots(g('_pr'), 'w40')}
            BP: ${dots(g('_bp'), 'w60')}
            RR: ${dots(g('_rr'), 'w40')}
            SPO₂: ${dots(g('_spo2'), 'w40')}
          </div>
          <div>
            GCS: E ${dots(g('_gcsE'), 'w40')} V ${dots(g('_gcsV'), 'w40')} M ${dots(g('_gcsM'), 'w40')} T ${dots(g('_gcsTotal'), 'w40')}
          </div>

          <div style="margin-top:6px;">
            ${lbl('نیاز به همراه دارد')} ${opt(companionNeeded, 'دارد')} ${opt(!companionNeeded, 'ندارد')}
            ${lbl('نام و نام خانوادگی همراه:')} ${dots(g('companionName'), 'w120')}
            ${lbl('شماره تماس:')} ${dots(g('companionPhone'), 'w100')}
          </div>

          <div style="margin-top:6px;">
            ${lbl('نحوه اعزام/ ارجاع:')}
            ${opt(isDispatch, 'با آمبولانس')}
            ${lbl('سایر')} ${dots(isReferral && d.transportType ? (transportMap[d.transportType] || d.transportType) : '', 'w120')}
          </div>

          <div class="fs-sign">
            مهر و امضاء
            <small>تکنسین فوریت های پزشکی</small>
          </div>
        </td>
      </tr>
    </table>

    <table class="fs-grid">
      <tr>
        <td class="fs-side" rowspan="1"><span>اعزام به بیمارستان</span></td>
        <td>
          <div style="margin-bottom:3px;">
            ${lbl('ساعت خروج از شرکت:')} ${dots('', 'w40')} : ${dots('', 'w40')}
            ${lbl('ساعت حضور در بیمارستان:')} ${dots('', 'w40')} : ${dots('', 'w40')}
          </div>
          <div style="margin-bottom:3px;">
            ${lbl('ساعت خروج از بیمارستان:')} ${dots('', 'w40')} : ${dots('', 'w40')}
            ${lbl('ساعت حضور در شرکت:')} ${dots('', 'w40')} : ${dots('', 'w40')}
          </div>

          <div style="margin-top:6px;">${lbl('اقدامات صورت پذیرفته در مسیر بیمارستان و وضعیت بیمار (علائم حیاتی) در زمان تحویل:')}</div>
          ${dline(2)}

          <div style="margin-top:6px;">
            Vital Signs
            BP: ${dots('', 'w50')} PR: ${dots('', 'w40')} RR: ${dots('', 'w40')} GCS: ${dots('', 'w40')} Tem: ${dots('', 'w40')} SPO₂: ${dots('', 'w40')}
          </div>

          <div style="margin-top:8px;">
            ${lbl('نام و نام خانوادگی و امضاء تکنسین فوریت های پزشکی:')} ${dots('', 'w140')}
          </div>
          <div style="margin-top:4px;">
            ${lbl('نام و نام خانوادگی و امضاء راننده:')} ${dots('', 'w160')}
          </div>

          <div style="margin-top:6px;">${lbl('توضیحات:')}</div>
          ${dline(1)}

          <div style="margin-top:8px;">${lbl('تائیدیه تحویل بیمار به پزشک:')}</div>
          <div style="margin-top:4px;">${lbl('اورژانس بیمارستان:')} ${dots(g('hospitalEmergency'), 'w180')}</div>
          <div class="fs-sign">مهر و امضا</div>
        </td>
      </tr>
    </table>

    <div class="fs-note">
      بدینوسیله تائید می گردد فرم اعزام به بیمارستان آقای
      ${dots(g('_patientName'), 'w130')}
      در مورخه: ${dots('', 'w70')} ساعت: ${dots('', 'w50')}
      به رویت و تائید اینجانب ${dots('', 'w130')} رسید.
    </div>

    <div class="fs-note" style="text-align:left;font-weight:400;">
      امضاء رئیس ایمنی، بهداشت و محیط زیست: ${dots('', 'w180')}
    </div>

    <div class="fs-note">توزیع نسخ: نسخه اول: واحد بهداری — نسخه دوم: پرونده بیمارستان</div>
  `, { compact: true });
}

export function render(d) {
  d = d || {};
  const copies = Number(d.copyCount) === 1 ? 1 : 2;
  const one = buildOneCopy(d);

  if (copies === 1) {
    return `<div class="form-sheet">${one}</div>`;
  }

  // ⭐ دو شیت A4 مستقل — نه یک شیت با دو محتوا
  return `
    <div class="form-sheet">${one}</div>
    <div class="form-sheet">${one}</div>
  `;
}
