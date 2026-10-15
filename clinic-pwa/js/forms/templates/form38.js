// js/forms/templates/form38.js
import { wrap, head, lbl, val, e, dots, dline } from '../fs.js';
import { todayJalali, jalaliToGregorian } from '../../utils.js';
import { sb } from '../../sb.js';

export const fields = [
  { key: 'date', label: 'تاریخ (شمسی)', editable: true, col: 4 },
  { key: 'fromTime', label: 'از ساعت', editable: true, col: 4 },
  { key: 'toTime', label: 'تا ساعت', editable: true, col: 4 },
  { key: 'shiftType', label: 'شیفت', editable: true, col: 6 },
  { key: 'nurseId', label: 'پرستار', type: 'select', editable: true, col: 6, options: [] },
  { key: 'doctorId', label: 'پزشک', type: 'select', editable: true, col: 6, options: [] },
  { key: 'dispatchedAction', label: 'فعالیت / اعزام انجام شده', type: 'textarea', rows: 2, editable: true, col: 12 },
  { key: 'nextShiftPlan', label: 'فعالیت‌های برنامه‌ریزی برای شیفت بعدی', type: 'textarea', rows: 2, editable: true, col: 12 },
  { key: 'outpatientCount', label: 'سرپایی (نفر)', editable: true, col: 4 },
  { key: 'referralCount', label: 'اعزامی به بهاباد (مورد)', editable: true, col: 4 },
  { key: 'nursingServicesCount', label: 'خدمات پرستاری (مورد)', editable: true, col: 4 },
  { key: 'vaccinationCount', label: 'واکسیناسیون (نفر)', editable: true, col: 4 },
  { key: 'visitExamCount', label: 'معاینه و ویزیت (نفر)', editable: true, col: 4 },
  { key: 'consultationCount', label: 'مشاوره پزشکی (مورد)', editable: true, col: 4 },
  { key: 'generalNotes', label: 'توضیحات', type: 'textarea', rows: 2, editable: true, col: 12 },
  { key: 'equipmentStatus', label: 'وضعیت تجهیزات و داروهای بهداری', type: 'textarea', rows: 2, editable: true, col: 12 },
  { key: 'ambulanceStatus', label: 'خودرو آمبولانس', type: 'textarea', rows: 2, editable: true, col: 12 },
  { key: 'occupationalHealth', label: 'پیگیری‌های معاینات شغلی', type: 'textarea', rows: 2, editable: true, col: 12 },
  { key: 'healthAlerts', label: 'هشدارها، بروشورها یا پیام‌های بهداشتی', type: 'textarea', rows: 2, editable: true, col: 12 },
  { key: 'environmentalInspections', label: 'بازدیدهای بهداشتی', type: 'textarea', rows: 2, editable: true, col: 12 },
  { key: 'identifiedNeeds', label: 'نیازمندی‌های شناسایی‌شده', type: 'textarea', rows: 2, editable: true, col: 12 },
  { key: 'nurseComment', label: 'پرستار/ فوریت‌های پزشکی (نظرات)', type: 'textarea', rows: 2, editable: true, col: 12 },
  { key: 'supervisorComment', label: 'سرپرست بهداشت و فوریت‌های پزشکی (نظرات)', type: 'textarea', rows: 2, editable: true, col: 12 },
  { key: 'hseComment', label: 'رئیس HSE (اظهار نظر)', type: 'textarea', rows: 2, editable: true, col: 12 }
];

