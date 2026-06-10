import { ref } from 'vue';

// Module-level singletons: every panel reads the same control state.
const granularity = ref('HOUR');
const dateRange = ref({ from: null, to: null }); // null edge = data extent
const rollingWindow = ref(7);
const aggregate = ref('mean'); // mean | median | min | max
const hourBand = ref([0, 24]);
const weekdays = ref(new Set([1, 2, 3, 4, 5, 6, 7]));
const windowLength = ref(3); // hours, cheap-window finder
const unit = ref('mwh'); // mwh | kwh
const colorMode = ref('linear'); // linear | quantile

function toggleWeekday(d) {
  const next = new Set(weekdays.value);
  if (next.has(d)) next.delete(d);
  else next.add(d);
  weekdays.value = next; // replace: Set mutation is not reactive
}

export function useControls() {
  return {
    granularity,
    dateRange,
    rollingWindow,
    aggregate,
    hourBand,
    weekdays,
    windowLength,
    unit,
    colorMode,
    toggleWeekday,
  };
}
