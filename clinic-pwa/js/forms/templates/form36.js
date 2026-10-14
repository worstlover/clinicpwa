// js/forms/templates/form36.js
import { escapeHtml } from '../../utils.js';
import {
  loadVisitFull, buildSummaryText,
  formatTehranTime, tehranJalali, isIncidentVisit,
  isDispatchTreatment, isReferralTreatment
} from '../visit-data.js';

export const fields = [
  { key: 'rowNumber', label: 'شماره ردیف', editable: true, col: 6 },
  { key: 'summaryText', label: 'شرح حال مصدوم، اقدامات صورت پذیرفته', type: 'textarea', rows: 3, editable: true, col: 12 },
  { key: 'dispatchedOutside', label: 'به مراکز درمانی بیرون اعزام شد؟', type: 'select', editable: true, col: 6,
    options: [{ value: 'yes', label: 'بله' }, { value: 'no', label: 'خیر' }]
  },
  { key: 'mechanism', label: 'نوع مکانیزم جهت اعزام', type: 'select', editable: true, col: 6,
    options: [
      { value: '', label: '—' },
      { value: 'ambulance', label: 'آمبولانس' },
      { value: 'agency', label: 'آژانس' }
    ]
  },
  { key: 'note', label: 'توضیح', type: 'textarea', rows: 2, editable: true, col: 12 },
  { key: 'receiverName', label: 'تحویل اینجانب (نام)', editable: true, col: 6 }
];

export async function load({ visitId }) {
  if (!visitId) throw new Error('visitId لازم است');
  const d = await loadVisitFull(visitId);
  const v = d.visit;
  const e = d.extra || {};
  const pe = d.patientExtra || {};

  const isInc = isIncidentVisit(v);
  const vDispatch = isDispatchTreatment(v.treatment_result_id);
  const vReferral = isReferralTreatment(v.treatment_result_id);
  const outside = vDispatch || vReferral;

  let mechanism = '';
  if (vDispatch || e.transport_type === 'ambulance') mechanism = 'ambulance';
  else if (e.transport_type === 'agency') mechanism = 'agency';

  let autoNote = '';
  if (vReferral && e.transport_type && !['ambulance','agency'].includes(e.transport_type)) {
    const map = { personal: 'وسیله شخصی', transport: 'ترانسپورت', other: 'سایر' };
    autoNote = map[e.transport_type] || '';
  }

  return {
    data: {
      rowNumber: String(v.id),
      summaryText: buildSummaryText(d),
      dispatchedOutside: outside ? 'yes' : 'no',
      mechanism,
      note: autoNote,
      receiverName: '',
      _patientName: `${d.patient.first_name || ''} ${d.patient.last_name || ''}`.trim(),
      _personnelNumber: d.patient.personnel_number || '',
      _phone: d.patient.phone_number || '',
      _unitContractor: [pe.work_unit, d.company?.name].filter(Boolean).join('/'),
      _incidentDateTime: e.incident_at
        ? `${tehranJalali(e.incident_at)} ${formatTehranTime(e.incident_at)}`
        : '',
      _injuries: (d.injuries || []).join('، '),
      _visitDateTime: `${tehranJalali(v.visit_date)} ${formatTehranTime(v.visit_date)}`,
      _dispatchTime: v.dispatch_time ? formatTehranTime(v.dispatch_time) : ''
    },
    meta: { isIncident: isInc }
  };
}

function line(v, w) {
  return `<span style="display:inline-block;min-width:${w || 120}px;border-bottom:1px dotted #000;padding:0 4px;">${escapeHtml(v || '')}</span>`;
}
const cbox = (checked) =>
  `<span style="display:inline-block;width:12px;height:12px;border:1.2px solid #000;text-align:center;line-height:10px;vertical-align:middle;">${checked ? '✓' : ''}</span>`;

export function render(d) {
  d = d || {};
  const get = (k, def = '') => d[k] ?? def;
  const isDispatched = d.dispatchedOutside === 'yes';
  const isAmb = d.mechanism === 'ambulance';
  const isAg = d.mechanism === 'agency';

  return `
    <div style="font-family:Vazirmatn,Tahoma,sans-serif;direction:rtl;font-size:11px;line-height:2.1;color:#000;">
      <div style="text-align:left;font-weight:700;font-size:10px;" dir="ltr">BR-FR-HS-36-00</div>
      <div style="text-align:center;font-weight:800;font-size:13px;margin:4px 0 12px;">فرم گزارش مراجعات حوادث ناشی از کار به بهداری</div>

      <div style="margin-bottom:4px;">نام و نام خانوادگی حادثه دیده: ${line(get('_patientName'), 180)}</div>
      <div style="margin-bottom:4px;">شماره پرسنلی: ${line(get('_personnelNumber'), 100)}</div>
      <div style="margin-bottom:4px;">شماره تلفن مصدوم: ${line(get('_phone'), 120)}</div>
      <div style="margin-bottom:4px;">واحد/ پیمانکار: ${line(get('_unitContractor'), 180)}</div>
      <div style="margin-bottom:4px;">تاریخ و ساعت رخداد حادثه: ${line(get('_incidentDateTime'), 160)}</div>
      <div style="margin-bottom:4px;">عضو صدمه دیده: ${line(get('_injuries'), 220)}</div>
      <div style="margin-bottom:4px;">تاریخ و ساعت ورود مصدوم به بهداری: ${line(get('_visitDateTime'), 160)}</div>
      <div style="margin-bottom:4px;">شماره ردیف ثبت در فرم ثبت اطلاعات مراجعین به بهداری: ${line(get('rowNumber'), 90)}</div>

      <div style="margin-top:8px;">
        شرح حال مصدوم، اقدامات صورت پذیرفته:
        <div style="min-height:70px;border:1px solid #000;padding:4px 6px;margin-top:4px;">${escapeHtml(get('summaryText'))}</div>
      </div>

      <div style="margin:8px 0;">
        آیا مصدوم به مراکز درمانی بیرون اعزام شد؟
        بله ${cbox(isDispatched)}
        خیر ${cbox(!isDispatched)}
      </div>

      <div style="margin:8px 0;">
        نوع مکانیزم جهت اعزام:
        آمبولانس ${cbox(isAmb)}
        آژانس ${cbox(isAg)}
      </div>

      <div style="margin-bottom:4px;">زمان اعزام: ${line(get('_dispatchTime'), 70)}</div>

      <div style="margin-top:8px;">
        توضیح:
        <div style="min-height:50px;border:1px solid #000;padding:4px 6px;margin-top:4px;">${escapeHtml(get('note'))}</div>
      </div>

      <div style="text-align:left;margin-top:10px;font-size:10px;">
        تایید و امضاء تکنسین فوریت های پزشکی: ${line('', 200)}
      </div>

      <div style="margin-top:14px;border-top:1.5px solid #000;padding-top:10px;">
        بدینوسیله تائید می گردد فرم گزارش مراجعات حوادث ناشی از کار به بهداری آقای
        ${line(get('_patientName'), 160)}
        در مورخه: ${line('', 100)} ساعت: ${line('', 70)}
        تحویل اینجانب ${line(get('receiverName'), 180)} گردید.
      </div>

      <div style="text-align:left;margin-top:10px;font-size:10px;">
        تائید رئیس ایمنی، بهداشت و محیط زیست: ${line('', 200)}
      </div>
    </div>
  `;
}
