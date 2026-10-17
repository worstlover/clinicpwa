// js/modules/amoot-api.js
import { sb } from '../sb.js';

export async function getAccountStatus() {
  try {
    const { data, error } = await sb.functions.invoke('amoot-account-status');
    if (error) throw new Error(error.message);
    if (!data.success) throw new Error(data.error);
    return { success: true, data: data.data };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function getDeliveries(messageIds) {
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return { success: false, error: 'لیست شناسه پیامک‌ها خالی است' };
  }
  try {
    const { data, error } = await sb.functions.invoke('amoot-get-deliveries', {
      body: { messageIds: messageIds }
    });
    if (error) throw new Error(error.message);
    if (!data.success) throw new Error(data.error);
    
    // بازگرداندن پاسخ خام آموت (حاوی Status و Data)
    return { success: true, data: data.data };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
