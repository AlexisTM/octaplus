<script setup>
import * as d3 from 'd3';
import { computed, onMounted, ref, watch } from 'vue';
import { fmtNum, slotHour } from '../lib/analysis.js';
import { makePriceColor } from '../lib/colors.js';
import { useControls } from '../composables/useControls.js';
import { useElementSize } from '../composables/useElementSize.js';
import { useSelection } from '../composables/useSelection.js';
import { useTooltip } from '../composables/useTooltip.js';
import NoData from './NoData.vue';
import PanelFrame from './PanelFrame.vue';

const { colorMode, unit } = useControls();
const { selectedDays, conv, unitText } = useSelection();
const { show, hide } = useTooltip();

const wrap = ref(null);
const { width } = useElementSize(wrap);
const canvas = ref(null);
const legendCanvas = ref(null);

const H = 300;
const M = { top: 4, right: 10, bottom: 20, left: 38 };

const allPrices = computed(() => {
  const out = [];
  for (const d of selectedDays.value) for (const p of d.prices) out.push(p.price);
  return out;
});

const colorFn = computed(() => makePriceColor(allPrices.value, colorMode.value));

const plotW = computed(() => Math.max(10, width.value - M.left - M.right));
const plotH = H - M.top - M.bottom;

function draw() {
  const el = canvas.value;
  if (!el || !width.value) return;
  const dpr = window.devicePixelRatio || 1;
  el.width = Math.round(width.value * dpr);
  el.height = Math.round(H * dpr);
  el.style.width = `${width.value}px`;
  el.style.height = `${H}px`;
  const ctx = el.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width.value, H);

  const days = selectedDays.value;
  if (!days.length) return;
  const color = colorFn.value;
  const cellW = plotW.value / days.length;

  ctx.save();
  ctx.translate(M.left, M.top);
  for (let j = 0; j < days.length; j++) {
    const d = days[j];
    const n = d.prices.length;
    const x0 = j * cellW;
    for (let i = 0; i < n; i++) {
      const y0 = (slotHour(i, n) / 24) * plotH;
      const y1 = (slotHour(i + 1, n) / 24) * plotH;
      ctx.fillStyle = color(d.prices[i].price);
      ctx.fillRect(x0, y0, cellW + 0.5, y1 - y0 + 0.5);
    }
  }
  ctx.restore();

  // axes drawn into the same canvas, instrument-style
  ctx.font = '9px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#5d6672';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const h of [0, 6, 12, 18, 24]) {
    const y = M.top + (h / 24) * plotH;
    ctx.fillText(String(h).padStart(2, '0'), M.left - 6, y);
    ctx.strokeStyle = '#262b33';
    ctx.beginPath();
    ctx.moveTo(M.left - 3, y);
    ctx.lineTo(M.left, y);
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const tickCount = Math.max(2, Math.floor(plotW.value / 110));
  for (let k = 0; k < tickCount; k++) {
    const j = Math.min(days.length - 1, Math.round((k / Math.max(1, tickCount - 1)) * (days.length - 1)));
    const x = M.left + (j + 0.5) * cellW;
    ctx.fillText(days[j].validityDate, x, M.top + plotH + 6);
  }
}

function drawLegend() {
  const el = legendCanvas.value;
  if (!el) return;
  const w = 140;
  const h = 8;
  const dpr = window.devicePixelRatio || 1;
  el.width = w * dpr;
  el.height = h * dpr;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  const ctx = el.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const prices = allPrices.value;
  if (!prices.length) return;
  let min = Infinity;
  let max = -Infinity;
  for (const p of prices) {
    if (p < min) min = p;
    if (p > max) max = p;
  }
  const color = colorFn.value;
  for (let i = 0; i < w; i++) {
    ctx.fillStyle = color(min + ((max - min) * i) / (w - 1));
    ctx.fillRect(i, 0, 1, h);
  }
}

const legendRange = computed(() => {
  const prices = allPrices.value;
  if (!prices.length) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const p of prices) {
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return { min: fmtNum(conv(min), 0), max: fmtNum(conv(max), 0) };
});

onMounted(() => {
  watch([selectedDays, colorFn, width], () => {
    draw();
    drawLegend();
  }, { immediate: true, flush: 'post' });
});

// crosshair overlay (CSS lines, no canvas redraw) + tooltip via inverted scales
const cross = ref(null);
function onMove(evt) {
  const days = selectedDays.value;
  if (!days.length) return;
  const rect = canvas.value.getBoundingClientRect();
  const mx = evt.clientX - rect.left - M.left;
  const my = evt.clientY - rect.top - M.top;
  if (mx < 0 || my < 0 || mx >= plotW.value || my >= plotH) {
    cross.value = null;
    hide();
    return;
  }
  const j = Math.min(days.length - 1, Math.floor((mx / plotW.value) * days.length));
  const d = days[j];
  const n = d.prices.length;
  const i = Math.min(n - 1, Math.floor((my / plotH) * n));
  const p = d.prices[i];
  cross.value = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  show(evt, {
    title: d.validityDate,
    rows: [
      ['SLOT', p.timeRange, ''],
      ['PRICE', `${fmtNum(conv(p.price))} ${unitText.value}`, p.price < 0 ? 'neg' : 'amber'],
    ],
  });
}
function onLeave() {
  cross.value = null;
  hide();
}
</script>

<template>
  <PanelFrame code="B" title="Heatmap" style="--boot: 0.2s">
    <template #meta>
      <span>X DATE · Y TIME-OF-DAY</span>
      <span class="legend">
        <canvas ref="legendCanvas"></canvas>
        <span v-if="legendRange" class="mono lr">{{ legendRange.min }} → {{ legendRange.max }} · {{ colorMode.toUpperCase() }}</span>
      </span>
    </template>
    <div ref="wrap" class="wrap">
      <template v-if="selectedDays.length">
        <div class="stage" @mousemove="onMove" @mouseleave="onLeave">
          <canvas ref="canvas"></canvas>
          <template v-if="cross">
            <div class="ch v" :style="{ left: `${cross.x}px` }"></div>
            <div class="ch h" :style="{ top: `${cross.y}px` }"></div>
          </template>
        </div>
      </template>
      <NoData v-else :height="H" />
    </div>
  </PanelFrame>
</template>

<style scoped>
.wrap {
  width: 100%;
}

.stage {
  position: relative;
  cursor: crosshair;
}

.ch {
  position: absolute;
  pointer-events: none;
  background: rgba(255, 255, 255, 0.25);
}

.ch.v {
  top: 0;
  bottom: 0;
  width: 1px;
}

.ch.h {
  left: 0;
  right: 0;
  height: 1px;
}

.legend {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.legend canvas {
  border: 1px solid var(--border);
}

.lr {
  font-size: 9.5px;
  color: var(--faint);
}
</style>
