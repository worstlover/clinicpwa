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
// ═══════════════════════════════════════════════════════
function renderFrontSVG(cls, attr, ptr = '') {
  const a = (key) => `data-${attr}="${key}" class="body-part ${ptr} ${cls(key)}"`;

  return `
    <svg viewBox="0 0 300 730" xmlns="http://www.w3.org/2000/svg" class="body-svg">

      <!-- ═══ سر ═══ -->
      <ellipse ${a('head')} cx="150" cy="58" rx="42" ry="50"/>

      <!-- صورت (روی سر) -->
      <ellipse ${a('face')} cx="150" cy="62" rx="32" ry="38" style="fill:transparent;stroke-dasharray:3,3;stroke-opacity:0.4;"/>

      <!-- چشم چپ (سمت راست تصویر) -->
      <circle ${a('eye_left')} cx="166" cy="52" r="5"/>
      <!-- چشم راست (سمت چپ تصویر) -->
      <circle ${a('eye_right')} cx="134" cy="52" r="5"/>

      <!-- بینی -->
      <path ${a('nose')} d="M 150 56 L 145 72 L 155 72 Z"/>

      <!-- لب -->
      <ellipse ${a('lips')} cx="150" cy="84" rx="10" ry="5"/>

      <!-- ═══ گردن ═══ -->
      <rect ${a('neck')} x="136" y="102" width="28" height="26" rx="6"/>

      <!-- ═══ شانه‌ها ═══ -->
      <rect ${a('shoulder_left')} x="92" y="124" width="60" height="30" rx="14"/>
      <rect ${a('shoulder_right')} x="148" y="124" width="60" height="30" rx="14"/>

      <!-- ═══ قفسه سینه ═══ -->
      <rect ${a('chest')} x="106" y="124" width="88" height="100" rx="14"/>

      <!-- ═══ بازوها (کنار بدن) ═══ -->
      <rect ${a('upper_arm_left')} x="70" y="150" width="32" height="108" rx="14"/>
      <rect ${a('upper_arm_right')} x="198" y="150" width="32" height="108" rx="14"/>

      <!-- زیر بغل -->
      <rect ${a('armpit_left')} x="98" y="150" width="10" height="28" rx="3"/>
      <rect ${a('armpit_right')} x="192" y="150" width="10" height="28" rx="3"/>

      <!-- داخل بازو -->
      <rect ${a('inner_arm_left')} x="94" y="178" width="10" height="72" rx="3"/>
      <rect ${a('inner_arm_right')} x="196" y="178" width="10" height="72" rx="3"/>

      <!-- ═══ آرنج ═══ -->
      <rect ${a('elbow_left')} x="70" y="258" width="32" height="30" rx="10"/>
      <rect ${a('elbow_right')} x="198" y="258" width="32" height="30" rx="10"/>

      <!-- حفره آرنج -->
      <rect ${a('ac_fossa_left')} x="94" y="264" width="10" height="18" rx="3"/>
      <rect ${a('ac_fossa_right')} x="196" y="264" width="10" height="18" rx="3"/>

      <!-- ═══ ساعد ═══ -->
      <rect ${a('forearm_left')} x="71" y="288" width="30" height="78" rx="10"/>
      <rect ${a('forearm_right')} x="199" y="288" width="30" height="78" rx="10"/>

      <!-- ═══ مچ دست ═══ -->
      <rect ${a('wrist_left')} x="73" y="366" width="26" height="18" rx="6"/>
      <rect ${a('wrist_right')} x="201" y="366" width="26" height="18" rx="6"/>

      <!-- ═══ کف دست ═══ -->
      <rect ${a('palm_left')} x="70" y="384" width="32" height="44" rx="8"/>
      <rect ${a('palm_right')} x="198" y="384" width="32" height="44" rx="8"/>

      <!-- ═══ انگشتان دست چپ (سمت راست تصویر) ═══ -->
      <rect ${a('thumb_left')} x="102" y="388" width="11" height="32" rx="5"/>
      <rect ${a('index_left')} x="94" y="428" width="7" height="38" rx="3.5"/>
      <rect ${a('middle_left')} x="86" y="428" width="7" height="42" rx="3.5"/>
      <rect ${a('ring_left')} x="78" y="428" width="7" height="38" rx="3.5"/>
      <rect ${a('pinky_left')} x="70" y="428" width="7" height="32" rx="3.5"/>

      <!-- ═══ انگشتان دست راست (سمت چپ تصویر) ═══ -->
      <rect ${a('thumb_right')} x="187" y="388" width="11" height="32" rx="5"/>
      <rect ${a('index_right')} x="199" y="428" width="7" height="38" rx="3.5"/>
      <rect ${a('middle_right')} x="207" y="428" width="7" height="42" rx="3.5"/>
      <rect ${a('ring_right')} x="215" y="428" width="7" height="38" rx="3.5"/>
      <rect ${a('pinky_right')} x="223" y="428" width="7" height="32" rx="3.5"/>

      <!-- ═══ شکم بالا ═══ -->
      <rect ${a('epigastrium')} x="106" y="224" width="88" height="48" rx="10"/>

      <!-- ═══ شکم پایین ═══ -->
      <rect ${a('hypogastrium')} x="106" y="272" width="88" height="46" rx="10"/>

      <!-- پهلوها -->
      <rect ${a('flank_left')} x="194" y="224" width="12" height="94" rx="6"/>
      <rect ${a('flank_right')} x="94" y="224" width="12" height="94" rx="6"/>

      <!-- ═══ کشاله ران ═══ -->
      <rect ${a('groin')} x="132" y="318" width="36" height="20" rx="6"/>

      <!-- ═══ لگن ═══ -->
      <rect ${a('hip_left')} x="150" y="338" width="44" height="34" rx="12"/>
      <rect ${a('hip_right')} x="106" y="338" width="44" height="34" rx="12"/>

      <!-- ═══ ران ═══ -->
      <rect ${a('thigh_left')} x="152" y="372" width="46" height="135" rx="16"/>
      <rect ${a('thigh_right')} x="102" y="372" width="46" height="135" rx="16"/>

      <!-- داخل ران -->
      <rect ${a('inner_thigh_left')} x="152" y="388" width="12" height="105" rx="3"/>
      <rect ${a('inner_thigh_right')} x="136" y="388" width="12" height="105" rx="3"/>

      <!-- ═══ زانو ═══ -->
      <rect ${a('knee_left')} x="154" y="507" width="42" height="38" rx="12"/>
      <rect ${a('knee_right')} x="104" y="507" width="42" height="38" rx="12"/>

      <!-- کاسه زانو -->
      <rect ${a('patella_left')} x="160" y="513" width="30" height="26" rx="7"/>
      <rect ${a('patella_right')} x="110" y="513" width="30" height="26" rx="7"/>

      <!-- ═══ ساق ═══ -->
      <rect ${a('shin_left')} x="158" y="545" width="34" height="112" rx="12"/>
      <rect ${a('shin_right')} x="108" y="545" width="34" height="112" rx="12"/>

      <!-- ═══ مچ پا ═══ -->
      <rect ${a('ankle_left')} x="160" y="657" width="30" height="20" rx="6"/>
      <rect ${a('ankle_right')} x="110" y="657" width="30" height="20" rx="6"/>

      <!-- ═══ کف پا ═══ -->
      <rect ${a('sole_left')} x="152" y="677" width="46" height="42" rx="10"/>
      <rect ${a('sole_right')} x="102" y="677" width="46" height="42" rx="10"/>

      <!-- ═══ انگشتان پای چپ ═══ -->
      <rect ${a('big_toe_left')} x="188" y="719" width="10" height="22" rx="5"/>
      <rect ${a('toe2_left')} x="180" y="719" width="7" height="20" rx="3.5"/>
      <rect ${a('toe3_left')} x="172" y="719" width="7" height="18" rx="3.5"/>
      <rect ${a('toe4_left')} x="164" y="719" width="7" height="16" rx="3.5"/>
      <rect ${a('little_toe_left')} x="156" y="719" width="7" height="14" rx="3.5"/>

      <!-- ═══ انگشتان پای راست ═══ -->
      <rect ${a('big_toe_right')} x="102" y="719" width="10" height="22" rx="5"/>
      <rect ${a('toe2_right')} x="113" y="719" width="7" height="20" rx="3.5"/>
      <rect ${a('toe3_right')} x="121" y="719" width="7" height="18" rx="3.5"/>
      <rect ${a('toe4_right')} x="129" y="719" width="7" height="16" rx="3.5"/>
      <rect ${a('little_toe_right')} x="137" y="719" width="7" height="14" rx="3.5"/>
    </svg>
  `;
}

