// js/forms/templates/form34.js
import { escapeHtml } from '../../utils.js';
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

function line(v, w) {
  return `<span style="display:inline-block;min-width:${w || 120}px;border-bottom:1px dotted #000;padding:0 4px;">${escapeHtml(v || '')}</span>`;
}
const cbox = (checked) =>
  `<span style="display:inline-block;width:12px;height:12px;border:1.2px solid #000;text-align:center;line-height:10px;vertical-align:middle;">${checked ? '✓' : ''}</span>`;

export function render(d) {
  d = d || {};
  const get = (k, def = '') => d[k] ?? def;
  const isInc = d.causeType === 'incident';

  return `
    <div style="font-family:Vazirmatn,Tahoma,sans-serif;direction:rtl;font-size:11px;line-height:2.1;color:#000;">
      <div style="text-align:left;font-weight:700;font-size:10px;" dir="ltr">BR-FR-HS-34-00</div>
      <div style="text-align:center;font-weight:800;font-size:13px;margin:4px 0 10px;">فرم بستری موقت مراجعه کننده</div>

      <div style="font-weight:800;margin-bottom:6px;">مشخصات مراجعه کننده: (بیمار/مصدوم)</div>

      <div style="margin-bottom:4px;">
        نام و نام خانوادگی: ${line(get('_patientName'), 160)}
        کد پرسنلی: ${line(get('_personnelNumber'), 90)}
      </div>
      <div style="margin-bottom:4px;">
        تاریخ: ${line(get('_visitDate'), 100)}
        سن: ${line(get('_age'), 60)}
        شماره تماس: ${line(get('_phone'), 120)}
      </div>
      <div style="margin-bottom:4px;">
        شماره ردیف فرم ثبت مراجعات: ${line(get('rowNumber'), 90)}
      </div>
      ${isInc ? `<div style="margin-bottom:4px;">در صورت وقوع حادثه محل آن: ${line(get('_incidentLocation'), 200)}</div>` : ''}
      <div style="margin-bottom:4px;">
        نام واحد/پیمانکار: ${line(get('_unitContractor'), 140)}
        محل کار: ${line(get('_workUnit'), 140)}
      </div>
      <div style="margin-bottom:4px;">
        ساعت شروع علائم/وقوع حادثه: ${line(get('_symptomTime'), 70)}
        ساعت مراجعه به واحد بهداری: ${line(get('_visitTime'), 70)}
      </div>

      <div style="margin:8px 0;">
        - علت مراجعه:
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:10px;">${cbox(!isInc)} بیماری</span>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:10px;">${cbox(isInc)} حادثه</span>
      </div>

      <div style="margin:6px 0;">
        - وضعیت مراجعه کننده:
        BP: ${line(get('_bp'), 60)}
        PR: ${line(get('_pr'), 50)}
        RR: ${line(get('_rr'), 50)}
        Tem: ${line(get('_tem'), 50)}
        SPO₂: ${line(get('_spo2'), 50)}
      </div>

      <div style="margin-top:8px;">
        - شرح حال و شرح اقدامات انجام شده:
        <div style="min-height:70px;border:1px solid #000;padding:4px 6px;margin-top:4px;font-size:11px;">${escapeHtml(get('summaryText'))}</div>
      </div>

      <div style="text-align:left;margin-top:8px;font-size:10px;">
        نام و نام خانوادگی و امضاء پرستار: ${line('', 200)}
      </div>

      <div style="text-align:center;font-weight:800;font-size:12px;margin:16px 0 10px;border-top:1.5px solid #000;padding-top:8px;">
        تعیین تکلیف بیمار/مصدوم
      </div>

      <div style="margin-bottom:14px;">
        <div>
          <strong>(الف)</strong>
          بیمار در تاریخ ${line(get('_dischargeDate'), 110)}
          ساعت ${line(get('_dischargeTime'), 60)}
          با توصیه های پزشکی زیر مرخص شد:
        </div>
        <div style="min-height:70px;border:1px solid #000;padding:4px 6px;margin:4px 0;font-size:11px;">${escapeHtml(get('dischargeAdvice'))}</div>
        <div style="text-align:left;font-size:10px;">
          نام و نام خانوادگی و امضاء پرستار: ${line('', 200)}
        </div>
        <div style="margin-top:6px;">
          توصیه های فوق به اطلاع اینجانب ${line(get('notifyPerson'), 180)} رسانده شد.
        </div>
        <div style="text-align:left;font-size:10px;margin-top:4px;">
          امضاء مراجعه کننده: ${line('', 200)}
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <div>
          <strong>(ب)</strong>
          بیمار در تاریخ ${line(get('_dispatchDate'), 110)}
          ساعت ${line(get('_dispatchTime'), 60)}
          با نظر آقای(سرشیفت بهداری) ${line(get('supervisorName'), 130)}
          بوسیله آمبولانس / آژانس به بیمارستان اعزام گردید و فرم اعزام به بیمارستان برای ایشان تکمیل گردید.
        </div>
        <div style="text-align:left;font-size:10px;margin-top:6px;">
          نام و نام خانوادگی و امضاء پرستار: ${line('', 200)}
        </div>
      </div>

      <div>
        <p style="text-align:justify;line-height:2.1;">
          <strong>(پ)</strong>
          اینجانب آقا/خانم ${line(get('_patientName'), 150)}
          فرزند ${line(get('_fatherName'), 100)}
          به کد ملی ${line(get('_nationalCode'), 110)}
          از واحد/پیمانکاری ${line(get('_unitContractor'), 130)}
          به شماره پرسنلی ${line(get('_personnelNumber'), 80)}
          در روز ${line('', 70)} مورخ ${line(get('_leftAtDate'), 90)}
          ساعت ${line(get('leftAt'), 60)}
          علیرغم توصیه کادر درمان، مبنی بر عدم ترخیص، با صلاحدید و رضایت شخصی خود واحد بهداری را ترک نمودم، هرگونه عواقب ناشی از این موضوع که سلامت اینجانب را تحت تاثیر قرار دهد بر عهده می گیرم و متعهد می شوم که در اسرع وقت نسبت به درمان بیماری خود شخصا اقدام نمایم.
        </p>
        <div style="text-align:left;font-size:10px;margin-top:6px;">
          امضاء و اثر انگشت مراجعه کننده: ${line('', 200)}
        </div>
      </div>
    </div>
  `;
}
