import { computed } from 'vue';
import {
  convertPrice,
  isoWeekday,
  percentiles,
  slotRecords,
  unitLabel,
} from '../lib/analysis.js';
import { useControls } from './useControls.js';
import { usePriceData } from './usePriceData.js';

export function useSelection() {
  const { dateRange, weekdays, hourBand, unit } = useControls();
  const { current } = usePriceData();

  const allDays = computed(() => current.value.days);

  const extent = computed(() => {
    const days = allDays.value;
    if (!days.length) return null;
    return { from: days[0].validityDate, to: days[days.length - 1].validityDate };
  });

  const resolvedRange = computed(() => {
    if (!extent.value) return null;
    return {
      from: dateRange.value.from ?? extent.value.from,
      to: dateRange.value.to ?? extent.value.to,
    };
  });

  // THE filtered selection every panel derives from
  const selectedDays = computed(() => {
    const r = resolvedRange.value;
    if (!r) return [];
    const wd = weekdays.value;
    return allDays.value.filter(
      (d) =>
        d.validityDate >= r.from && d.validityDate <= r.to && wd.has(isoWeekday(d.validityDate)),
    );
  });

  // flat slot records, hour-band filtered — feeds KPIs and the distribution
  const records = computed(() => slotRecords(selectedDays.value, { hourBand: hourBand.value }));

  const conv = (v) => convertPrice(v, unit.value);

  const kpis = computed(() => {
    const recs = records.value;
    if (!recs.length) return null;
    let sum = 0;
    let negatives = 0;
    let minRec = recs[0];
    let maxRec = recs[0];
    for (const r of recs) {
      sum += r.price;
      if (r.price < 0) negatives += 1;
      if (r.price < minRec.price) minRec = r;
      if (r.price > maxRec.price) maxRec = r;
    }
    const [p5, p50, p95] = percentiles(recs.map((r) => r.price), [0.05, 0.5, 0.95]);
    // spread per day within the hour band, then averaged
    const byDay = new Map();
    for (const r of recs) {
      const cur = byDay.get(r.date);
      if (!cur) byDay.set(r.date, { min: r.price, max: r.price });
      else {
        if (r.price < cur.min) cur.min = r.price;
        if (r.price > cur.max) cur.max = r.price;
      }
    }
    let spreadSum = 0;
    for (const { min, max } of byDay.values()) spreadSum += max - min;
    return {
      mean: sum / recs.length,
      median: p50,
      p5,
      p95,
      min: { value: minRec.price, date: minRec.date, timeRange: minRec.timeRange },
      max: { value: maxRec.price, date: maxRec.date, timeRange: maxRec.timeRange },
      negativeShare: (negatives / recs.length) * 100,
      negativeCount: negatives,
      meanSpread: spreadSum / byDay.size,
      slotCount: recs.length,
      dayCount: byDay.size,
    };
  });

  return {
    allDays,
    extent,
    resolvedRange,
    selectedDays,
    records,
    kpis,
    conv,
    unitText: computed(() => unitLabel(unit.value)),
  };
}
