<script setup>
import { computed } from 'vue';
import { useTooltip } from '../composables/useTooltip.js';

const { tooltip } = useTooltip();

const style = computed(() => {
  const pad = 14;
  const w = 230;
  const flipX = tooltip.x + w + pad > window.innerWidth;
  const flipY = tooltip.y + 120 > window.innerHeight;
  return {
    left: `${flipX ? tooltip.x - w - pad : tooltip.x + pad}px`,
    top: `${flipY ? tooltip.y - 100 : tooltip.y + pad}px`,
  };
});
</script>

<template>
  <div v-if="tooltip.visible" class="tip mono" :style="style">
    <div v-if="tooltip.title" class="title">{{ tooltip.title }}</div>
    <div v-for="(row, i) in tooltip.rows" :key="i" class="row">
      <span class="k">{{ row[0] }}</span>
      <span class="v" :class="{ neg: row[2] === 'neg', amber: row[2] === 'amber' }">{{ row[1] }}</span>
    </div>
  </div>
</template>

<style scoped>
.tip {
  position: fixed;
  z-index: 9500;
  min-width: 150px;
  max-width: 230px;
  padding: 6px 8px;
  font-size: 10.5px;
  background: rgba(14, 16, 19, 0.96);
  border: 1px solid var(--border);
  border-top: 1px solid var(--amber);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}

.title {
  color: var(--text);
  margin-bottom: 4px;
  letter-spacing: 0.06em;
}

.row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  line-height: 1.6;
}

.k {
  color: var(--faint);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 9.5px;
}

.v {
  color: var(--text);
}

.v.neg {
  color: var(--red);
}

.v.amber {
  color: var(--amber);
}
</style>
