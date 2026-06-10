export const Granularity = Object.freeze({
  HOUR: 'HOUR',
  QUARTER_HOUR: 'QUARTER_HOUR',
});

// Observed 10/06/2026; the operator backfills, so treat as hints —
// OctaplusClient#getEarliestValidityDate() discovers the live floor.
const KNOWN_EARLIEST = Object.freeze({
  HOUR: '2023-04-11',
  QUARTER_HOUR: '2025-11-01',
});

/** @param {string} granularity @returns {'HOUR' | 'QUARTER_HOUR'} */
export function assertGranularity(granularity) {
  if (granularity !== Granularity.HOUR && granularity !== Granularity.QUARTER_HOUR) {
    throw new RangeError(`invalid granularity: ${JSON.stringify(granularity)}`);
  }
  return granularity;
}

/** @param {'HOUR' | 'QUARTER_HOUR'} granularity @returns {string} 'YYYY-MM-DD' */
export function knownEarliestValidityDate(granularity) {
  return KNOWN_EARLIEST[assertGranularity(granularity)];
}
