<script setup>
import * as d3 from 'd3';
import { computed, onMounted, ref, watch } from 'vue';
import { dailyAggregates, fmtNum, rollingMean } from '../lib/analysis.js';
import { useControls } from '../composables/useControls.js';
import { useElementSize } from '../composables/useElementSize.js';
import { usePriceData } from '../composables/usePriceData.js';
import { useSelection } from '../composables/useSelection.js';
import { useTooltip } from '../composables/useTooltip.js';
import NoData from './NoData.vue';
import PanelFrame from './PanelFrame.vue';

const { aggregate, rollingWindow, dateRange } = useControls();
const { current } = usePriceData();
const { allDays, selectedDays, resolvedRange, extent, conv, unitText } = useSelection();
const { show, hide } = useTooltip();

const wrap = ref(null);
const { width } = useElementSize(wrap);

const H = 240;
const STRIP_H = 46;
const M = { top: 10, right: 12, bottom: 22, left: 48 };

const dateOf = (iso) => new Date(`${iso}T00:00:00Z`);

const agg = computed(() =>
  dailyAggregates(selectedDays.value).map((d) => ({
    ...d,
    cMean: conv(d.mean),
    cMedian: conv(d.median),
    cMin: conv(d.min),
    cMax: conv(d.max),
    live: current.value.liveDates.has(d.date),
    t: dateOf(d.date),
  })),
);

const aggKey = computed(() => ({ mean: 'cMean', median: 'cMedian', min: 'cMin', max: 'cMax' })[aggregate.value]);

const rolled = computed(() => {
  const series = agg.value.map((d) => d[aggKey.value]);
  return rollingMean(series, rollingWindow.value);
});

const plotW = computed(() => Math.max(50, width.value - M.left - M.right));
const plotH = H - M.top - M.bottom;

const x = computed(() => {
  const r = resolvedRange.value;
  if (!r) return null;
  return d3
    .scaleUtc()
    .domain([dateOf(r.from), d3.utcDay.offset(dateOf(r.to), 1)])
    .range([0, plotW.value]);
});

const y = computed(() => {
  const a = agg.value;
  if (!a.length) return null;
  const lo = d3.min(a, (d) => d.cMin);
  const hi = d3.max(a, (d) => d.cMax);
  return d3.scaleLinear().domain([lo, hi]).nice().range([plotH, 0]);
});

const bandPath = computed(() => {
  if (!x.value || !y.value) return '';
  return d3
    .area()
    .x((d) => x.value(d.t))
    .y0((d) => y.value(d.cMin))
    .y1((d) => y.value(d.cMax))(agg.value);
});

function linePath(filter) {
  const line = d3
    .line()
    .defined((d) => filter(d))
    .x((d) => x.value(d.t))
    .y((d) => y.value(d[aggKey.value]));
  return line(agg.value);
}

const snapPath = computed(() => (x.value && y.value ? linePath((d) => !d.live) : ''));
const livePath = computed(() => {
  if (!x.value || !y.value) return '';
  // include the last snapshot point so the dotted live segment connects
  const a = agg.value;
  const firstLive = a.findIndex((d) => d.live);
  if (firstLive === -1) return '';
  const pts = a.slice(Math.max(0, firstLive - 1));
  return d3
    .line()
    .x((d) => x.value(d.t))
    .y((d) => y.value(d[aggKey.value]))(pts);
});

const rollPath = computed(() => {
  if (!x.value || !y.value) return '';
  return d3
    .line()
    .x((d, i) => x.value(agg.value[i].t))
    .y((d) => y.value(d))(rolled.value);
});

const zeroY = computed(() => (y.value && y.value.domain()[0] < 0 ? y.value(0) : null));

// axes own their <g> via refs
const xAxisEl = ref(null);
const yAxisEl = ref(null);
watch([x, y], () => {
  if (x.value && xAxisEl.value) {
    d3.select(xAxisEl.value).call(d3.axisBottom(x.value).ticks(Math.max(2, plotW.value / 110)).tickSizeOuter(0));
  }
  if (y.value && yAxisEl.value) {
    d3.select(yAxisEl.value).call(d3.axisLeft(y.value).ticks(5).tickSizeOuter(0));
  }
}, { flush: 'post' });

// crosshair + tooltip
const cursor = ref(null);
function onMove(evt) {
  if (!x.value || !agg.value.length) return;
  const [mx] = d3.pointer(evt);
  const t = x.value.invert(mx);
  const i = d3.bisector((d) => d.t).center(agg.value, t);
  const d = agg.value[i];
  if (!d) return;
  cursor.value = { px: x.value(d.t), py: y.value(d[aggKey.value]) };
  show(evt, {
    title: `${d.date}${d.live ? ' · LIVE' : ''}`,
    rows: [
      [aggregate.value.toUpperCase(), `${fmtNum(d[aggKey.value])} ${unitText.value}`, 'amber'],
      ['MIN', fmtNum(d.cMin), d.min < 0 ? 'neg' : ''],
      ['MAX', fmtNum(d.cMax), ''],
      [`ROLL ${rollingWindow.value}D`, fmtNum(rolled.value[i]), ''],
    ],
  });
}
function onLeave() {
  cursor.value = null;
  hide();
}