export async function load() {
  let userOptions = [];
  try {
    const { data: users } = await sb.from('auth_user')
      .select('id, first_name, last_name, username')
      .eq('is_active', true).order('first_name');
    userOptions = (users || []).map(u => ({
      value: String(u.id),
      label: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username
    }));
  } catch (e) { console.warn(e); }

  ['nurseId', 'doctorId'].forEach(k => {
    const f = fields.find(x => x.key === k);
    if (f) f.options = [{ value: '', label: '—' }, ...userOptions];
  });

  const today = todayJalali();
  const fromTime = '07:00';
  const toTime = '19:00';

  let shiftHistory = [];
  try {
    const { data } = await sb.from('core_dailyreport')
      .select('shift_type').not('shift_type', 'is', null).limit(50);
    shiftHistory = [...new Set((data || []).map(x => x.shift_type).filter(Boolean))];
  } catch {}

  let counts = { outpatient: 0, referral: 0, nursing: 0 };
  try {
    const greg = jalaliToGregorian(today);
    if (greg) {
      const fromISO = `${greg}T${fromTime}:00+03:30`;
      const toISO = `${greg}T${toTime}:00+03:30`;
      const { data: visits } = await sb.from('visits_visit')
        .select('id, treatment_result_id, reason:visits_reasonforvisit(name)')
        .gte('visit_date', new Date(fromISO).toISOString())
        .lte('visit_date', new Date(toISO).toISOString());

      (visits || []).forEach(v => {
        if (Number(v.treatment_result_id) === 2) counts.outpatient++;
        if (Number(v.treatment_result_id) === 4) counts.referral++;
        const rn = (v.reason?.name || '').toLowerCase();
        if (rn.includes('تزریق') || rn.includes('پانسمان')) counts.nursing++;
      });
    }
  } catch (e) { console.warn('count failed', e); }

  return {
    data: {
      date: today,
      fromTime, toTime,
      shiftType: '',
      nurseId: '', doctorId: '',
      dispatchedAction: '', nextShiftPlan: '',
      outpatientCount: String(counts.outpatient),
      referralCount: String(counts.referral),
      nursingServicesCount: String(counts.nursing),
      vaccinationCount: '0',
      visitExamCount: '0',
      consultationCount: '0',
      generalNotes: '', equipmentStatus: '', ambulanceStatus: '',
      occupationalHealth: '', healthAlerts: '', environmentalInspections: '',
      identifiedNeeds: '',
      nurseComment: '', supervisorComment: '', hseComment: '',
      _visitCount: String(counts.outpatient + counts.referral),
      _shiftHistory: shiftHistory,
      _userOptions: userOptions
    },
    meta: {}
  };
}

export async function saveArchive(data, ctx) {
  const getN = (k) => parseInt(data[k], 10) || 0;
  const greg = jalaliToGregorian(data.date || '');
  if (!greg) throw new Error('تاریخ نامعتبر');

  const row = {
    date: greg,
    shift_type: data.shiftType || '',
    dispatched_action: data.dispatchedAction || '',
    next_shift_plan: data.nextShiftPlan || '',
    ambulance_status: data.ambulanceStatus || '',
    equipment_status: data.equipmentStatus || '',
    occupational_health: data.occupationalHealth || '',
    health_alerts: data.healthAlerts || '',
    environmental_inspections: data.environmentalInspections || '',
    general_notes: (data.generalNotes || '') +
      (data.identifiedNeeds ? `\nنیازمندی‌ها: ${data.identifiedNeeds}` : ''),
    outpatient_count: getN('outpatientCount'),
    nursing_services_count: getN('nursingServicesCount'),
    visit_exam_count: getN('visitExamCount'),
    vaccination_count: getN('vaccinationCount'),
    consultation_count: getN('consultationCount'),
    referral_to_clinic: getN('referralCount'),
    doctor_id: data.doctorId ? parseInt(data.doctorId, 10) : null,
    nurse_id: data.nurseId ? parseInt(data.nurseId, 10) : null
  };

  const { data: existing, error: e1 } = await sb.from('core_dailyreport')
    .select('id').eq('date', greg).eq('shift_type', row.shift_type).limit(1);
  if (e1) throw e1;

  if (existing?.length) {
    const { error } = await sb.from('core_dailyreport')
      .update(row).eq('id', existing[0].id);
    if (error) throw error;
  } else {
    const { error } = await sb.from('core_dailyreport').insert(row);
    if (error) throw error;
  }
}

