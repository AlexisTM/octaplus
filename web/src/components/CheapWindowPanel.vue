<script setup>
import * as d3 from 'd3';
import { computed, ref, watch } from 'vue';
import { bestWindowDistribution, fmtHour, fmtNum, fmtPct, percentiles } from '../lib/analysis.js';
import { useControls } from '../composables/useControls.js';
import { useElementSize } from '../composables/useElementSize.js';
import { usePriceData } from '../composables/usePriceData.js';
import { useSelection } from '../composables/useSelection.js';
import { useTooltip } from '../composables/useTooltip.js';
import NoData from './NoData.vue';
import PanelFrame from './PanelFrame.vue';

const { windowLength } = useControls();
const { selectedDays, conv, unitText } = useSelection();
const { current } = usePriceData();
const { show, hide } = useTooltip();

const wrap = ref(null);
const { width } = useElementSize(wrap);
const H = 150;
const M = { top: 10, right: 12, bottom: 22, left: 36 };
const plotW = computed(() => Math.max(50, width.value - M.left - M.right));
const plotH = H - M.top - M.bottom;

const dist = computed(() => bestWindowDistribution(selectedDays.value, windowLength.value));

const stats = computed(() => {
  const res = dist.value.results;
  if (!res.length) return null;
  const [medAvg] = percentiles(res.map((r) => r.avg), [0.5]);
  const [medSavAbs] = percentiles(res.map((r) => r.savingsAbs), [0.5]);
  const pcts = res.map((r) => r.savingsPct).filter((v) => v != null);
  const [medSavPct] = pcts.length ? percentiles(pcts, [0.5]) : [null];
  return { medAvg, medSavAbs, medSavPct, n: res.length };
});

function todayIso(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const callouts = computed(() => {
  const byDate = new Map(dist.value.results.map((r) => [r.date, r]));
  return [
    { label: 'TODAY', r: byDate.get(todayIso(0)) },
    { label: 'TOMORROW', r: byDate.get(todayIso(1)) },
  ].filter((c) => c.r);
});

const x = computed(() => d3.scaleLinear().domain([0, 24]).range([0, plotW.value]));
const y = computed(() => {
  const maxC = Math.max(1, ...dist.value.counts);
  return d3.scaleLinear().domain([0, maxC]).range([plotH, 0]);
});

const xAxisEl = ref(null);
watch([x, y], () => {
  if (xAxisEl.value && x.value) {
    d3.select(xAxisEl.value).call(
      d3.axisBottom(x.value).tickValues([0, 4, 8, 12, 16, 20, 24]).tickFormat((h) => `${String(h).padStart(2, '0')}h`).tickSizeOuter(0),
    );
  }
}, { flush: 'post' });

const total = computed(() => dist.value.counts.reduce((a, b) => a + b, 0));

function onBar(evt, h) {
  const c = dist.value.counts[h];
  show(evt, {
    title: `START ${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`,
    rows: [
      ['DAYS', String(c), 'amber'],
      ['SHARE', total.value ? fmtPct((c / total.value) * 100) : '—', ''],
    ],
  });
}

const liveTag = (date) => (current.value.liveDates.has(date) ? ' · LIVE' : '');
</script>

<template>
  <PanelFrame code="F" title="Cheap-window finder" style="--boot: 0.4s">
    <template #meta>
      <span class="amber">N = {{ windowLength }}H</span>
      <span v-if="stats">{{ stats.n }} DAYS</span>
    </template>
    <div ref="wrap" class="wrap">
      <template v-if="stats">
        <div class="callouts">
          <div v-for="c in callouts" :key="c.label" class="callout">
            <span class="microcap">{{ c.label }} BEST {{ windowLength }}H{{ liveTag(c.r.date) }}</span>
            <span class="big mono">{{ fmtHour(c.r.startHour) }}–{{ fmtHour(Math.min(24, c.r.startHour + windowLength)) }}</span>
            <span class="mono sub">
              Ø {{ fmtNum(conv(c.r.avg)) }} {{ unitText }} ·
              <span class="save">−{{ fmtNum(conv(c.r.savingsAbs)) }} ({{ c.r.savingsPct != null ? fmtPct(c.r.savingsPct) : '—' }}) vs day mean</span>
            </span>
          </div>
          <div v-if="!callouts.length" class="callout">
            <span class="microcap">Today / tomorrow</span>
            <span class="mono sub dim">outside current range or not yet published</span>
          </div>
          <div class="callout">
            <span class="microcap">Median over selection</span>
            <span class="big mono">{{ fmtNum(conv(stats.medAvg)) }} <span class="unit">{{ unitText }}</span></span>
            <span class="mono sub save">
              −{{ fmtNum(conv(stats.medSavAbs)) }} {{ unitText }}
              ({{ stats.medSavPct != null ? fmtPct(stats.medSavPct) : '—' }}) vs day mean
            </span>
          </div>
        </div>

        <svg :width="width" :height="H">
          <g :transform="`translate(${M.left},${M.top})`">
            <g v-for="(c, h) in dist.counts" :key="h">
              <rect
                class="bar"
                :class="{ zero: !c }"
                :x="x(h) + 1"
                :y="y(c)"
                :width="Math.max(1, x(h + 1) - x(h) - 2)"
                :height="plotH - y(c)"
                @mousemove="onBar($event, h)"
                @mouseleave="hide"
              />
            </g>
            <g ref="xAxisEl" class="axis" :transform="`translate(0,${plotH})`" />
            <text class="ylabel" x="-30" y="8">DAYS</text>
          </g>
        </svg>
        <p class="hint microcap">Distribution of cheapest {{ windowLength }}h window start times — shift EV charging, boiler, laundry here.</p>
      </template>
      <NoData v-else :height="H + 60" />
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

.callouts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}

.callout {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  background: var(--panel-2);
}

.big {
  font-size: 17px;
  font-weight: 500;
  color: var(--amber);
}

.unit {
  font-size: 10px;
  color: var(--faint);
}

.sub {
  font-size: 10px;
  color: var(--muted);
}

.save {
  color: #6fd388;
}

.dim {
  color: var(--faint);
}

.bar {
  fill: rgba(255, 176, 0, 0.55);
  shape-rendering: crispEdges;
}

.bar:hover {
  fill: var(--amber);
}

.bar.zero {
  fill: transparent;
}

.ylabel {
  fill: var(--faint);
  font-size: 8.5px;
  letter-spacing: 0.1em;
}

.hint {
  margin: 8px 0 0;
  color: var(--faint);
}
</style>
