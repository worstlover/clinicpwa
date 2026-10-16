async function loadFormOptions(force) {
  const sel = $('ndmForm');
  if (!force && sel.dataset.loaded === '1') return;
  sel.innerHTML = '<option value="">در حال بارگذاری...</option>';
  try {
    const { data, error } = await sb.from('drugs_drug')
      .select('form')
      .not('form', 'is', null)
      .neq('form', '');
    if (error) throw error;

    // ⭐ استخراج فقط بخش فارسی از «tablet__قرص» یا «قرص__tablet»
    const formsSet = new Set();
    (data || []).forEach(f => {
      const raw = (f.form || '').trim();
      if (!raw) return;
      const persian = extractPersianForm(raw);
      if (persian) formsSet.add(persian);
    });

    const forms = [...formsSet].sort();

    if (!forms.length) {
      sel.innerHTML = '<option value="">— شکل جدید وارد کنید —</option>';
    } else {
      sel.innerHTML = '<option value="">-- انتخاب کنید --</option>' +
        forms.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');
    }
    sel.dataset.loaded = '1';
  } catch (e) {
    console.error('[NEW-DRUG] loadFormOptions error:', e);
    sel.innerHTML = '<option value="">— خطا — شکل جدید وارد کنید —</option>';
  }
}

// ⭐ استخراج بخش فارسی شکل دارویی
// «tablet__قرص» → «قرص»
// «قرص__tablet» → «قرص»
// «tablet» → '' (فارسی ندارد)
// «قرص» → «قرص»
// «tablet__قرص__extra» → «قرص»
function extractPersianForm(raw) {
  if (!raw) return '';
  // جدا کردن با جداکننده‌های رایج
  const parts = String(raw).split(/__|::|\||؛|;/).map(p => p.trim()).filter(Boolean);
  // پیدا کردن قطعه‌ای که حرف فارسی دارد
  for (const p of parts) {
    if (/[\u0600-\u06FF]/.test(p)) {
      return p;
    }
  }
  // اگر هیچ قطعه‌ی فارسی نبود، برگردان رشته اصلی را (اگر شامل حرف فارسی باشد)
  if (/[\u0600-\u06FF]/.test(raw)) return raw;
  return '';
}
