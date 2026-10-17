// js/modules/amoot-api.js
import { sb } from '../sb.js';

/**
 * دریافت وضعیت حساب کاربری (اعتبار، تعرفه‌ها و خطوط)
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function getAccountStatus() {
  try {
    const { data, error } = await sb.functions.invoke('amoot-account-status');
    if (error) throw new Error(error.message || 'خطا در ارتباط با سرور');
    if (!data.success) throw new Error(data.error || 'خطای نامشخص از سمت آموت');
    return { success: true, data: data.data };
  } catch (e) {
    console.error('[AmootAPI] AccountStatus Error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * دریافت لیست پیامک‌های ارسال شده
 * @param {Object} params - پارامترهای فیلتر (تاریخ شروع، تاریخ پایان، شماره خط و...)
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export async function getMessages(params = {}) {
  try {
    const { data, error } = await sb.functions.invoke('amoot-get-messages', {
      body: params
    });
    if (error) throw new Error(error.message || 'خطا در ارتباط با سرور');
    if (!data.success) throw new Error(data.error || 'خطای نامشخص از سمت آموت');
    return { success: true, data: data.data };
  } catch (e) {
    console.error('[AmootAPI] GetMessage Error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * استعلام وضعیت تحویل پیامک‌ها
 * @param {string[]} messageIds - آرایه‌ای از شناسه پیامک‌ها (MessageID)
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export async function getDeliveries(messageIds) {
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return { success: false, error: 'لیست شناسه پیامک‌ها خالی است' };
  }
  try {
    const { data, error } = await sb.functions.invoke('amoot-get-deliveries', {
      body: { messageIds: messageIds }
    });
    if (error) throw new Error(error.message || 'خطا در ارتباط با سرور');
    if (!data.success) throw new Error(data.error || 'خطای نامشخص از سمت آموت');
    return { success: true, data: data.data };
  } catch (e) {
    console.error('[AmootAPI] GetDeliveries Error:', e);
    return { success: false, error: e.message };
  }
}