// ---- mini full-history strip with d3-brush ----
const stripPlotW = plotW;
const stripX = computed(() => {
  if (!extent.value) return null;
  return d3
    .scaleUtc()
    .domain([dateOf(extent.value.from), d3.utcDay.offset(dateOf(extent.value.to), 1)])
    .range([0, stripPlotW.value]);
});

const stripPath = computed(() => {
  if (!stripX.value) return '';
  const a = dailyAggregates(allDays.value);
  if (!a.length) return '';
  const ys = d3
    .scaleLinear()
    .domain([d3.min(a, (d) => d.mean), d3.max(a, (d) => d.mean)])
    .range([STRIP_H - 4, 4]);
  return d3
    .line()
    .x((d) => stripX.value(dateOf(d.date)))
    .y((d) => ys(d.mean))(a);
});

const brushEl = ref(null);
let brush = null;
let syncingBrush = false;

function brushed(event) {
  if (syncingBrush || !event.sourceEvent || !stripX.value) return; // guard the feedback loop
  if (!event.selection) {
    dateRange.value = { from: null, to: null };
    return;
  }
  const [a, b] = event.selection.map(stripX.value.invert);
  const fromIso = a.toISOString().slice(0, 10);
  const toIso = d3.utcDay.offset(b, -1).toISOString().slice(0, 10);
  dateRange.value = { from: fromIso, to: toIso >= fromIso ? toIso : fromIso };
}

function syncBrush() {
  if (!brush || !brushEl.value || !stripX.value || !resolvedRange.value) return;
  syncingBrush = true;
  const g = d3.select(brushEl.value);
  brush.extent([
    [0, 0],
    [stripPlotW.value, STRIP_H],
  ]);
  g.call(brush); // idempotent; the <g> is fresh after every v-if flip
  g.call(brush.move, [
    stripX.value(dateOf(resolvedRange.value.from)),
    stripX.value(d3.utcDay.offset(dateOf(resolvedRange.value.to), 1)),
  ]);
  syncingBrush = false;
}

onMounted(() => {
  brush = d3.brushX().handleSize(6).on('brush end', brushed);
  watch([stripPlotW, stripX, resolvedRange], syncBrush, { immediate: true, flush: 'post' });
});
</script>

<template>
  <PanelFrame code="A" title="Timeline" style="--boot: 0.15s">
    <template #meta>
      <span>{{ aggregate.toUpperCase() }} + MIN–MAX BAND</span>
      <span class="amber">ROLL {{ rollingWindow }}D</span>
    </template>
    <div ref="wrap" class="wrap">
      <template v-if="agg.length && x && y">
        <svg :width="width" :height="H">
          <g :transform="`translate(${M.left},${M.top})`">
            <path class="band" :d="bandPath" />
            <line v-if="zeroY != null" class="zero" x1="0" :x2="plotW" :y1="zeroY" :y2="zeroY" />
            <path class="agg" :d="snapPath" />
            <path v-if="livePath" class="agg live" :d="livePath" />
            <path class="roll" :d="rollPath" />
            <g v-if="cursor" class="crosshair">
              <line :x1="cursor.px" :x2="cursor.px" :y1="0" :y2="plotH" />
              <circle :cx="cursor.px" :cy="cursor.py" r="2.5" />
            </g>
            <g ref="yAxisEl" class="axis" />
            <g ref="xAxisEl" class="axis" :transform="`translate(0,${plotH})`" />
            <rect
              class="overlay"
              :width="plotW"
              :height="plotH"
              @mousemove="onMove"
              @mouseleave="onLeave"
            />
          </g>
        </svg>
        <svg :width="width" :height="STRIP_H" class="strip">
          <g :transform="`translate(${M.left},0)`">
            <path class="stripline" :d="stripPath" />
            <g ref="brushEl" class="brushg" />
          </g>
        </svg>
      </template>
      <NoData v-else :height="H + STRIP_H" />
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

.band {
  fill: rgba(255, 176, 0, 0.07);
  stroke: none;
}

.zero {
  stroke: var(--red);
  stroke-dasharray: 3 3;
  stroke-opacity: 0.6;
}

.agg {
  fill: none;
  stroke: #8fa1b3;
  stroke-width: 1.2;
}

.agg.live {
  stroke: var(--cyan);
  stroke-dasharray: 2 3;
}

.roll {
  fill: none;
  stroke: var(--amber);
  stroke-width: 1.8;
  filter: drop-shadow(0 0 3px rgba(255, 176, 0, 0.35));
}

.crosshair line {
  stroke: var(--faint);
  stroke-dasharray: 2 2;
}

.crosshair circle {
  fill: var(--amber);
}

.overlay {
  fill: transparent;
  cursor: crosshair;
}

.strip {
  margin-top: 4px;
}

.stripline {
  fill: none;
  stroke: var(--faint);
  stroke-width: 1;
}

.brushg :deep(.selection) {
  fill: rgba(255, 176, 0, 0.12);
  stroke: var(--amber-soft);
  stroke-width: 1;
}

.brushg :deep(.handle) {
  fill: var(--amber);
}
</style>
