import { describe, expect, it } from 'vitest';
import { normalizeSnapshot } from '../src/composables/usePriceData.js';

const seq = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe('normalizeSnapshot compact days', () => {
  it('expands a regular day with contiguous positions and uniform time ranges', () => {
    const [day] = normalizeSnapshot({ days: [{ d: '2026-06-10', p: seq(0, 23) }] });
    expect(day.validityDate).toBe('2026-06-10');
    expect(day.available).toBe(true);
    expect(day.prices).toHaveLength(24);
    expect(day.prices[0]).toEqual({ position: 1, timeRange: '00:00 - 01:00', price: 0 });
    expect(day.prices[23]).toEqual({ position: 24, timeRange: '23:00 - 24:00', price: 23 });
  });

  it('uses pos to keep slot identity across a mid-day hole', () => {
    // 24-slot day missing position 18 (blank '17 - 18' upstream)
    const pos = [...seq(1, 17), ...seq(19, 24)];
    const [day] = normalizeSnapshot({ days: [{ d: '2024-12-16', p: seq(0, 22), pos }] });
    expect(day.prices).toHaveLength(23);
    expect(day.prices[16]).toMatchObject({ position: 17, timeRange: '16:00 - 17:00' });
    expect(day.prices[17]).toMatchObject({ position: 19, timeRange: '18:00 - 19:00' });
    expect(day.prices[22]).toMatchObject({ position: 24, timeRange: '23:00 - 24:00' });
  });

  it('marks an empty day unavailable', () => {
    const [day] = normalizeSnapshot({ days: [{ d: '2026-06-15', p: [] }] });
    expect(day.available).toBe(false);
    expect(day.inFault).toBe(true);
  });
});
