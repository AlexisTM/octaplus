<script setup>
import * as d3 from 'd3';
import { computed, ref, watch } from 'vue';
import { dailyAggregates, dailySpread, fmtNum, rollingStd } from '../lib/analysis.js';
import { useControls } from '../composables/useControls.js';
import { useElementSize } from '../composables/useElementSize.js';
import { useSelection } from '../composables/useSelection.js';
import { useTooltip } from '../composables/useTooltip.js';
import NoData from './NoData.vue';
import PanelFrame from './PanelFrame.vue';

const { rollingWindow } = useControls();
const { selectedDays, resolvedRange, conv, unitText } = useSelection();
const { show, hide } = useTooltip();

const wrap = ref(null);
const { width } = useElementSize(wrap);
const H = 220;
const M = { top: 10, right: 48, bottom: 22, left: 44 };
const plotW = computed(() => Math.max(50, width.value - M.left - M.right));
const plotH = H - M.top - M.bottom;

const dateOf = (iso) => new Date(`${iso}T00:00:00Z`);

const spreads = computed(() =>
  dailySpread(selectedDays.value).map((d) => ({ ...d, cSpread: conv(d.spread), t: dateOf(d.date) })),
);

const vol = computed(() => {
  const means = dailyAggregates(selectedDays.value).map((d) => conv(d.mean));
  return rollingStd(means, rollingWindow.value);
});

const x = computed(() => {
  const r = resolvedRange.value;
  if (!r) return null;
  return d3
    .scaleUtc()
    .domain([dateOf(r.from), d3.utcDay.offset(dateOf(r.to), 1)])
    .range([0, plotW.value]);
});

const ySpread = computed(() => {
  if (!spreads.value.length) return null;
  return d3.scaleLinear().domain([0, d3.max(spreads.value, (d) => d.cSpread) || 1]).nice().range([plotH, 0]);
});

const yVol = computed(() => {
  if (!vol.value.length) return null;
  return d3.scaleLinear().domain([0, d3.max(vol.value) || 1]).nice().range([plotH, 0]);
});

const barW = computed(() => Math.max(1, (plotW.value / Math.max(1, spreads.value.length)) * 0.6));

const volPath = computed(() => {
  if (!x.value || !yVol.value) return '';
  return d3
    .line()
    .x((v, i) => x.value(spreads.value[i].t))
    .y((v) => yVol.value(v))(vol.value);
});

const xAxisEl = ref(null);
const yAxisEl = ref(null);
const y2AxisEl = ref(null);
watch([x, ySpread, yVol], () => {
  if (xAxisEl.value && x.value) {
    d3.select(xAxisEl.value).call(d3.axisBottom(x.value).ticks(Math.max(2, plotW.value / 110)).tickSizeOuter(0));
  }
  if (yAxisEl.value && ySpread.value) {
    d3.select(yAxisEl.value).call(d3.axisLeft(ySpread.value).ticks(5).tickSizeOuter(0));
  }
  if (y2AxisEl.value && yVol.value) {
    d3.select(y2AxisEl.value).call(d3.axisRight(yVol.value).ticks(5).tickSizeOuter(0));
  }
}, { flush: 'post' });

function onMove(evt) {
  if (!x.value || !spreads.value.length) return;
  const [mx] = d3.pointer(evt);
  const t = x.value.invert(mx);
  const i = d3.bisector((d) => d.t).center(spreads.value, t);
  const d = spreads.value[i];
  if (!d) return;
  show(evt, {
    title: d.date,
    rows: [
      ['SPREAD', `${fmtNum(d.cSpread)} ${unitText.value}`, 'amber'],
      ['MIN', fmtNum(conv(d.min)), d.min < 0 ? 'neg' : ''],
      ['MAX', fmtNum(conv(d.max)), ''],
      [`σ ${rollingWindow.value}D`, fmtNum(vol.value[i]), ''],
    ],
  });
}
</script>

<template>
  <PanelFrame code="E" title="Spread &amp; volatility" style="--boot: 0.35s">
    <template #meta>
      <span class="amber">▮ DAY SPREAD</span>
      <span class="cyan">— σ ROLL {{ rollingWindow }}D</span>
    </template>
    <div ref="wrap" class="wrap">
      <svg v-if="spreads.length && x && ySpread" :width="width" :height="H">
        <g :transform="`translate(${M.left},${M.top})`">
          <rect
            v-for="d in spreads"
            :key="d.date"
            class="sbar"
            :x="x(d.t) - barW / 2"
            :y="ySpread(d.cSpread)"
            :width="barW"
            :height="plotH - ySpread(d.cSpread)"
          />
          <path class="vol" :d="volPath" />
          <g ref="yAxisEl" class="axis" />
          <g ref="y2AxisEl" class="axis" :transform="`translate(${plotW},0)`" />
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

.sbar {
  fill: rgba(255, 176, 0, 0.4);
  shape-rendering: crispEdges;
}

.vol {
  fill: none;
  stroke: var(--cyan);
  stroke-width: 1.4;
}

.overlay {
  fill: transparent;
  cursor: crosshair;
}
</style>
