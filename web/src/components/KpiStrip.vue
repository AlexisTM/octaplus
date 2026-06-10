<script setup>
import { computed } from 'vue';
import { fmtNum, fmtPct } from '../lib/analysis.js';
import { useSelection } from '../composables/useSelection.js';

const { kpis, conv, unitText } = useSelection();

const cells = computed(() => {
  const k = kpis.value;
  if (!k) return null;
  return [
    { label: 'MEAN', value: fmtNum(conv(k.mean)), sub: unitText.value },
    { label: 'MEDIAN', value: fmtNum(conv(k.median)), sub: unitText.value },
    { label: 'P5 / P95', value: `${fmtNum(conv(k.p5))} / ${fmtNum(conv(k.p95))}`, sub: unitText.value },
    { label: 'MIN', value: fmtNum(conv(k.min.value)), sub: `${k.min.date} · ${k.min.timeRange}`, neg: k.min.value < 0 },
    { label: 'MAX', value: fmtNum(conv(k.max.value)), sub: `${k.max.date} · ${k.max.timeRange}` },
    { label: 'NEGATIVE', value: fmtPct(k.negativeShare), sub: `${k.negativeCount} slots`, neg: k.negativeCount > 0 },
    { label: 'Ø DAY SPREAD', value: fmtNum(conv(k.meanSpread)), sub: unitText.value },
    { label: 'SELECTION', value: String(k.dayCount), sub: `days · ${k.slotCount} slots` },
  ];
});
</script>

<template>
  <div class="strip panel" style="--boot: 0.1s">
    <template v-if="cells">
      <div v-for="c in cells" :key="c.label" class="cell">
        <span class="microcap">{{ c.label }}</span>
        <span class="value mono" :class="{ neg: c.neg }">{{ c.value }}</span>
        <span class="sub mono">{{ c.sub }}</span>
      </div>
    </template>
    <div v-else class="empty mono">// NO DATA IN RANGE</div>
  </div>
</template>

<style scoped>
.strip {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-right: 1px solid var(--border-soft);
}

.cell:last-child {
  border-right: none;
}

.value {
  font-size: 17px;
  font-weight: 500;
  color: var(--amber);
  line-height: 1.2;
}

.value.neg {
  color: var(--red);
}

.sub {
  font-size: 9px;
  color: var(--faint);
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty {
  grid-column: 1 / -1;
  padding: 16px;
  text-align: center;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--faint);
}

@media (max-width: 1200px) {
  .strip {
    grid-template-columns: repeat(4, 1fr);
  }

  .cell {
    border-bottom: 1px solid var(--border-soft);
  }
}
</style>
