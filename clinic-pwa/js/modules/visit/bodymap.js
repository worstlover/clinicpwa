// js/modules/visit/bodymap.js
import { INJURY_MAP } from './state.js';
import { escapeHtml } from '../../utils.js';

// ═══════════════════════════════════════════════════════
// ادمک فرم ایجاد
// ═══════════════════════════════════════════════════════
export function renderBodyMap(selectedInjuries) {
  const sel = new Set(selectedInjuries.map(i => i.id));
  const cls = (key) => {
    const loc = INJURY_MAP[key];
    return loc && sel.has(loc.id) ? 'selected' : '';
  };

  return `
    <div class="body-map-container">
      <div class="body-map-wrap">
        <div class="body-map-title">نمای روبرو</div>
        <div class="body-map">
          ${renderFrontSVG(cls, 'part')}
        </div>
      </div>
      <div class="body-map-wrap">
        <div class="body-map-title">نمای پشت</div>
        <div class="body-map">
          ${renderBackSVG(cls, 'part')}
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
// ادمک فرم ویرایش
// ═══════════════════════════════════════════════════════
export function renderEditBodyMap(editInjuries, canIncident) {
  const sel = new Set(editInjuries.map(i => i.id));
  const cls = (key) => {
    const loc = INJURY_MAP[key];
    return loc && sel.has(loc.id) ? 'selected' : '';
  };
  const ptr = canIncident ? 'editable' : '';

  return `
    <div class="body-map-container">
      <div class="body-map-wrap">
        <div class="body-map-title">نمای روبرو</div>
        <div class="body-map">
          ${renderFrontSVG(cls, 'edit-part', ptr)}
        </div>
      </div>
      <div class="body-map-wrap">
        <div class="body-map-title">نمای پشت</div>
        <div class="body-map">
          ${renderBackSVG(cls, 'edit-part', ptr)}
        </div>
      </div>
    </div>
    <div class="selected-parts-list" id="editInjuryChips" style="min-height:44px;margin-top:10px;">
      ${editInjuries.length
        ? editInjuries.map(i => `
            <span class="part-tag">${escapeHtml(i.name)}${canIncident ? `<span class="remove-part-edit" data-id="${i.id}">✕</span>` : ''}</span>
          `).join('')
        : '<span class="muted small">هیچ ناحیه‌ای انتخاب نشده</span>'}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════
// SVG نمای روبرو
// 🎯 اصلاحات:
//   ✅ دست‌ها از بدن فاصله گرفتند (gap ≈ 16px)
//   ✅ انگشت شصت به هر دو دست اضافه شد
//   ✅ نواحی inner_arm و inner_thigh حذف شدند
//   ✅ کشاله ران به جای درست منتقل شد (پایین‌تر، بین لگن و ران)
//   ✅ چپ/راست اصلاح شد: در نمای روبرو، سمت چپ تصویر = راست بیمار
//      (data-part="arm_right" روی سمت چپ تصویر قرار می‌گیرد)
// ═══════════════════════════════════════════════════════
function renderFrontSVG(cls, attr, ptr = '') {
  const a = (key) => `data-${attr}="${key}" class="body-part ${ptr} ${cls(key)}"`;

  return `
    <svg viewBox="0 0 320 760" xmlns="http://www.w3.org/2000/svg" class="body-svg">

      <!-- ═══ سر ═══ -->
      <ellipse ${a('head')} cx="160" cy="58" rx="44" ry="52"/>

      <!-- چشم راست بیمار (سمت چپ تصویر) -->
      <circle ${a('eye_right')} cx="142" cy="52" r="5"/>
      <!-- چشم چپ بیمار (سمت راست تصویر) -->
      <circle ${a('eye_left')} cx="178" cy="52" r="5"/>

      <!-- بینی -->
      <path ${a('nose')} d="M 160 56 L 154 74 L 166 74 Z"/>

      <!-- لب -->
      <ellipse ${a('lips')} cx="160" cy="86" rx="11" ry="5"/>

      <!-- ═══ گردن ═══ -->
      <rect ${a('neck')} x="146" y="104" width="28" height="26" rx="6"/>

      <!-- ═══ شانه‌ها ═══ -->
      <!-- شانه راست بیمار (سمت چپ تصویر) -->
      <rect ${a('shoulder_right')} x="90" y="126" width="62" height="30" rx="14"/>
      <!-- شانه چپ بیمار (سمت راست تصویر) -->
      <rect ${a('shoulder_left')} x="168" y="126" width="62" height="30" rx="14"/>

      <!-- ═══ قفسه سینه ═══ -->
      <rect ${a('chest')} x="116" y="126" width="88" height="100" rx="14"/>

      <!-- ═══ بازوها - با فاصله از بدن ═══ -->
      <!-- بازوی راست بیمار (سمت چپ تصویر) -->
      <rect ${a('upper_arm_right')} x="56" y="150" width="34" height="110" rx="14"/>
      <!-- بازوی چپ بیمار (سمت راست تصویر) -->
      <rect ${a('upper_arm_left')} x="230" y="150" width="34" height="110" rx="14"/>

      <!-- زیر بغل -->
      <rect ${a('armpit_right')} x="90" y="152" width="12" height="28" rx="3"/>
      <rect ${a('armpit_left')} x="218" y="152" width="12" height="28" rx="3"/>

      <!-- ═══ آرنج ═══ -->
      <rect ${a('elbow_right')} x="56" y="260" width="34" height="30" rx="10"/>
      <rect ${a('elbow_left')} x="230" y="260" width="34" height="30" rx="10"/>

      <!-- حفره آرنج -->
      <rect ${a('ac_fossa_right')} x="82" y="266" width="10" height="18" rx="3"/>
      <rect ${a('ac_fossa_left')} x="228" y="266" width="10" height="18" rx="3"/>

      <!-- ═══ ساعد ═══ -->
      <rect ${a('forearm_right')} x="57" y="290" width="32" height="78" rx="10"/>
      <rect ${a('forearm_left')} x="231" y="290" width="32" height="78" rx="10"/>

      <!-- ═══ مچ دست ═══ -->
      <rect ${a('wrist_right')} x="59" y="368" width="28" height="18" rx="6"/>
      <rect ${a('wrist_left')} x="233" y="368" width="28" height="18" rx="6"/>

      <!-- ═══ کف دست ═══ -->
      <rect ${a('palm_right')} x="54" y="386" width="38" height="46" rx="8"/>
      <rect ${a('palm_left')} x="228" y="386" width="38" height="46" rx="8"/>

      <!-- ═══ انگشت شصت - به صورت جدا و واضح ═══ -->
      <!-- شصت دست راست بیمار (سمت چپ تصویر، کنار داخلی کف دست) -->
      <rect ${a('thumb_right')} x="88" y="392" width="14" height="34" rx="7"/>
      <!-- شصت دست چپ بیمار (سمت راست تصویر، کنار داخلی کف دست) -->
      <rect ${a('thumb_left')} x="218" y="392" width="14" height="34" rx="7"/>

      <!-- ═══ انگشتان دست راست (سمت چپ تصویر) ═══ -->
      <rect ${a('index_right')} x="82" y="432" width="8" height="40" rx="4"/>
      <rect ${a('middle_right')} x="72" y="432" width="8" height="44" rx="4"/>
      <rect ${a('ring_right')} x="62" y="432" width="8" height="40" rx="4"/>
      <rect ${a('pinky_right')} x="52" y="432" width="8" height="34" rx="4"/>

      <!-- ═══ انگشتان دست چپ (سمت راست تصویر) ═══ -->
      <rect ${a('index_left')} x="230" y="432" width="8" height="40" rx="4"/>
      <rect ${a('middle_left')} x="240" y="432" width="8" height="44" rx="4"/>
      <rect ${a('ring_left')} x="250" y="432" width="8" height="40" rx="4"/>
      <rect ${a('pinky_left')} x="260" y="432" width="8" height="34" rx="4"/>

      <!-- ═══ شکم بالا ═══ -->
      <rect ${a('epigastrium')} x="116" y="226" width="88" height="48" rx="10"/>

      <!-- ═══ شکم پایین ═══ -->
      <rect ${a('hypogastrium')} x="116" y="274" width="88" height="46" rx="10"/>

      <!-- پهلوها -->
      <!-- پهلوی چپ بیمار (سمت راست تصویر) -->
      <rect ${a('flank_left')} x="204" y="226" width="12" height="94" rx="6"/>
      <!-- پهلوی راست بیمار (سمت چپ تصویر) -->
      <rect ${a('flank_right')} x="104" y="226" width="12" height="94" rx="6"/>

      <!-- ═══ لگن ═══ -->
      <rect ${a('hip_left')} x="160" y="338" width="44" height="34" rx="12"/>
      <rect ${a('hip_right')} x="116" y="338" width="44" height="34" rx="12"/>

      <!-- ═══ کشاله ران - اصلاح‌شده: بین لگن و ران، نزدیک خط وسط ═══ -->
      <rect ${a('groin_left')} x="164" y="352" width="18" height="24" rx="6"/>
      <rect ${a('groin_right')} x="138" y="352" width="18" height="24" rx="6"/>

      <!-- ═══ ران ═══ -->
      <rect ${a('thigh_left')} x="162" y="376" width="46" height="135" rx="16"/>
      <rect ${a('thigh_right')} x="112" y="376" width="46" height="135" rx="16"/>

      <!-- ═══ زانو ═══ -->
      <rect ${a('knee_left')} x="164" y="511" width="42" height="38" rx="12"/>
      <rect ${a('knee_right')} x="114" y="511" width="42" height="38" rx="12"/>

      <!-- کاسه زانو -->
      <rect ${a('patella_left')} x="170" y="517" width="30" height="26" rx="7"/>
      <rect ${a('patella_right')} x="120" y="517" width="30" height="26" rx="7"/>

      <!-- ═══ ساق ═══ -->
      <rect ${a('shin_left')} x="168" y="549" width="34" height="112" rx="12"/>
      <rect ${a('shin_right')} x="118" y="549" width="34" height="112" rx="12"/>

      <!-- ═══ مچ پا ═══ -->
      <rect ${a('ankle_left')} x="170" y="661" width="30" height="20" rx="6"/>
      <rect ${a('ankle_right')} x="120" y="661" width="30" height="20" rx="6"/>

      <!-- ═══ کف پا ═══ -->
      <rect ${a('sole_left')} x="162" y="681" width="46" height="42" rx="10"/>
      <rect ${a('sole_right')} x="112" y="681" width="46" height="42" rx="10"/>

      <!-- ═══ انگشتان پای چپ (سمت راست تصویر) ═══ -->
      <rect ${a('big_toe_left')} x="198" y="723" width="10" height="22" rx="5"/>
      <rect ${a('toe2_left')} x="190" y="723" width="7" height="20" rx="3.5"/>
      <rect ${a('toe3_left')} x="182" y="723" width="7" height="18" rx="3.5"/>
      <rect ${a('toe4_left')} x="174" y="723" width="7" height="16" rx="3.5"/>
      <rect ${a('little_toe_left')} x="166" y="723" width="7" height="14" rx="3.5"/>

      <!-- ═══ انگشتان پای راست (سمت چپ تصویر) ═══ -->
      <rect ${a('big_toe_right')} x="112" y="723" width="10" height="22" rx="5"/>
      <rect ${a('toe2_right')} x="123" y="723" width="7" height="20" rx="3.5"/>
      <rect ${a('toe3_right')} x="131" y="723" width="7" height="18" rx="3.5"/>
      <rect ${a('toe4_right')} x="139" y="723" width="7" height="16" rx="3.5"/>
      <rect ${a('little_toe_right')} x="147" y="723" width="7" height="14" rx="3.5"/>
    </svg>
  `;
}

// ═══════════════════════════════════════════════════════
// SVG نمای پشت
// 🎯 در نمای پشت، سمت چپ تصویر = چپ بیمار (مستقیم)
// ═══════════════════════════════════════════════════════
function renderBackSVG(cls, attr, ptr = '') {
  const a = (key) => `data-${attr}="${key}" class="body-part ${ptr} ${cls(key)}"`;

  return `
    <svg viewBox="0 0 320 760" xmlns="http://www.w3.org/2000/svg" class="body-svg">

      <!-- ═══ پشت سر ═══ -->
      <ellipse ${a('occiput')} cx="160" cy="58" rx="44" ry="52"/>

      <!-- گوش‌ها -->
      <ellipse ${a('ear_left')} cx="118" cy="62" rx="7" ry="14"/>
      <ellipse ${a('ear_right')} cx="202" cy="62" rx="7" ry="14"/>

      <!-- ═══ گردن پشت ═══ -->
      <rect ${a('neck_back')} x="146" y="104" width="28" height="26" rx="6"/>

      <!-- ═══ سرشانه‌ها ═══ -->
      <rect ${a('shoulder_left_back')} x="90" y="126" width="62" height="30" rx="14"/>
      <rect ${a('shoulder_right_back')} x="168" y="126" width="62" height="30" rx="14"/>

      <!-- ═══ پشت ═══ -->
      <rect ${a('upper_back')} x="116" y="126" width="88" height="55" rx="10"/>
      <rect ${a('mid_back')} x="116" y="181" width="88" height="50" rx="8"/>
      <rect ${a('lower_back')} x="116" y="231" width="88" height="45" rx="8"/>

      <!-- ساکروم -->
      <rect ${a('sacrum')} x="140" y="276" width="40" height="38" rx="8" style="fill:transparent;stroke-dasharray:3,3;stroke-opacity:0.4;"/>

      <!-- ═══ بازوهای پشت - با فاصله ═══ -->
      <rect ${a('upper_arm_left_back')} x="56" y="150" width="34" height="110" rx="14"/>
      <rect ${a('upper_arm_right_back')} x="230" y="150" width="34" height="110" rx="14"/>

      <!-- ═══ آرنج پشت ═══ -->
      <rect ${a('elbow_left_back')} x="56" y="260" width="34" height="30" rx="10"/>
      <rect ${a('elbow_right_back')} x="230" y="260" width="34" height="30" rx="10"/>

      <!-- ═══ ساعد پشت ═══ -->
      <rect ${a('forearm_left_back')} x="57" y="290" width="32" height="78" rx="10"/>
      <rect ${a('forearm_right_back')} x="231" y="290" width="32" height="78" rx="10"/>

      <!-- ═══ باسن ═══ -->
      <rect ${a('glute_left')} x="160" y="318" width="46" height="46" rx="14"/>
      <rect ${a('glute_right')} x="114" y="318" width="46" height="46" rx="14"/>

      <!-- ═══ ران پشت ═══ -->
      <rect ${a('thigh_left_back')} x="162" y="364" width="46" height="138" rx="16"/>
      <rect ${a('thigh_right_back')} x="112" y="364" width="46" height="138" rx="16"/>

      <!-- ═══ زانو پشت ═══ -->
      <rect ${a('knee_left_back')} x="164" y="502" width="42" height="38" rx="12"/>
      <rect ${a('knee_right_back')} x="114" y="502" width="42" height="38" rx="12"/>

      <!-- حفره پشت زانو -->
      <rect ${a('popliteal_left')} x="170" y="508" width="30" height="26" rx="7"/>
      <rect ${a('popliteal_right')} x="120" y="508" width="30" height="26" rx="7"/>

      <!-- ═══ ساق پشت ═══ -->
      <rect ${a('calf_left')} x="168" y="540" width="34" height="112" rx="12"/>
      <rect ${a('calf_right')} x="118" y="540" width="34" height="112" rx="12"/>

      <!-- ═══ آشیل ═══ -->
      <rect ${a('achilles_left')} x="172" y="652" width="26" height="20" rx="6"/>
      <rect ${a('achilles_right')} x="122" y="652" width="26" height="20" rx="6"/>

      <!-- ═══ پاشنه ═══ -->
      <rect ${a('heel_left')} x="162" y="672" width="46" height="46" rx="10"/>
      <rect ${a('heel_right')} x="112" y="672" width="46" height="46" rx="10"/>
    </svg>
  `;
}
