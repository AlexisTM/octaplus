<script setup>
import { computed } from 'vue';
import { fmtHour, isoAddDays } from '../lib/analysis.js';
import { useControls } from '../composables/useControls.js';
import { useSelection } from '../composables/useSelection.js';
import DualRange from './DualRange.vue';
import SegToggle from './SegToggle.vue';

const { dateRange, rollingWindow, aggregate, hourBand, weekdays, windowLength, colorMode, toggleWeekday } =
  useControls();
const { extent, resolvedRange } = useSelection();

const DAY_LABELS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const PRESETS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
  { label: 'ALL', days: null },
];

function applyPreset(p) {
  if (!extent.value) return;
  if (p.days == null) {
    dateRange.value = { from: null, to: null };
    return;
  }
  const to = extent.value.to;
  const from = isoAddDays(to, -(p.days - 1));
  dateRange.value = { from: from < extent.value.from ? extent.value.from : from, to: null };
}

const activePreset = computed(() => {
  if (!extent.value || !resolvedRange.value) return null;
  if (dateRange.value.from == null && dateRange.value.to == null) return 'ALL';
  for (const p of PRESETS) {
    if (p.days == null) continue;
    const from = isoAddDays(extent.value.to, -(p.days - 1));
    if (resolvedRange.value.from === from && resolvedRange.value.to === extent.value.to) return p.label;
  }
  return null;
});

const fromValue = computed(() => resolvedRange.value?.from ?? '');
const toValue = computed(() => resolvedRange.value?.to ?? '');

function setFrom(v) {
  if (v) dateRange.value = { ...dateRange.value, from: v };
}
function setTo(v) {
  if (v) dateRange.value = { ...dateRange.value, to: v };
}
</script>

<template>
  <aside class="rail panel" style="--boot: 0.05s">
    <div class="block">
      <span class="microcap">Range</span>
      <div class="presets">
        <button
          v-for="p in PRESETS"
          :key="p.label"
          type="button"
          class="preset mono"
          :class="{ on: activePreset === p.label }"
          @click="applyPreset(p)"
        >
          {{ p.label }}
        </button>
      </div>
      <div class="dates">
        <label>
          <span class="microcap">From</span>
          <input type="date" :value="fromValue" :min="extent?.from" :max="toValue" @change="setFrom($event.target.value)" />
        </label>
        <label>
          <span class="microcap">To</span>
          <input type="date" :value="toValue" :min="fromValue" :max="extent?.to" @change="setTo($event.target.value)" />
        </label>
      </div>
    </div>

    <div class="block">
      <div class="rowlabel">
        <span class="microcap">Rolling window</span>
        <span class="mono val">{{ rollingWindow }}d</span>
      </div>
      <input v-model.number="rollingWindow" type="range" min="1" max="30" step="1" aria-label="rolling window days" />
    </div>

    <div class="block">
      <span class="microcap">Aggregate</span>
      <SegToggle
        v-model="aggregate"
        :options="[
          { value: 'mean', label: 'MEAN' },
          { value: 'median', label: 'MED' },
          { value: 'min', label: 'MIN' },
          { value: 'max', label: 'MAX' },
        ]"
      />
    </div>

    <div class="block">
      <div class="rowlabel">
        <span class="microcap">Hour band</span>
        <span class="mono val">{{ fmtHour(hourBand[0]) }}–{{ fmtHour(hourBand[1]) }}</span>
      </div>
      <DualRange v-model="hourBand" :min="0" :max="24" :step="1" />
    </div>

    <div class="block">
      <span class="microcap">Weekdays</span>
      <div class="days">
        <button
          v-for="(label, i) in DAY_LABELS"
          :key="label"
          type="button"
          class="day mono"
          :class="{ on: weekdays.has(i + 1), weekend: i >= 5 }"
          :aria-pressed="weekdays.has(i + 1)"
          @click="toggleWeekday(i + 1)"
        >
          {{ label }}
        </button>
      </div>
    </div>

    <div class="block">
      <div class="rowlabel">
        <span class="microcap">Best window</span>
        <span class="mono val">{{ windowLength }}h</span>
      </div>
      <input v-model.number="windowLength" type="range" min="1" max="12" step="1" aria-label="best window hours" />
    </div>

    <div class="block">
      <span class="microcap">Color scale</span>
      <SegToggle
        v-model="colorMode"
        :options="[
          { value: 'linear', label: 'LINEAR' },
          { value: 'quantile', label: 'QUANTILE' },
        ]"
      />
    </div>
  </aside>
</template>

<style scoped>
.rail {
  position: sticky;
  top: 12px;
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 14px 12px;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rowlabel {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.val {
  font-size: 11px;
  color: var(--amber);
}

.presets {
  display: flex;
  gap: 4px;
}

.preset {
  flex: 1;
  font-size: 10px;
  padding: 4px 0;
  text-align: center;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--muted);
  transition: color 0.15s, border-color 0.15s;
}

.preset:hover {
  color: var(--text);
}

.preset.on {
  color: #0e1013;
  background: var(--amber);
  border-color: var(--amber);
  font-weight: 500;
}

.dates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.dates label {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dates input {
  width: 100%;
}

.days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 3px;
}

.day {
  font-size: 9.5px;
  padding: 4px 0;
  text-align: center;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--faint);
  transition: color 0.15s, background 0.15s;
}

.day.on {
  color: var(--amber);
  border-color: rgba(255, 176, 0, 0.4);
  background: var(--amber-faint);
}

.day.weekend.on {
  color: var(--cyan);
  border-color: rgba(63, 210, 255, 0.4);
  background: rgba(63, 210, 255, 0.08);
}
</style>
