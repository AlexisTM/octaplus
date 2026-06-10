<script setup>
defineProps({
  options: { type: Array, required: true }, // [{value, label}]
  modelValue: { type: [String, Number], required: true },
});
defineEmits(['update:modelValue']);
</script>

<template>
  <div class="seg" role="group">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="opt mono"
      :class="{ on: opt.value === modelValue }"
      :aria-pressed="opt.value === modelValue"
      @click="$emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<style scoped>
.seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 2px;
  overflow: hidden;
  background: var(--panel-2);
}

.opt {
  font-size: 10px;
  letter-spacing: 0.08em;
  padding: 4px 9px;
  color: var(--muted);
  border-right: 1px solid var(--border);
  transition: color 0.15s, background 0.15s;
}

.opt:last-child {
  border-right: none;
}

.opt:hover {
  color: var(--text);
}

.opt.on {
  color: #0e1013;
  background: var(--amber);
  font-weight: 500;
}
</style>
