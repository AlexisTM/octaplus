import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseResponse } from 'octaplus';
import { describe, expect, it } from 'vitest';
import {
  bestWindow,
  bestWindowDistribution,
  convertPrice,
  dailyAggregates,
  dailySpread,
  eurMwhToCentsKwh,
  fmtHour,
  fmtNum,
  fmtPct,
  histogram,
  isoAddDays,
  isoWeekday,
  negativeStats,
  percentiles,
  profileByTimeOfDay,
  rollingMean,
  rollingStd,
  slotHour,
  slotRecords,
  unitLabel,
} from '../src/lib/analysis.js';

const fixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../fixtures/${name}.json`, import.meta.url))));

function day(date, prices, n = prices.length) {
  return {
    validityDate: date,
    inFault: false,
    available: true,
    prices: prices.map((price, i) => ({
      position: i + 1,
      timeRange: `${i} - ${i + 1}`,
      price,
    })),
  };
}

const faultDay = (date) => ({ validityDate: date, inFault: true, available: false, prices: [] });

describe('slotHour / isoWeekday / isoAddDays', () => {
  it('maps slot i of an N-point day to fractional hour i*24/N', () => {
    expect(slotHour(0, 24)).toBe(0);
    expect(slotHour(12, 24)).toBe(12);
    expect(slotHour(48, 96)).toBe(12);
    expect(slotHour(11, 23)).toBeCloseTo(11.478, 3);
    expect(slotHour(24, 25)).toBeCloseTo(23.04, 2);
  });

  it('computes ISO weekday without timezone drift', () => {
    expect(isoWeekday('2026-06-10')).toBe(3); // Wednesday
    expect(isoWeekday('2026-06-14')).toBe(7); // Sunday
    expect(isoWeekday('2026-06-08')).toBe(1); // Monday
  });

  it('adds days across month and DST boundaries', () => {
    expect(isoAddDays('2026-05-31', 1)).toBe('2026-06-01');
    expect(isoAddDays('2026-03-29', -1)).toBe('2026-03-28');
  });
});

describe('dailyAggregates', () => {
  it('computes mean/min/max/median per day and skips in-fault days', () => {
    const out = dailyAggregates([day('2026-06-01', [10, 20, 30, 40]), faultDay('2026-06-02')]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ date: '2026-06-01', mean: 25, min: 10, max: 40, median: 25, count: 4 });
  });

  it('takes the middle element for odd counts', () => {
    expect(dailyAggregates([day('2026-06-01', [5, 1, 9])])[0].median).toBe(5);
  });

  it('handles negative prices', () => {
    const out = dailyAggregates([day('2026-06-01', [-50, -10, 20])])[0];
    expect(out.min).toBe(-50);
    expect(out.mean).toBeCloseTo(-13.3333, 3);
  });

  it('matches the captured hourly fixture', () => {
    const days = parseResponse(fixture('hour_two_days'));
    const out = dailyAggregates(days);
    expect(out).toHaveLength(2);
    expect(out[0].count).toBe(24);
    expect(out[0].min).toBeLessThanOrEqual(out[0].median);
    expect(out[0].median).toBeLessThanOrEqual(out[0].max);
  });
});

describe('rollingMean', () => {
  it('uses partial windows at the head', () => {
    expect(rollingMean([1, 2, 3, 4], 3)).toEqual([1, 1.5, 2, 3]);
  });

  it('is identity for window 1', () => {
    expect(rollingMean([3, 1, 4], 1)).toEqual([3, 1, 4]);
  });

  it('degrades to a cumulative mean when window exceeds length', () => {
    expect(rollingMean([2, 4], 10)).toEqual([2, 3]);
  });

  it('returns [] for empty input', () => {
    expect(rollingMean([], 5)).toEqual([]);
  });
});

describe('rollingStd', () => {
  it('is zero for constant series', () => {
    expect(rollingStd([5, 5, 5], 2)).toEqual([0, 0, 0]);
  });

  it('computes trailing population std-dev', () => {
    const out = rollingStd([1, 3, 1, 3], 2);
    expect(out[0]).toBe(0);
    expect(out[1]).toBeCloseTo(1);
    expect(out[3]).toBeCloseTo(1);
  });
});

describe('profileByTimeOfDay', () => {
  it('maps a regular 24-point day slot-for-slot', () => {
    const prices = Array.from({ length: 24 }, (_, i) => i * 10);
    const out = profileByTimeOfDay([day('2026-06-01', prices)]);
    expect(out).toHaveLength(24);
    expect(out[0]).toMatchObject({ hour: 0, mean: 0, count: 1 });
    expect(out[23]).toMatchObject({ hour: 23, mean: 230, count: 1 });
  });

  it('bins a 23-point DST day fractionally, leaving one empty bin', () => {
    const out = profileByTimeOfDay([day('2026-03-29', Array(23).fill(100))], { slots: 24 });
    expect(out.filter((b) => b.count === 1)).toHaveLength(23);
    const empty = out.filter((b) => b.count === 0);
    expect(empty).toHaveLength(1);
    expect(empty[0].mean).toBeNull();
  });

  it('merges two slots of a 25-point DST day into one bin', () => {
    const out = profileByTimeOfDay([day('2026-10-25', Array(25).fill(80))], { slots: 24 });
    expect(out.reduce((a, b) => a + b.count, 0)).toBe(25);
    expect(out.filter((b) => b.count === 2)).toHaveLength(1);
  });

  it('averages across days and filters by weekday', () => {
    const days = [
      day('2026-06-08', [10, 20]), // Monday
      day('2026-06-13', [30, 40]), // Saturday
    ];
    const all = profileByTimeOfDay(days, { slots: 2 });
    expect(all[0].mean).toBe(20);
    const weekend = profileByTimeOfDay(days, { weekdays: [6, 7], slots: 2 });
    expect(weekend[0].mean).toBe(30);
    expect(weekend[1].mean).toBe(40);
  });

  it('handles the 96-point quarter-hour fixture', () => {
    const days = parseResponse(fixture('quarter_hour_one_day'));
    const out = profileByTimeOfDay(days);
    expect(out).toHaveLength(96);
    expect(out[4].hour).toBe(1);
  });
});

describe('histogram', () => {
  it('bins uniformly and puts the max in the last bin', () => {
    const { bins, total } = histogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 10], 5);
    expect(bins).toHaveLength(5);
    expect(total).toBe(10);
    expect(bins[0]).toMatchObject({ x0: 0, x1: 2, count: 2 });
    expect(bins[4].count).toBe(2); // 8 and 10
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(10);
  });

  it('spans negative to positive', () => {
    const { bins, min } = histogram([-10, 0, 10], 2);
    expect(min).toBe(-10);
    expect(bins[0].x0).toBe(-10);
    expect(bins[1].x1).toBe(10);
  });

  it('collapses identical values into a single bin', () => {
    expect(histogram([7, 7, 7], 10).bins).toEqual([{ x0: 7, x1: 7, count: 3 }]);
  });

  it('is empty for empty input', () => {
    expect(histogram([], 10)).toMatchObject({ bins: [], total: 0 });
  });
});

describe('percentiles', () => {
  it('interpolates linearly (R-7)', () => {
    expect(percentiles([10, 20, 30, 40], [0.05, 0.5, 0.95])).toEqual([11.5, 25, 38.5]);
  });

  it('sorts unsorted input and handles extremes', () => {
    expect(percentiles([40, 10, 30, 20], [0, 1])).toEqual([10, 40]);
  });

  it('returns the single element for any p', () => {
    expect(percentiles([42], [0.05, 0.95])).toEqual([42, 42]);
  });

  it('returns nulls for empty input', () => {
    expect(percentiles([], [0.5])).toEqual([null]);
  });
});

describe('negativeStats', () => {
  it('counts negative slots per day and overall', () => {
    const out = negativeStats([
      day('2026-06-01', [-5, -1, 10, 20]),
      day('2026-06-02', [10, 20, 30, 40]),
      faultDay('2026-06-03'),
    ]);
    expect(out.negativeCount).toBe(2);
    expect(out.totalCount).toBe(8);
    expect(out.share).toBe(0.25);
    expect(out.perDay[0]).toMatchObject({ date: '2026-06-01', count: 2, share: 0.5 });
    expect(out.perDay[1].count).toBe(0);
  });

  it('returns zero share for no data', () => {
    expect(negativeStats([]).share).toBe(0);
  });
});

describe('dailySpread', () => {
  it('computes max-min per day', () => {
    const out = dailySpread([day('2026-06-01', [-10, 0, 90])]);
    expect(out[0]).toEqual({ date: '2026-06-01', spread: 100, min: -10, max: 90 });
  });
});

describe('bestWindow', () => {
  it('finds the cheapest consecutive window', () => {
    expect(bestWindow([50, 10, 20, 30, 5, 5], 2)).toEqual({ startIndex: 4, avg: 5 });
  });

  it('resolves ties to the earliest start', () => {
    expect(bestWindow([10, 10, 50, 10, 10], 2)).toEqual({ startIndex: 0, avg: 10 });
  });

  it('returns null when n exceeds the day length or is < 1', () => {
    expect(bestWindow([1, 2, 3], 4)).toBeNull();
    expect(bestWindow([1, 2, 3], 0)).toBeNull();
  });

  it('covers the whole day when n equals the length', () => {
    expect(bestWindow([10, 20, 30], 3)).toEqual({ startIndex: 0, avg: 20 });
  });

  it('prefers negative-price windows', () => {
    expect(bestWindow([100, -50, -50, 100], 2)).toEqual({ startIndex: 1, avg: -50 });
  });
});

describe('bestWindowDistribution', () => {
  it('bins start hours across days and reports savings', () => {
    const prices = Array.from({ length: 24 }, (_, i) => (i >= 13 && i < 16 ? 10 : 100));
    const { counts, results } = bestWindowDistribution([day('2026-06-01', prices)], 3);
    expect(counts[13]).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    expect(results[0].avg).toBe(10);
    expect(results[0].dayMean).toBeCloseTo(88.75);
    expect(results[0].savingsAbs).toBeCloseTo(78.75);
    expect(results[0].savingsPct).toBeCloseTo(88.73, 1);
  });

  it('derives the slot count per day (quarter-hour: 3h = 12 slots)', () => {
    const prices = Array.from({ length: 96 }, (_, i) => (i >= 52 && i < 64 ? 1 : 50));
    const { results } = bestWindowDistribution([day('2026-06-01', prices)], 3);
    expect(results[0].windowSlots).toBe(12);
    expect(results[0].startIndex).toBe(52);
    expect(results[0].startHour).toBe(13);
  });

  it('skips days the derived window cannot fit', () => {
    const { counts, results } = bestWindowDistribution([day('2026-06-01', Array(24).fill(5))], 25);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(0);
    expect(results).toEqual([]);
  });

  it('nulls savingsPct when the day mean is non-positive', () => {
    const { results } = bestWindowDistribution([day('2026-06-02', Array(24).fill(-10))], 6);
    expect(results[0].savingsPct).toBeNull();
    expect(results[0].savingsAbs).toBe(0);
  });

  it('handles a 23-point DST day with a fractional start hour', () => {
    const prices = Array(23).fill(50);
    prices[22] = 1;
    const { results } = bestWindowDistribution([day('2026-03-29', prices)], 1);
    expect(results[0].startHour).toBeCloseTo(22.956, 2);
  });
});

describe('slotRecords', () => {
  it('filters by hour band and weekday', () => {
    const days = [
      day('2026-06-08', Array.from({ length: 24 }, (_, i) => i)), // Monday
      day('2026-06-13', Array.from({ length: 24 }, (_, i) => i + 100)), // Saturday
    ];
    const out = slotRecords(days, { hourBand: [8, 10], weekdays: [1] });
    expect(out.map((r) => r.price)).toEqual([8, 9]);
    expect(out[0].weekday).toBe(1);
  });

  it('uses the in-fault fixture gracefully', () => {
    expect(slotRecords(parseResponse(fixture('in_fault_days')))).toEqual([]);
  });
});

describe('units & formatters', () => {
  it('converts EUR/MWh to c€/kWh by dividing by 10', () => {
    expect(eurMwhToCentsKwh(100)).toBe(10);
    expect(convertPrice(112.7175, 'kwh')).toBeCloseTo(11.27175);
    expect(convertPrice(112.7175, 'mwh')).toBe(112.7175);
    expect(convertPrice(null, 'kwh')).toBeNull();
    expect(unitLabel('kwh')).toBe('c€/kWh');
    expect(unitLabel('mwh')).toBe('EUR/MWh');
  });

  it('never emits NaN strings', () => {
    expect(fmtNum(NaN)).toBe('—');
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum(Infinity)).toBe('—');
    expect(fmtNum(12.345, 1)).toBe('12.3');
    expect(fmtPct(NaN)).toBe('—');
    expect(fmtPct(88.726, 1)).toBe('88.7%');
    expect(fmtHour(13.25)).toBe('13:15');
    expect(fmtHour(NaN)).toBe('—');
  });
});