// ═══════════════════════════════════════════════════════
// SVG نمای پشت
// ═══════════════════════════════════════════════════════
function renderBackSVG(cls, attr, ptr = '') {
  const a = (key) => `data-${attr}="${key}" class="body-part ${ptr} ${cls(key)}"`;

  return `
    <svg viewBox="0 0 300 730" xmlns="http://www.w3.org/2000/svg" class="body-svg">

      <!-- ═══ پشت سر ═══ -->
      <ellipse ${a('occiput')} cx="150" cy="58" rx="42" ry="50"/>

      <!-- گوش‌ها -->
      <ellipse ${a('ear_left')} cx="108" cy="62" rx="7" ry="14"/>
      <ellipse ${a('ear_right')} cx="192" cy="62" rx="7" ry="14"/>

      <!-- ═══ گردن پشت ═══ -->
      <rect ${a('neck_back')} x="136" y="102" width="28" height="26" rx="6"/>

      <!-- ═══ سرشانه‌ها ═══ -->
      <rect ${a('shoulder_left_back')} x="92" y="124" width="60" height="30" rx="14"/>
      <rect ${a('shoulder_right_back')} x="148" y="124" width="60" height="30" rx="14"/>

      <!-- ═══ پشت ═══ -->
      <rect ${a('upper_back')} x="106" y="124" width="88" height="55" rx="10"/>
      <rect ${a('mid_back')} x="106" y="179" width="88" height="50" rx="8"/>
      <rect ${a('lower_back')} x="106" y="229" width="88" height="45" rx="8"/>

      <!-- ساکروم -->
      <rect ${a('sacrum')} x="130" y="274" width="40" height="38" rx="8" style="fill:transparent;stroke-dasharray:3,3;stroke-opacity:0.4;"/>

      <!-- ═══ بازوهای پشت ═══ -->
      <rect ${a('upper_arm_left_back')} x="70" y="150" width="32" height="108" rx="14"/>
      <rect ${a('upper_arm_right_back')} x="198" y="150" width="32" height="108" rx="14"/>

      <!-- ═══ آرنج پشت ═══ -->
      <rect ${a('elbow_left_back')} x="70" y="258" width="32" height="30" rx="10"/>
      <rect ${a('elbow_right_back')} x="198" y="258" width="32" height="30" rx="10"/>

      <!-- ═══ ساعد پشت ═══ -->
      <rect ${a('forearm_left_back')} x="71" y="288" width="30" height="78" rx="10"/>
      <rect ${a('forearm_right_back')} x="199" y="288" width="30" height="78" rx="10"/>

      <!-- ═══ باسن ═══ -->
      <rect ${a('glute_left')} x="150" y="318" width="46" height="46" rx="14"/>
      <rect ${a('glute_right')} x="104" y="318" width="46" height="46" rx="14"/>

      <!-- ═══ ران پشت ═══ -->
      <rect ${a('thigh_left_back')} x="152" y="364" width="46" height="138" rx="16"/>
      <rect ${a('thigh_right_back')} x="102" y="364" width="46" height="138" rx="16"/>

      <!-- ═══ زانو پشت ═══ -->
      <rect ${a('knee_left_back')} x="154" y="502" width="42" height="38" rx="12"/>
      <rect ${a('knee_right_back')} x="104" y="502" width="42" height="38" rx="12"/>

      <!-- حفره پشت زانو -->
      <rect ${a('popliteal_left')} x="160" y="508" width="30" height="26" rx="7"/>
      <rect ${a('popliteal_right')} x="110" y="508" width="30" height="26" rx="7"/>

      <!-- ═══ ساق پشت ═══ -->
      <rect ${a('calf_left')} x="158" y="540" width="34" height="112" rx="12"/>
      <rect ${a('calf_right')} x="108" y="540" width="34" height="112" rx="12"/>

      <!-- ═══ آشیل ═══ -->
      <rect ${a('achilles_left')} x="162" y="652" width="26" height="20" rx="6"/>
      <rect ${a('achilles_right')} x="112" y="652" width="26" height="20" rx="6"/>

      <!-- ═══ پاشنه ═══ -->
      <rect ${a('heel_left')} x="152" y="672" width="46" height="46" rx="10"/>
      <rect ${a('heel_right')} x="102" y="672" width="46" height="46" rx="10"/>
    </svg>
  `;
}
