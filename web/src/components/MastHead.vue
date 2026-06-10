<script setup>
import { computed, ref } from 'vue';
import { useControls } from '../composables/useControls.js';
import { usePriceData } from '../composables/usePriceData.js';
import SegToggle from './SegToggle.vue';

const { granularity, unit } = useControls();
const { current, reloadLive } = usePriceData();

const reloading = ref(false);
async function onReload() {
  reloading.value = true;
  try {
    await reloadLive();
  } finally {
    reloading.value = false;
  }
}

const chip = computed(() => {
  const s = current.value;
  switch (s.status) {
    case 'loading':
      return { text: 'LOADING…', tone: 'dim' };
    case 'snapshot':
      return { text: `SNAPSHOT ${s.snapshotDate}`, tone: 'ok' };
    case 'snapshot+live':
      return { text: `SNAPSHOT ${s.snapshotDate} + LIVE Δ${s.deltaDays}d`, tone: 'ok' };
    case 'live':
      return { text: `LIVE ONLY Δ${s.deltaDays}d`, tone: 'ok' };
    case 'live-failed':
      return {
        text: s.snapshotDate ? `SNAPSHOT ${s.snapshotDate} · LIVE FAILED` : 'NO DATA · LIVE FAILED',
        tone: 'bad',
      };
    default:
      return { text: 'NO DATA', tone: 'dim' };
  }
});
</script>

<template>
  <header class="mast">
    <div class="brand">
      <h1>OCTAPLUS<span class="dash">—</span>PRICE OBSERVATORY</h1>
      <p class="sub microcap">Belgian day-ahead electricity &middot; EUR/MWh</p>
    </div>

    <div class="ops">
      <div class="group">
        <span class="microcap">Granularity</span>
        <SegToggle
          v-model="granularity"
          :options="[
            { value: 'HOUR', label: 'HOUR' },
            { value: 'QUARTER_HOUR', label: 'QUARTER-HOUR' },
          ]"
        />
      </div>
      <div class="group">
        <span class="microcap">Unit</span>
        <SegToggle
          v-model="unit"
          :options="[
            { value: 'mwh', label: 'EUR/MWH' },
            { value: 'kwh', label: 'C€/KWH' },
          ]"
        />
      </div>
      <div class="group">
        <span class="microcap">Source</span>
        <div class="srcline">
          <span class="chip mono" :class="chip.tone">
            <i class="dot"></i>{{ chip.text }}
          </span>
          <button class="reload mono" type="button" :disabled="reloading" @click="onReload">
            {{ reloading ? '…' : '↻ RELOAD LIVE' }}
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.mast {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  padding: 16px 18px 14px;
  border-bottom: 1px solid var(--border);
  background:
    linear-gradient(180deg, rgba(255, 176, 0, 0.025), transparent 65%),
    var(--bg);
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-weight: 800;
  font-size: 21px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text);
}

.dash {
  color: var(--amber);
  margin: 0 8px;
}

.sub {
  margin: 3px 0 0;
  color: var(--faint);
}

.ops {
  display: flex;
  gap: 22px;
  flex-wrap: wrap;
  align-items: flex-end;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.srcline {
  display: flex;
  gap: 8px;
  align-items: center;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  letter-spacing: 0.06em;
  padding: 4px 8px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--muted);
}

.chip .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--faint);
}

.chip.ok {
  color: var(--amber);
  border-color: rgba(255, 176, 0, 0.35);
}

.chip.ok .dot {
  background: var(--amber);
  box-shadow: 0 0 6px rgba(255, 176, 0, 0.6);
}

.chip.bad {
  color: var(--red);
  border-color: rgba(255, 77, 79, 0.4);
}

.chip.bad .dot {
  background: var(--red);
  box-shadow: 0 0 6px rgba(255, 77, 79, 0.6);
}

.reload {
  font-size: 10px;
  letter-spacing: 0.08em;
  padding: 4px 8px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--muted);
  transition: color 0.15s, border-color 0.15s;
}

.reload:hover:not(:disabled) {
  color: var(--amber);
  border-color: rgba(255, 176, 0, 0.45);
}

.reload:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
