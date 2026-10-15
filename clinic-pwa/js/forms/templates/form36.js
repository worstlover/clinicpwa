// js/forms/templates/form36.js
import { wrap, head, lbl, val, e, ltr, dots, opt } from '../fs.js';
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

export function render(d) {
  d = d || {};
  const g = (k) => d[k] ?? '';
  const out = d.dispatchedOutside === 'yes';
  const amb = d.mechanism === 'ambulance';
  const ag = d.mechanism === 'agency';

  return wrap(`
    ${head({ code: 'BR-FR-HS-36-00', title: 'فرم گزارش مراجعات حوادث ناشی از کار به بهداری' })}
    <table class="fs-grid">
      <tr>
        <td>${lbl('نام و نام خانوادگی حادثه دیده:')} ${val(g('_patientName'))}</td>
        <td>${lbl('شماره پرسنلی:')} ${val(g('_personnelNumber'), { ltr: true })}</td>
        <td>${lbl('شماره تلفن مصدوم:')} ${val(g('_phone'), { ltr: true })}</td>
      </tr>
      <tr>
        <td>${lbl('واحد/ پیمانکار:')} ${val(g('_unitContractor'))}</td>
        <td>${lbl('تاریخ و ساعت رخداد حادثه:')} ${val(g('_incidentDateTime'), { ltr: true })}</td>
        <td>${lbl('عضو صدمه دیده:')} ${val(g('_injuries'))}</td>
      </tr>
      <tr>
        <td>${lbl('تاریخ و ساعت ورود مصدوم به بهداری:')} ${val(g('_visitDateTime'), { ltr: true })}</td>
        <td colspan="2">${lbl('شماره ردیف ثبت در فرم ثبت اطلاعات مراجعین به بهداری:')} ${val(g('rowNumber'), { ltr: true })}</td>
      </tr>
      <tr>
        <td colspan="3" class="fs-tall">
          ${lbl('شرح حال مصدوم، اقدامات صورت پذیرفته:')}
          <div class="fs-dline fs-hand" style="min-height:70px;">${e(g('summaryText'))}</div>
        </td>
      </tr>
      <tr>
        <td colspan="3">
          ${lbl('آیا مصدوم به مراکز درمانی بیرون اعزام شد؟')}
          ${opt(out, 'بله')} ${opt(!out, 'خیر')}
        </td>
      </tr>
      <tr>
        <td colspan="2">
          ${lbl('نوع مکانیزم جهت اعزام:')}
          ${opt(amb, 'آمبولانس')} ${opt(ag, 'آژانس')}
        </td>
        <td>${lbl('زمان اعزام:')} ${dots(ltr(g('_dispatchTime')) ? g('_dispatchTime') : '', 'w60')}</td>
      </tr>
      <tr>
        <td colspan="3" class="fs-mid">
          ${lbl('توضیح:')} <span class="fs-val">${e(g('note'))}</span>
          <div class="fs-sign">تایید و امضاء تکنسین فوریت های پزشکی</div>
        </td>
      </tr>
      <tr>
        <td colspan="3" class="fs-mid">
          <div class="fs-para" style="font-size:11px;line-height:2.1">
            بدینوسیله تائید می گردد فرم گزارش مراجعات حوادث ناشی از کار به بهداری آقای
            ${dots(g('_patientName'), 'w160')}
            در مورخه: ${dots('', 'w90')} ساعت: ${dots('', 'w60')}
            تحویل اینجانب ${dots(g('receiverName'), 'w160')} گردید.
          </div>
          <div class="fs-sign">تائید رئیس ایمنی، بهداشت و محیط زیست</div>
        </td>
      </tr>
    </table>
  `);
}
