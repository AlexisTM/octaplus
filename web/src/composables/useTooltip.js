import { reactive } from 'vue';

const state = reactive({ visible: false, x: 0, y: 0, title: '', rows: [] });

function show(evt, { title = '', rows = [] }) {
  state.title = title;
  state.rows = rows;
  state.x = evt.clientX;
  state.y = evt.clientY;
  state.visible = true;
}

function hide() {
  state.visible = false;
}

export function useTooltip() {
  return { tooltip: state, show, hide };
}
