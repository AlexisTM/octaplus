<script setup>
import { computed } from 'vue';

const props = defineProps({
  min: { type: Number, default: 0 },
  max: { type: Number, default: 24 },
  step: { type: Number, default: 1 },
  modelValue: { type: Array, required: true }, // [lo, hi]
});
const emit = defineEmits(['update:modelValue']);

const lo = computed(() => props.modelValue[0]);
const hi = computed(() => props.modelValue[1]);

function setLo(v) {
  emit('update:modelValue', [Math.min(Number(v), hi.value), hi.value]);
}
function setHi(v) {
  emit('update:modelValue', [lo.value, Math.max(Number(v), lo.value)]);
}

const pct = (v) => ((v - props.min) / (props.max - props.min)) * 100;
const fillStyle = computed(() => ({
  left: `${pct(lo.value)}%`,
  width: `${pct(hi.value) - pct(lo.value)}%`,
}));
</script>

<template>
  <div class="dual">
    <div class="track"></div>
    <div class="fill" :style="fillStyle"></div>
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="lo"
      aria-label="band start"
      @input="setLo($event.target.value)"
    />
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="hi"
      aria-label="band end"
      @input="setHi($event.target.value)"
    />
  </div>
</template>

<style scoped>
.dual {
  position: relative;
  height: 14px;
}

.track,
.fill {
  position: absolute;
  top: 6px;
  height: 2px;
  pointer-events: none;
}

.track {
  left: 0;
  right: 0;
  background: var(--border);
}

.fill {
  background: var(--amber);
  box-shadow: 0 0 5px rgba(255, 176, 0, 0.4);
}

.dual input[type='range'] {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* thumbs stay interactive while overlapped tracks pass through */
.dual input[type='range']::-webkit-slider-runnable-track {
  background: transparent;
}

.dual input[type='range']::-moz-range-track {
  background: transparent;
}

.dual input[type='range']::-webkit-slider-thumb {
  pointer-events: auto;
}

.dual input[type='range']::-moz-range-thumb {
  pointer-events: auto;
}
</style>
