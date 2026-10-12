// js/modules/visit/changelog.js
import { sb } from '../../sb.js';
import { currentUser } from '../../auth.js';
import { getMyDjangoId } from './helpers.js';

export async function logChange(visitId, action, fieldChanges, notes) {
  try {
    const myId = getMyDjangoId();
    const userName = currentUser?.user_metadata?.full_name
      || currentUser?.user_metadata?.django_username
      || currentUser?.email || 'نامشخص';

    await sb.from('visits_visitchangelog').insert({
      visit_id: visitId,
      user_id: myId,
      user_name: userName,
      action,
      field_changes: fieldChanges || [],
      created_at: new Date().toISOString()
    });
  } catch (e) {
    console.warn('خطا در لاگ:', e);
  }
}

export async function loadChangeLog(visitId) {
  try {
    const { data } = await sb.from('visits_visitchangelog')
      .select('*').eq('visit_id', visitId)
      .order('created_at', { ascending: false });
    return data || [];
  } catch (e) {
    console.warn(e);
    return [];
  }
}
