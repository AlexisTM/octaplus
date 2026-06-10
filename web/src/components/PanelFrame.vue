<script setup>
defineProps({
  code: { type: String, required: true },
  title: { type: String, required: true },
});
</script>

<template>
  <section class="panel">
    <header class="head">
      <span class="code mono">{{ code }}</span>
      <h2 class="title">{{ title }}</h2>
      <div class="meta mono"><slot name="meta" /></div>
    </header>
    <div class="body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 12px 7px;
  border-bottom: 1px solid var(--border-soft);
}

.code {
  font-size: 10px;
  color: var(--amber);
  border: 1px solid rgba(255, 176, 0, 0.35);
  padding: 0 4px;
  line-height: 16px;
}

.title {
  margin: 0;
  font-family: var(--display);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text);
}

.meta {
  margin-left: auto;
  font-size: 10px;
  color: var(--faint);
  display: flex;
  gap: 12px;
}

.body {
  padding: 10px 12px 12px;
}
</style>
