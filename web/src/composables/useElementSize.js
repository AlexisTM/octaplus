import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

export function useElementSize(elRef) {
  const width = ref(0);
  const height = ref(0);
  let ro = null;

  onMounted(() => {
    ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) {
        width.value = r.width;
        height.value = r.height;
      }
    });
    watch(
      elRef,
      (el, prev) => {
        if (prev) ro.unobserve(prev);
        if (el) ro.observe(el);
      },
      { immediate: true },
    );
  });

  onBeforeUnmount(() => ro?.disconnect());
  return { width, height };
}
