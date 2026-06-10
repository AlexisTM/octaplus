import { isoToOrdinal, ordinalToIso } from './dates.js';

export const SEARCH_FLOOR = '2000-01-01';

/**
 * Yields 'YYYY-MM-DD' dates to probe, receives each date's availability via
 * next(bool), returns the earliest available date (null if nothing is
 * available). Assumes availability is a contiguous suffix: in-fault before
 * the floor, available from it onward.
 * @param {string} known known floor, 'YYYY-MM-DD'
 * @param {string} today 'YYYY-MM-DD'
 * @returns {Generator<string, string | null, boolean>}
 */
export function* earliestSearch(known, today) {
  const knownOrd = isoToOrdinal(known);
  let lo, hi;
  if (yield known) {
    if (!(yield ordinalToIso(knownOrd - 1))) return known;
    lo = isoToOrdinal(SEARCH_FLOOR);
    hi = knownOrd - 1;
  } else {
    hi = isoToOrdinal(today);
    if (!(yield today)) {
      hi -= 1;
      if (!(yield ordinalToIso(hi))) return null;
    }
    lo = knownOrd + 1;
  }
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (yield ordinalToIso(mid)) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return ordinalToIso(hi);
}
