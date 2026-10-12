// js/modules/visit/bodymap.js
import { INJURY_MAP } from './state.js';

// ═══════════════════════════════════════════════════════
// ادمک فرم ایجاد
// ═══════════════════════════════════════════════════════
export function renderBodyMap(selectedInjuries) {
  const sel = new Set(selectedInjuries.map(i => i.id));
  const cls = (key) => {
    const loc = INJURY_MAP[key];
    return loc && sel.has(loc.id) ? 'selected' : '';
  };
  const fill = (key) => sel.has((INJURY_MAP[key] || {}).id) ? '#ef5350' : '#fff9c4';

  return `
    <div class="body-map-container">
      <div class="body-map-wrap">
        <div class="body-map-title">روبرو</div>
        <div class="body-map">
          ${renderFrontSVG(cls, fill, 'part')}
        </div>
      </div>
      <div class="body-map-wrap">
        <div class="body-map-title">پشت</div>
        <div class="body-map">
          ${renderBackSVG(cls, fill, 'part')}
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
  const fill = (key) => sel.has((INJURY_MAP[key] || {}).id) ? '#ef5350' : '#fff9c4';
  const ptr = canIncident ? 'editable' : '';

  return `
    <div class="body-map-container" style="padding:6px;">
      <div class="body-map-wrap">
        <div class="body-map-title">روبرو</div>
        <div class="body-map">
          ${renderFrontSVG(cls, fill, 'edit-part', ptr)}
        </div>
      </div>
      <div class="body-map-wrap">
        <div class="body-map-title">پشت</div>
        <div class="body-map">
          ${renderBackSVG(cls, fill, 'edit-part', ptr)}
        </div>
      </div>
    </div>
    <div class="selected-parts-list" id="editInjuryChips" style="min-height:40px;margin-top:8px;">
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
function renderFrontSVG(cls, fill, attr, ptr = '') {
  const a = (key) => `data-${attr}="${key}" class="${ptr} ${cls(key)}"`;
  const aFill = (key) => `data-${attr}="${key}" class="${ptr} ${cls(key)}" style="fill:${fill(key)};"`;

  return `
    <svg viewBox="0 0 240 545" xmlns="http://www.w3.org/2000/svg">
      <ellipse ${a('head')} cx="120" cy="45" rx="32" ry="38"/>
      <ellipse ${a('face')} cx="120" cy="52" rx="24" ry="28" style="fill:transparent;stroke-dasharray:2,2;"/>
      <circle ${a('eye_left')} cx="132" cy="42" r="4"/>
      <circle ${a('eye_right')} cx="108" cy="42" r="4"/>
      <path ${a('nose')} d="M 120,45 L 116,55 L 124,55 Z"/>
      <ellipse ${a('lips')} cx="120" cy="65" rx="9" ry="4"/>
      <rect ${a('neck')} x="108" y="82" width="24" height="18" rx="4"/>
      <rect ${a('chest')} x="94" y="100" width="52" height="65" rx="8"/>
      <rect ${a('epigastrium')} x="94" y="165" width="52" height="35" rx="6"/>
      <rect ${a('hypogastrium')} x="94" y="200" width="52" height="30" rx="6"/>
      <rect ${a('flank_left')} x="146" y="165" width="12" height="65" rx="5"/>
      <rect ${a('flank_right')} x="82" y="165" width="12" height="65" rx="5"/>
      <rect ${a('groin')} x="106" y="230" width="28" height="15" rx="5"/>
      <rect ${a('shoulder_left')} x="144" y="100" width="46" height="25" rx="10"/>
      <rect ${a('shoulder_right')} x="50" y="100" width="46" height="25" rx="10"/>
      <rect ${a('upper_arm_left')} x="158" y="125" width="32" height="75" rx="12"/>
      <rect ${a('upper_arm_right')} x="50" y="125" width="32" height="75" rx="12"/>
      <rect ${aFill('armpit_left')} x="146" y="125" width="12" height="20" rx="3"/>
      <rect ${aFill('armpit_right')} x="82" y="125" width="12" height="20" rx="3"/>
      <rect ${aFill('inner_arm_left')} x="174" y="150" width="10" height="50" rx="3"/>
      <rect ${aFill('inner_arm_right')} x="56" y="150" width="10" height="50" rx="3"/>
      <rect ${a('elbow_left')} x="158" y="200" width="32" height="25" rx="8"/>
      <rect ${a('elbow_right')} x="50" y="200" width="32" height="25" rx="8"/>
      <rect ${aFill('ac_fossa_left')} x="170" y="205" width="12" height="15" rx="3"/>
      <rect ${aFill('ac_fossa_right')} x="58" y="205" width="12" height="15" rx="3"/>
      <rect ${a('forearm_left')} x="158" y="225" width="32" height="55" rx="8"/>
      <rect ${a('forearm_right')} x="50" y="225" width="32" height="55" rx="8"/>
      <rect ${a('wrist_left')} x="160" y="280" width="28" height="15" rx="5"/>
      <rect ${a('wrist_right')} x="52" y="280" width="28" height="15" rx="5"/>
      <rect ${a('palm_left')} x="158" y="295" width="32" height="32" rx="6"/>
      <rect ${a('palm_right')} x="50" y="295" width="32" height="32" rx="6"/>
      <rect ${a('thumb_left')} x="190" y="298" width="10" height="22" rx="5"/>
      <rect ${a('index_left')} x="182" y="327" width="6" height="28" rx="3"/>
      <rect ${a('middle_left')} x="174" y="327" width="6" height="32" rx="3"/>
      <rect ${a('ring_left')} x="166" y="327" width="6" height="28" rx="3"/>
      <rect ${a('pinky_left')} x="158" y="327" width="6" height="22" rx="3"/>
      <rect ${a('thumb_right')} x="40" y="298" width="10" height="22" rx="5"/>
      <rect ${a('index_right')} x="52" y="327" width="6" height="28" rx="3"/>
      <rect ${a('middle_right')} x="60" y="327" width="6" height="32" rx="3"/>
      <rect ${a('ring_right')} x="68" y="327" width="6" height="28" rx="3"/>
      <rect ${a('pinky_right')} x="76" y="327" width="6" height="22" rx="3"/>
      <rect ${a('hip_left')} x="120" y="245" width="32" height="25" rx="8"/>
      <rect ${a('hip_right')} x="88" y="245" width="32" height="25" rx="8"/>
      <rect ${a('thigh_left')} x="120" y="270" width="36" height="95" rx="12"/>
      <rect ${a('thigh_right')} x="84" y="270" width="36" height="95" rx="12"/>
      <rect ${aFill('inner_thigh_left')} x="146" y="280" width="10" height="80" rx="3"/>
      <rect ${aFill('inner_thigh_right')} x="84" y="280" width="10" height="80" rx="3"/>
      <rect ${a('knee_left')} x="122" y="365" width="32" height="28" rx="8"/>
      <rect ${a('knee_right')} x="86" y="365" width="32" height="28" rx="8"/>
      <rect ${aFill('patella_left')} x="126" y="368" width="24" height="20" rx="5"/>
      <rect ${aFill('patella_right')} x="90" y="368" width="24" height="20" rx="5"/>
      <rect ${a('shin_left')} x="124" y="393" width="28" height="80" rx="8"/>
      <rect ${a('shin_right')} x="88" y="393" width="28" height="80" rx="8"/>
      <rect ${a('ankle_left')} x="126" y="473" width="24" height="15" rx="5"/>
      <rect ${a('ankle_right')} x="90" y="473" width="24" height="15" rx="5"/>
      <rect ${a('sole_left')} x="118" y="488" width="40" height="28" rx="6"/>
      <rect ${a('sole_right')} x="82" y="488" width="40" height="28" rx="6"/>
      <rect ${a('big_toe_left')} x="150" y="516" width="8" height="18" rx="4"/>
      <rect ${a('toe2_left')} x="143" y="516" width="6" height="15" rx="3"/>
      <rect ${a('toe3_left')} x="136" y="516" width="6" height="14" rx="3"/>
      <rect ${a('toe4_left')} x="129" y="516" width="6" height="13" rx="3"/>
      <rect ${a('little_toe_left')} x="122" y="516" width="6" height="12" rx="3"/>
      <rect ${a('big_toe_right')} x="82" y="516" width="8" height="18" rx="4"/>
      <rect ${a('toe2_right')} x="91" y="516" width="6" height="15" rx="3"/>
      <rect ${a('toe3_right')} x="98" y="516" width="6" height="14" rx="3"/>
      <rect ${a('toe4_right')} x="105" y="516" width="6" height="13" rx="3"/>
      <rect ${a('little_toe_right')} x="112" y="516" width="6" height="12" rx="3"/>
    </svg>
  `;
}

// ═══════════════════════════════════════════════════════
// SVG نمای پشت
// ═══════════════════════════════════════════════════════
function renderBackSVG(cls, fill, attr, ptr = '') {
  const a = (key) => `data-${attr}="${key}" class="${ptr} ${cls(key)}"`;
  const aFill = (key) => `data-${attr}="${key}" class="${ptr} ${cls(key)}" style="fill:${fill(key)};"`;

  return `
    <svg viewBox="0 0 240 545" xmlns="http://www.w3.org/2000/svg">
      <ellipse ${a('occiput')} cx="120" cy="45" rx="32" ry="38"/>
      <ellipse ${a('ear_left')} cx="88" cy="50" rx="5" ry="9"/>
      <ellipse ${a('ear_right')} cx="152" cy="50" rx="5" ry="9"/>
      <rect ${a('neck_back')} x="108" y="82" width="24" height="18" rx="4"/>
      <rect ${a('shoulder_left_back')} x="50" y="100" width="46" height="25" rx="10"/>
      <rect ${a('shoulder_right_back')} x="144" y="100" width="46" height="25" rx="10"/>
      <rect ${a('upper_back')} x="94" y="100" width="52" height="45" rx="8"/>
      <rect ${a('mid_back')} x="94" y="145" width="52" height="45" rx="6"/>
      <rect ${a('lower_back')} x="94" y="190" width="52" height="35" rx="6"/>
      <rect ${a('sacrum')} x="104" y="225" width="32" height="30" rx="6" style="fill:transparent;stroke-dasharray:2,2;"/>
      <rect ${a('upper_arm_left_back')} x="50" y="125" width="32" height="75" rx="12"/>
      <rect ${a('upper_arm_right_back')} x="158" y="125" width="32" height="75" rx="12"/>
      <rect ${a('elbow_left_back')} x="50" y="200" width="32" height="25" rx="8"/>
      <rect ${a('elbow_right_back')} x="158" y="200" width="32" height="25" rx="8"/>
      <rect ${a('forearm_left_back')} x="50" y="225" width="32" height="55" rx="8"/>
      <rect ${a('forearm_right_back')} x="158" y="225" width="32" height="55" rx="8"/>
      <rect ${a('glute_left')} x="88" y="255" width="32" height="38" rx="10"/>
      <rect ${a('glute_right')} x="120" y="255" width="32" height="38" rx="10"/>
      <rect ${a('thigh_left_back')} x="84" y="293" width="36" height="75" rx="12"/>
      <rect ${a('thigh_right_back')} x="120" y="293" width="36" height="75" rx="12"/>
      <rect ${a('knee_left_back')} x="86" y="368" width="32" height="25" rx="8"/>
      <rect ${a('knee_right_back')} x="122" y="368" width="32" height="25" rx="8"/>
      <rect ${aFill('popliteal_left')} x="90" y="370" width="24" height="20" rx="5"/>
      <rect ${aFill('popliteal_right')} x="126" y="370" width="24" height="20" rx="5"/>
      <rect ${a('calf_left')} x="88" y="393" width="28" height="75" rx="8"/>
      <rect ${a('calf_right')} x="124" y="393" width="28" height="75" rx="8"/>
      <rect ${a('achilles_left')} x="92" y="468" width="20" height="15" rx="5"/>
      <rect ${a('achilles_right')} x="128" y="468" width="20" height="15" rx="5"/>
      <rect ${a('heel_left')} x="82" y="485" width="36" height="30" rx="6"/>
      <rect ${a('heel_right')} x="122" y="485" width="36" height="30" rx="6"/>
    </svg>
  `;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
