// js/modules/visit/index.js
import { showScreen } from '../../ui.js';
import { state } from './state.js';
import { renderList } from './list.js';

export function openVisits() {
  showScreen('Visit');
  state.view = 'list';
  renderList();
}
