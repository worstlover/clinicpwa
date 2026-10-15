// Supabase Edge Function: send-fine-sms
// فعال‌سازی: هر بار رکورد جدیدی به safety_finereward اضافه بشه
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const SMS_API_URL = 'https://api.sms-webservice.com/api/V3/SendBulk';
const SMS_API_KEY = Deno.env.get('SMS_API_KEY') || '277857-EE3091F8A0F4432184C304A9C4C85E18';
const SMS_SENDER = 30007546486486;

// تبدیل تاریخ میلادی به شمسی
function toJalali(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    const fa = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran'
    }).format(d);
    return fa.replace(/[/]/g, '/');
  } catch { return '-'; }
}

// ساخت متن پیامک
function buildMessage(record: any, patient: any): string {
  const name = `${patient?.first_name || ''} ${patient?.last_name || ''}`.trim() || 'کارگر';
  const date = toJalali(record.incident_datetime);
  const amount = record.amount ? Number(record.amount).toLocaleString('fa-IR') : '0';
  const reason = record.reason || '—';

  if (record.record_type === 'fine') {
    return `!جریمه ایمنی!\nآقای ${name}\nمبلغ ${amount} ریال در تاریخ ${date} به علت ${reason} برای شما منظور گردید.\nواحد ایمنی گندله سازی بهاباد`;
  }
  if (record.record_type === 'reward') {
    return `!تشویقی ایمنی!\nآقای ${name}\nمبلغ ${amount} ریال در تاریخ ${date} به علت ${reason} برای شما منظور گردید.\nواحد ایمنی گندله سازی بهاباد`;
  }
  if (record.record_type === 'warning') {
    return `!اخطار ایمنی!\nآقای ${name}\nدر تاریخ ${date} یک اخطار انضباطی/ایمنی به علت ${reason} در پرونده شما ثبت گردید.\nواحد ایمنی گندله سازی بهاباد`;
  }
  return '';
}

// نرمال کردن شماره موبایل
function normalizePhone(p: string): string | null {
  if (!p) return null;
  const digits = p.replace(/[^\d]/g, '');
  // 09123456789 یا 9123456789 یا 989123456789
  if (digits.startsWith('98') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 11) return '98' + digits.slice(1);
  if (digits.length === 10 && digits.startsWith('9')) return '98' + digits;
  return null;
}

serve(async (req) => {
  try {
    const payload = await req.json();
    console.log('[SMS-FN] payload:', JSON.stringify(payload));

    // Supabase Webhook payload
    const record = payload.record || payload;
    if (!record || !record.id) {
      return new Response(JSON.stringify({ error: 'no record' }), { status: 400 });
    }

    // واکشی اطلاعات بیمار
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    let patient: any = null;
    if (record.worker_id) {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/core_patient?id=eq.${record.worker_id}&select=first_name,last_name,phone_number`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          },
        }
      );
      const arr = await res.json();
      patient = arr?.[0] || null;
    }

    if (!patient?.phone_number) {
      console.warn('[SMS-FN] no phone for worker', record.worker_id);
      return new Response(JSON.stringify({ ok: false, reason: 'no phone' }), { status: 200 });
    }

    const dest = normalizePhone(patient.phone_number);
    if (!dest) {
      console.warn('[SMS-FN] invalid phone', patient.phone_number);
      return new Response(JSON.stringify({ ok: false, reason: 'invalid phone' }), { status: 200 });
    }

    const text = buildMessage(record, patient);
    if (!text) {
      return new Response(JSON.stringify({ ok: false, reason: 'no template' }), { status: 200 });
    }

    // ارسال SMS
    const smsPayload = {
      ApiKey: SMS_API_KEY,
      Text: text,
      Sender: SMS_SENDER,
      Recipients: [{ Destination: Number(dest), UserTraceId: record.id }],
    };

    const smsRes = await fetch(SMS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(smsPayload),
    });

    const smsText = await smsRes.text();
    console.log('[SMS-FN] response:', smsRes.status, smsText);

    return new Response(JSON.stringify({
      ok: smsRes.ok,
      status: smsRes.status,
      response: smsText,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[SMS-FN] error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