export function render(d) {
  d = d || {};
  const g = (k) => d[k] ?? '';
  const nameOf = (id) => (d._userOptions || []).find(o => String(o.value) === String(id))?.label || '';

  const textBlock = (label, v) => `
    <tr>
      <td colspan="6" class="fs-small">
        <div>${lbl(label)}</div>
        <div class="fs-dline fs-hand">${e(v)}</div>
      </td>
    </tr>`;

  return wrap(`
    ${head({ code: 'BR-FR-HS-38-00', title: 'فرم گزارش شیفت بهداری' })}
    <table class="fs-grid">
      <tr>
        <td>${lbl('تاریخ:')} ${val(g('date'), { ltr: true })}</td>
        <td colspan="2">${lbl('ساعت:')} ${lbl('از')} ${val(g('fromTime'), { ltr: true })} ${lbl('تا')} ${val(g('toTime'), { ltr: true })}</td>
        <td>${lbl('شیفت:')} ${val(g('shiftType'))}</td>
        <td>${lbl('پرستار:')} ${val(nameOf(g('nurseId')))}</td>
        <td>${lbl('پزشک:')} ${val(nameOf(g('doctorId')))}</td>
      </tr>
      <tr>
        <td colspan="6" style="height:110px;">
          <div>${lbl('پزشک: فعالیت /اعزام انجام شده:')}</div>
          <div class="fs-dline fs-hand">${e(g('dispatchedAction'))}</div>
          <div style="margin-top:6px;">${lbl('فعالیت های برنامه ریزی برای شیفت بعدی:')}</div>
          <div class="fs-dline fs-hand">${e(g('nextShiftPlan'))}</div>
        </td>
      </tr>
    </table>

    <table class="fs-grid">
      <tr>
        <td colspan="6">${lbl('تعداد مراجعات:')}</td>
      </tr>
    </table>

    <table class="fs-grid fs-count">
      <tr>
        <td>${lbl('سرپایی:')} ${dots(g('outpatientCount'), 'w40')} ${lbl('نفر')}</td>
        <td>${lbl('اعزامی به بهاباد:')} ${dots(g('referralCount'), 'w40')} ${lbl('مورد')}</td>
        <td>${lbl('خدمات پرستاری:')} ${dots(g('nursingServicesCount'), 'w40')} ${lbl('مورد')}</td>
      </tr>
      <tr>
        <td>${lbl('واکسیناسیون:')} ${dots(g('vaccinationCount'), 'w40')} ${lbl('نفر')}</td>
        <td>${lbl('معاینه و ویزیت:')} ${dots(g('visitExamCount'), 'w40')} ${lbl('نفر')}</td>
        <td>${lbl('مشاوره پزشکی:')} ${dots(g('consultationCount'), 'w40')} ${lbl('مورد')}</td>
      </tr>
    </table>

    <table class="fs-grid">
      ${textBlock('توضیحات:', g('generalNotes'))}
      ${textBlock('وضعیت تجهیزات و داروهای بهداری:', g('equipmentStatus'))}
      ${textBlock('خودرو آمبولانس (وضعیت کلی، وجود مورد خاص، سطح سوخت، کیلومتر تحویلی، نظافت و...):', g('ambulanceStatus'))}
      ${textBlock('پیگیری های معاینات شغلی:', g('occupationalHealth'))}
      ${textBlock('هشدارها، بروشورها یا پیام های بهداشتی:', g('healthAlerts'))}
      ${textBlock('بازدید های بهداشتی (آب، رستوران، خوابگاه، محیط کار و....):', g('environmentalInspections'))}
      ${textBlock('نیازمندی‌های شناسایی شده:', g('identifiedNeeds'))}

      <tr>
        <td colspan="3" class="fs-small">
          <div>${lbl('پرستار/ فوریت های پزشکی (نظرات، امضاء):')}</div>
          <div class="fs-dline fs-hand">${e(g('nurseComment'))}</div>
        </td>
        <td colspan="3" class="fs-small">
          <div>${lbl('سرپرست بهداشت و فوریت های پزشکی: (نظرات، امضاء):')}</div>
          <div class="fs-dline fs-hand">${e(g('supervisorComment'))}</div>
        </td>
      </tr>
      <tr>
        <td colspan="6" class="fs-small">
          <div>${lbl('رئیس HSE (اظهار نظر، امضاء):')}</div>
          <div class="fs-dline fs-hand">${e(g('hseComment'))}</div>
        </td>
      </tr>
    </table>
  `);
}
