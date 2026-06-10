<script setup>
import * as d3 from 'd3';
import { computed, ref, watch } from 'vue';
import { fmtNum, fmtPct, histogram, percentiles } from '../lib/analysis.js';
import { useElementSize } from '../composables/useElementSize.js';
import { useSelection } from '../composables/useSelection.js';
import { useTooltip } from '../composables/useTooltip.js';
import NoData from './NoData.vue';
import PanelFrame from './PanelFrame.vue';

const { records, conv, unitText } = useSelection();
const { show, hide } = useTooltip();

const wrap = ref(null);
const { width } = useElementSize(wrap);
const H = 220;
const M = { top: 14, right: 12, bottom: 22, left: 44 };
const plotW = computed(() => Math.max(50, width.value - M.left - M.right));
const plotH = H - M.top - M.bottom;

const prices = computed(() => records.value.map((r) => conv(r.price)));

const hist = computed(() => histogram(prices.value, 48));

const marks = computed(() => {
  const [p5, p50, p95] = percentiles(prices.value, [0.05, 0.5, 0.95]);
  return [
    { label: 'P5', v: p5 },
    { label: 'P50', v: p50 },
    { label: 'P95', v: p95 },
  ];
});

const negShare = computed(() => {
  const n = prices.value.length;
  if (!n) return null;
  const neg = prices.value.reduce((a, p) => a + (p < 0 ? 1 : 0), 0);
  return { count: neg, share: (neg / n) * 100, total: n };
});

const x = computed(() => {
  const h = hist.value;
  if (!h.bins.length) return null;
  const lo = Math.min(h.min, 0);
  return d3.scaleLinear().domain([lo, h.max]).nice().range([0, plotW.value]);
});

const y = computed(() => {
  const maxCount = d3.max(hist.value.bins, (b) => b.count) ?? 0;
  return d3.scaleLinear().domain([0, maxCount || 1]).range([plotH, 0]);
});

const bars = computed(() => {
  if (!x.value) return [];
  return hist.value.bins.map((b) => {
    const mid = (b.x0 + b.x1) / 2;
    return {
      x: x.value(b.x0),
      w: Math.max(1, x.value(b.x1) - x.value(b.x0) - 0.5),
      y: y.value(b.count),
      h: plotH - y.value(b.count),
      neg: mid < 0,
      bin: b,
    };
  });
});

const negRegion = computed(() => {
  if (!x.value || hist.value.min >= 0) return null;
  return { w: x.value(0) - x.value(x.value.domain()[0]) };
});

const xAxisEl = ref(null);
const yAxisEl = ref(null);
watch([x, y], () => {
  if (xAxisEl.value && x.value) {
    d3.select(xAxisEl.value).call(d3.axisBottom(x.value).ticks(Math.max(3, plotW.value / 90)).tickSizeOuter(0));
  }
  if (yAxisEl.value && y.value) {
    d3.select(yAxisEl.value).call(d3.axisLeft(y.value).ticks(4).tickSizeOuter(0));
  }
}, { flush: 'post' });

function onBar(evt, b) {
  show(evt, {
    title: `${fmtNum(b.bin.x0)} → ${fmtNum(b.bin.x1)} ${unitText.value}`,
    rows: [
      ['COUNT', String(b.bin.count), b.neg ? 'neg' : 'amber'],
      ['SHARE', fmtPct((b.bin.count / hist.value.total) * 100), ''],
    ],
  });
}
</script>

<template>
  <PanelFrame code="D" title="Distribution" style="--boot: 0.3s">
    <template #meta>
      <span v-if="negShare">{{ negShare.total }} SLOTS</span>
      <span v-if="negShare && negShare.count" class="neg">NEG {{ negShare.count }} · {{ fmtPct(negShare.share) }}</span>
    </template>
    <div ref="wrap" class="wrap">
      <svg v-if="bars.length && x" :width="width" :height="H">
        <g :transform="`translate(${M.left},${M.top})`">
          <rect v-if="negRegion" class="negzone" x="0" :width="negRegion.w" y="0" :height="plotH" />
          <rect
            v-for="(b, i) in bars"
            :key="i"
            class="bar"
            :class="{ neg: b.neg }"
            :x="b.x"
            :y="b.y"
            :width="b.w"
            :height="b.h"
            @mousemove="onBar($event, b)"
            @mouseleave="hide"
          />
          <g v-for="m in marks" :key="m.label">
            <template v-if="m.v != null">
              <line class="mark" :x1="x(m.v)" :x2="x(m.v)" y1="-4" :y2="plotH" />
              <text class="marklabel" :x="x(m.v)" y="-6">{{ m.label }} {{ fmtNum(m.v, 1) }}</text>
            </template>
          </g>
          <g ref="yAxisEl" class="axis" />
          <g ref="xAxisEl" class="axis" :transform="`translate(0,${plotH})`" />
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

.neg {
  color: var(--red);
}

.negzone {
  fill: rgba(255, 77, 79, 0.06);
}

.bar {
  fill: rgba(255, 176, 0, 0.55);
  shape-rendering: crispEdges;
}

.bar:hover {
  fill: var(--amber);
}

.bar.neg {
  fill: rgba(255, 77, 79, 0.65);
}

.bar.neg:hover {
  fill: var(--red);
}

.mark {
  stroke: var(--text);
  stroke-dasharray: 2 3;
  stroke-opacity: 0.7;
}

.marklabel {
  fill: var(--muted);
  font-size: 9px;
  text-anchor: middle;
}
</style>
