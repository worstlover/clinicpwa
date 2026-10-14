// js/forms/templates/form38.js
import { escapeHtml, todayJalali, jalaliToGregorian } from '../../utils.js';
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
  // کاربران
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

  // تاریخچه شیفت‌ها
  let shiftHistory = [];
  try {
    const { data } = await sb.from('core_dailyreport')
      .select('shift_type').not('shift_type', 'is', null).limit(50);
    shiftHistory = [...new Set((data || []).map(x => x.shift_type).filter(Boolean))];
  } catch {}

  // شمارش ویزیت‌ها در بازه
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

// ⭐️ ذخیره‌ی سفارشی در core_dailyreport
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

function line(v, w) {
  return `<span style="display:inline-block;min-width:${w || 100}px;border-bottom:1px dotted #000;padding:0 4px;">${escapeHtml(v || '')}</span>`;
}

export function render(d) {
  d = d || {};
  const get = (k, def = '') => d[k] ?? def;

  return `
    <div style="font-family:Vazirmatn,Tahoma,sans-serif;direction:rtl;font-size:11px;line-height:1.9;color:#000;">
      <div style="text-align:left;font-weight:700;font-size:10px;" dir="ltr">BR-FR-HS-38-00</div>
      <div style="text-align:center;font-weight:800;font-size:13px;margin:4px 0 10px;">فرم گزارش شیفت بهداری</div>

      <div style="margin-bottom:6px;">
        تاریخ: ${line(get('date'), 80)}
        از ساعت: ${line(get('fromTime'), 45)}
        تا ساعت: ${line(get('toTime'), 45)}
        شیفت: ${line(get('shiftType'), 80)}
      </div>

      <div style="margin-bottom:6px;">
        پزشک: ${line(get('doctorId'), 130)}
        پرستار: ${line(get('nurseId'), 130)}
      </div>

      <div style="margin-bottom:6px;">
        <strong>پزشک: فعالیت / اعزام انجام شده:</strong>
        <div style="min-height:40px;border:1px solid #000;padding:3px 4px;margin-top:2px;">${escapeHtml(get('dispatchedAction'))}</div>
      </div>

      <div style="margin-bottom:6px;">
        <strong>فعالیت‌های برنامه‌ریزی برای شیفت بعدی:</strong>
        <div style="min-height:40px;border:1px solid #000;padding:3px 4px;margin-top:2px;">${escapeHtml(get('nextShiftPlan'))}</div>
      </div>

      <div style="margin:8px 0;">
        <strong>تعداد مراجعات:</strong>
        سرپایی: ${line(get('outpatientCount'), 45)} نفر
        — اعزامی به بهاباد: ${line(get('referralCount'), 45)} مورد
      </div>
      <div style="margin-bottom:6px;">
        خدمات پرستاری: ${line(get('nursingServicesCount'), 45)} مورد
        — واکسیناسیون: ${line(get('vaccinationCount'), 45)} نفر
      </div>
      <div style="margin-bottom:6px;">
        معاینه و ویزیت: ${line(get('visitExamCount'), 45)} نفر
        — مشاوره پزشکی: ${line(get('consultationCount'), 45)} مورد
      </div>

      <div style="margin-bottom:6px;">
        <strong>توضیحات:</strong>
        <div style="min-height:40px;border:1px solid #000;padding:3px 4px;margin-top:2px;">${escapeHtml(get('generalNotes'))}</div>
      </div>

      <div style="margin-bottom:6px;">
        <strong>وضعیت تجهیزات و داروهای بهداری:</strong>
        <div style="min-height:35px;border:1px solid #000;padding:3px 4px;margin-top:2px;">${escapeHtml(get('equipmentStatus'))}</div>
      </div>

      <div style="margin-bottom:6px;">
        <strong>خودرو آمبولانس (وضعیت کلی، وجود مورد خاص، سطح سوخت، کیلومتر تحویلی، نظافت و...):</strong>
        <div style="min-height:35px;border:1px solid #000;padding:3px 4px;margin-top:2px;">${escapeHtml(get('ambulanceStatus'))}</div>
      </div>

      <div style="margin-bottom:6px;">
        <strong>پیگیری‌های معاینات شغلی:</strong>
        <div style="min-height:35px;border:1px solid #000;padding:3px 4px;margin-top:2px;">${escapeHtml(get('occupationalHealth'))}</div>
      </div>

      <div style="margin-bottom:6px;">
        <strong>هشدارها، بروشورها یا پیام‌های بهداشتی:</strong>
        <div style="min-height:35px;border:1px solid #000;padding:3px 4px;margin-top:2px;">${escapeHtml(get('healthAlerts'))}</div>
      </div>

      <div style="margin-bottom:6px;">
        <strong>بازدیدهای بهداشتی (آب، رستوران، خوابگاه، محیط کار و...):</strong>
        <div style="min-height:35px;border:1px solid #000;padding:3px 4px;margin-top:2px;">${escapeHtml(get('environmentalInspections'))}</div>
      </div>

      <div style="margin-bottom:6px;">
        <strong>نیازمندی‌های شناسایی‌شده:</strong>
        <div style="min-height:35px;border:1px solid #000;padding:3px 4px;margin-top:2px;">${escapeHtml(get('identifiedNeeds'))}</div>
      </div>

      <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">
        <div>
          <strong>پرستار/ فوریت‌های پزشکی (نظرات، امضاء):</strong>
          <div style="min-height:35px;border:1px solid #000;padding:3px 4px;margin-top:2px;">${escapeHtml(get('nurseComment'))}</div>
        </div>
        <div>
          <strong>سرپرست بهداشت و فوریت‌های پزشکی (نظرات، امضاء):</strong>
          <div style="min-height:35px;border:1px solid #000;padding:3px 4px;margin-top:2px;">${escapeHtml(get('supervisorComment'))}</div>
        </div>
        <div>
          <strong>رئیس HSE (اظهار نظر، امضاء):</strong>
          <div style="min-height:35px;border:1px solid #000;padding:3px 4px;margin-top:2px;">${escapeHtml(get('hseComment'))}</div>
        </div>
      </div>
    </div>
  `;
}
