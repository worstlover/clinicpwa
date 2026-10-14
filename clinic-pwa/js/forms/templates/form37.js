// js/forms/templates/form37.js
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

function line(v, w) {
  return `<span style="display:inline-block;min-width:${w || 120}px;border-bottom:1px dotted #000;padding:0 4px;">${escapeHtml(v || '')}</span>`;
}
function emptyLine() {
  return `<div style="border-bottom:1px dotted #000;min-height:22px;margin-bottom:4px;"></div>`;
}
const cbox = (checked) =>
  `<span style="display:inline-block;width:12px;height:12px;border:1.2px solid #000;text-align:center;line-height:10px;vertical-align:middle;">${checked ? '✓' : ''}</span>`;

function buildOneCopy(d) {
  const get = (k, def = '') => d[k] ?? def;
  const isDispatch = d._isDispatch;
  const isReferral = d._isReferral;
  const companionNeeded = d.companionNeeded === 'yes';
  const transportMap = { agency: 'آژانس', personal: 'وسیله شخصی', transport: 'ترانسپورت', other: 'سایر' };

  return `
    <div style="font-family:Vazirmatn,Tahoma,sans-serif;direction:rtl;font-size:10px;line-height:1.9;color:#000;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
        <tr>
          <td style="border:1.2px solid #000;padding:4px 6px;width:110px;text-align:center;font-size:9px;" dir="ltr">BR-FR-HS-37-00</td>
          <td style="border:1.2px solid #000;padding:4px 6px;text-align:center;font-weight:800;font-size:12px;">فرم اعزام / ارجاع به مرکز درمانی</td>
          <td style="border:1.2px solid #000;padding:4px 6px;width:60px;text-align:center;">
            <img src="icons/logo-form.png" style="max-width:50px;max-height:50px;" onerror="this.style.display='none'">
          </td>
        </tr>
      </table>

      <div style="font-weight:800;margin:6px 0 4px;">مشخصات مراجعه کننده:</div>
      <div style="margin-bottom:3px;">
        نام و نام خانوادگی: ${line(get('_patientName'), 140)}
        نام پدر: ${line(get('_fatherName'), 90)}
        کد ملی: ${line(get('_nationalCode'), 90)}
      </div>
      <div style="margin-bottom:3px;">
        تاریخ تولد: ${line(get('_dob'), 80)}
        محل تولد: ${line(get('birthPlace'), 90)}
        شماره تماس: ${line(get('_phone'), 100)}
      </div>
      <div style="margin-bottom:3px;">
        کدپرسنلی: ${line(get('_personnelNumber'), 80)}
        ساعت وقوع علائم بیماری/حادثه: ${line(get('_symptomTime'), 60)}
      </div>
      <div style="margin-bottom:3px;">
        شماره ردیف فرم ثبت مراجعات: ${line(get('rowNumber'), 70)}
        نام واحد/پیمانکار: ${line(get('_unitContractor'), 130)}
      </div>
      <div style="margin-bottom:6px;">
        ساعت مراجعه به بهداری: ${line(get('_visitTime'), 60)}
        تاریخ: ${line(get('_visitDate'), 80)}
      </div>

      <div style="border:1.2px solid #000;padding:6px;margin-bottom:6px;">
        <div style="text-align:center;font-weight:800;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:5px;">نظریه پزشکی</div>

        <div style="font-weight:700;">خلاصه ای از شرح حال و مراقبت های پزشکی:</div>
        <div style="min-height:50px;border-bottom:1px dotted #000;padding:3px 2px;margin-bottom:4px;">${escapeHtml(get('summaryText'))}</div>

        <div style="font-weight:700;">خلاصه سوابق پزشکی (معاینات دوره ای):</div>
        <div style="min-height:40px;border-bottom:1px dotted #000;padding:3px 2px;margin-bottom:4px;">${escapeHtml(get('medicalHistoryText'))}</div>

        <div style="font-weight:700;">خلاصه ای از علائم حیاتی:</div>
        <div style="min-height:30px;border-bottom:1px dotted #000;padding:3px 2px;margin-bottom:4px;">${escapeHtml(get('_vitalsSummary'))}</div>

        <div style="margin:4px 0;">
          PR: ${line(get('_pr'), 40)}
          BP: ${line(get('_bp'), 60)}
          RR: ${line(get('_rr'), 40)}
          SPO₂: ${line(get('_spo2'), 40)}
        </div>
        <div style="margin:4px 0;">
          GCS: E ${line(get('_gcsE'), 25)} V ${line(get('_gcsV'), 25)} M ${line(get('_gcsM'), 25)} T ${line(get('_gcsTotal'), 25)}
        </div>

        <div style="margin:6px 0;">
          نیاز به همراه دارد ${cbox(companionNeeded)} ندارد ${cbox(!companionNeeded)}
          نام و نام خانوادگی همراه: ${line(get('companionName'), 130)}
          شماره تماس: ${line(get('companionPhone'), 100)}
        </div>

        <div style="margin:6px 0;">
          نحوه اعزام/ ارجاع:
          با آمبولانس ${cbox(isDispatch)}
          سایر
          ${isReferral && d.transportType
            ? `(${escapeHtml(transportMap[d.transportType] || d.transportType)})`
            : '...................................................'}
        </div>

        <div style="margin-top:16px;text-align:left;">
          مهر و امضاء: ${line('', 180)}
        </div>
        <div style="text-align:left;font-size:9px;">تکنسین فوریت های پزشکی</div>
      </div>

      <div style="border:1.2px solid #000;padding:6px;margin-bottom:6px;">
        <div style="text-align:center;font-weight:800;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:5px;">اعزام به بیمارستان</div>

        <div style="margin-bottom:3px;">
          ساعت خروج از شرکت: ${line('', 45)} : ${line('', 45)}
          ساعت حضور در بیمارستان: ${line('', 45)} : ${line('', 45)}
        </div>
        <div style="margin-bottom:3px;">
          ساعت خروج از بیمارستان: ${line('', 45)} : ${line('', 45)}
          ساعت حضور در شرکت: ${line('', 45)} : ${line('', 45)}
        </div>

        <div style="margin-top:6px;font-weight:700;">اقدامات صورت پذیرفته در مسیر بیمارستان و وضعیت بیمار (علائم حیاتی) در زمان تحویل:</div>
        ${empty
