<script setup>
import * as d3 from 'd3';
import { computed, ref, watch } from 'vue';
import { fmtHour, fmtNum, profileByTimeOfDay } from '../lib/analysis.js';
import { useControls } from '../composables/useControls.js';
import { useElementSize } from '../composables/useElementSize.js';
import { useSelection } from '../composables/useSelection.js';
import { useTooltip } from '../composables/useTooltip.js';
import NoData from './NoData.vue';
import PanelFrame from './PanelFrame.vue';

const { hourBand } = useControls();
const { selectedDays, conv, unitText } = useSelection();
const { show, hide } = useTooltip();

const wrap = ref(null);
const { width } = useElementSize(wrap);
const H = 220;
const M = { top: 10, right: 12, bottom: 22, left: 48 };
const plotW = computed(() => Math.max(50, width.value - M.left - M.right));
const plotH = H - M.top - M.bottom;

const weekday = computed(() =>
  profileByTimeOfDay(selectedDays.value, { weekdays: [1, 2, 3, 4, 5] }).map((b) => ({ ...b, mean: conv(b.mean) })),
);
const weekend = computed(() =>
  profileByTimeOfDay(selectedDays.value, { weekdays: [6, 7] }).map((b) => ({ ...b, mean: conv(b.mean) })),
);

const hasData = computed(() => weekday.value.some((b) => b.mean != null) || weekend.value.some((b) => b.mean != null));

const x = computed(() => d3.scaleLinear().domain([0, 24]).range([0, plotW.value]));

const y = computed(() => {
  const vals = [...weekday.value, ...weekend.value].map((b) => b.mean).filter((v) => v != null);
  if (!vals.length) return null;
  return d3.scaleLinear().domain(d3.extent(vals)).nice().range([plotH, 0]);
});

function stepPath(bins) {
  if (!y.value || !bins.length) return '';
  // close the step at 24h with the final bin's value
  const last = bins[bins.length - 1];
  const pts = last.mean != null ? [...bins, { hour: 24, mean: last.mean, count: last.count }] : bins;
  return d3
    .line()
    .defined((b) => b.mean != null)
    .x((b) => x.value(b.hour))
    .y((b) => y.value(b.mean))
    .curve(d3.curveStepAfter)(pts);
}

const weekdayPath = computed(() => stepPath(weekday.value));
const weekendPath = computed(() => stepPath(weekend.value));

const band = computed(() => ({
  x: x.value(hourBand.value[0]),
  w: Math.max(0, x.value(hourBand.value[1]) - x.value(hourBand.value[0])),
}));

const zeroY = computed(() => (y.value && y.value.domain()[0] < 0 ? y.value(0) : null));

const xAxisEl = ref(null);
const yAxisEl = ref(null);
watch([x, y], () => {
  if (xAxisEl.value && x.value) {
    d3.select(xAxisEl.value).call(
      d3.axisBottom(x.value).tickValues([0, 4, 8, 12, 16, 20, 24]).tickFormat((h) => `${String(h).padStart(2, '0')}h`).tickSizeOuter(0),
    );
  }
  if (yAxisEl.value && y.value) {
    d3.select(yAxisEl.value).call(d3.axisLeft(y.value).ticks(5).tickSizeOuter(0));
  }
}, { flush: 'post' });

function onMove(evt) {
  if (!x.value) return;
  const [mx] = d3.pointer(evt);
  const h = x.value.invert(mx);
  const pick = (bins) => {
    if (!bins.length) return null;
    const idx = Math.min(bins.length - 1, Math.max(0, Math.floor((h / 24) * bins.length)));
    return bins[idx];
  };
  const wd = pick(weekday.value);
  const we = pick(weekend.value);
  show(evt, {
    title: `SLOT ${fmtHour(wd?.hour ?? we?.hour ?? h)}`,
    rows: [
      ['WEEKDAY', wd ? fmtNum(wd.mean) : '—', 'amber'],
      ['WEEKEND', we ? fmtNum(we.mean) : '—', ''],
    ],
  });
}
</script>

<template>
  <PanelFrame code="C" title="Daily profile" style="--boot: 0.25s">
    <template #meta>
      <span class="amber">— WEEKDAY</span>
      <span class="cyan">— WEEKEND</span>
      <span>{{ unitText }}</span>
    </template>
    <div ref="wrap" class="wrap">
      <svg v-if="hasData && y" :width="width" :height="H">
        <g :transform="`translate(${M.left},${M.top})`">
          <rect class="hourband" :x="band.x" :width="band.w" y="0" :height="plotH" />
          <line v-if="zeroY != null" class="zero" x1="0" :x2="plotW" :y1="zeroY" :y2="zeroY" />
          <path class="wd" :d="weekdayPath" />
          <path class="we" :d="weekendPath" />
          <g ref="yAxisEl" class="axis" />
          <g ref="xAxisEl" class="axis" :transform="`translate(0,${plotH})`" />
          <rect class="overlay" :width="plotW" :height="plotH" @mousemove="onMove" @mouseleave="hide" />
        </g>
      </svg>
      <NoData v-else :height="H" />
    </div>
  </PanelFrame>
</template>

<style scoped>
.wrap {
  width: 100%;
}

.amber {
  color: var(--amber);
}

.cyan {
  color: var(--cyan);
}

.hourband {
  fill: rgba(255, 255, 255, 0.04);
  stroke: rgba(255, 255, 255, 0.07);
}

.zero {
  stroke: var(--red);
  stroke-dasharray: 3 3;
  stroke-opacity: 0.6;
}

.wd {
  fill: none;
  stroke: var(--amber);
  stroke-width: 1.6;
}

.we {
  fill: none;
  stroke: var(--cyan);
  stroke-width: 1.3;
}

.overlay {
  fill: transparent;
  cursor: crosshair;
}
</style>
