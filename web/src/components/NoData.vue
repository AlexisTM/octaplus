<script setup>
defineProps({
  label: { type: String, default: 'NO DATA IN RANGE' },
  height: { type: Number, default: 160 },
});
</script>

<template>
  <div class="nodata mono" :style="{ height: `${height}px` }">
    <span>// {{ label }}</span>
  </div>
</template>

<style scoped>
.nodata {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--faint);
  border: 1px dashed var(--border);
  background: repeating-linear-gradient(
    -45deg,
    transparent 0 10px,
    rgba(255, 255, 255, 0.012) 10px 20px
  );
}
</style>
