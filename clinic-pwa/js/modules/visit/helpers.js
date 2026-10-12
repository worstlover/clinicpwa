// js/modules/visit/helpers.js
import { currentUser } from '../../auth.js';
import { state } from './state.js';

// ═══════════════════════════════════════════════════════
// دسترسی‌ها
// ═══════════════════════════════════════════════════════
export function getMyDjangoId() {
  return currentUser?.user_metadata?.django_user_id || null;
}

export function isSuperuser() {
  return currentUser?.user_metadata?.is_superuser === true
    || currentUser?.user_metadata?.is_superuser === 'true';
}

export function isSafetyOrSupervisor() {
  const meta = currentUser?.user_metadata || {};
  const groups = meta.groups || [];
  if (Array.isArray(groups)) {
    return groups.some(g => ['safety', 'Supervisor', 'ایمنی', 'سوپروایزر'].includes(g));
  }
  if (typeof groups === 'string') {
    return groups.includes('safety') || groups.includes('Supervisor');
  }
  if (meta.is_safety || meta.is_supervisor) return true;
  return false;
}

export function canEditClinical(v) {
  if (!v) return false;
  if (v.status === 'completed') return false;
  if (isSuperuser()) return true;
  return v.assigned_to_id === getMyDjangoId();
}

export function canEditIncident(v) {
  if (!v) return false;
  if (v.status === 'completed') return false;
  if (isSuperuser()) return true;
  if (v.assigned_to_id === getMyDjangoId()) return true;
  return isSafetyOrSupervisor();
}

export function isIncidentOnlyMode(v) {
  if (!v) return false;
  if (isSuperuser()) return false;
  if (canEditClinical(v)) return false;
  return isSafetyOrSupervisor();
}

export function canEditVisit(v) {
  if (!v) return false;
  if (v.status === 'completed') return false;
  if (isSuperuser()) return true;
  return v.assigned_to_id === getMyDjangoId() || isSafetyOrSupervisor();
}

export function canViewVisit(v) {
  if (!v) return false;
  if (v.status === 'completed') return true;
  if (isSuperuser()) return true;
  const myId = getMyDjangoId();
  if (v.doctor_id === myId || v.assigned_to_id === myId) return true;
  if (isSafetyOrSupervisor() && v.is_incident && v.incident_type !== 'none') return true;
  return false;
}

// ═══════════════════════════════════════════════════════
// توابع کمکی
// ═══════════════════════════════════════════════════════
export function getTimeStr(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  } catch (e) { return ''; }
}

export function getIncLabel(type) {
  return {
    near_miss: 'شبه حادثه',
    minor: 'حادثه جزئی',
    major: 'حادثه ماژور'
  }[type] || 'حادثه';
}

export function getIcon(form) {
  if (!form) return '💊';
  const f = String(form).toLowerCase();
  if (f.includes('آمپول') || f.includes('ویال') || f.includes('سرنگ')) return '💉';
  if (f.includes('شربت') || f.includes('سوسپانسیون')) return '🧪';
  if (f.includes('قطره') || f.includes('سرم')) return '💧';
  if (f.includes('پماد') || f.includes('کرم') || f.includes('ژل')) return '🧴';
  if (f.includes('اسپری')) return '💨';
  return '💊';
}

export function getGCSStatus(total) {
  if (!total || total < 3) return null;
  if (total === 15) return { label: 'هوشیار کامل', color: 'success', icon: '🟢' };
  if (total >= 13) return { label: 'خفیف', color: 'success', icon: '🟡' };
  if (total >= 9) return { label: 'متوسط', color: 'warning', icon: '🟠' };
  return { label: 'شدید', color: 'danger', icon: '🔴' };
}

export function getUserName(id) {
  if (!id) return '—';
  return state.userMap[id] || `کاربر #${id}`;
}

export function isDispatch(treatmentId) {
  if (!treatmentId) return false;
  const t = state.treatments.find(x => String(x.id) === String(treatmentId));
  return t?.name?.includes('اعزام');
}
