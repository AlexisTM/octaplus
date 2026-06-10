const MS_PER_DAY = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (n) => String(n).padStart(2, '0');

/** Day number since the Unix epoch, or null when y/m/d is not a real calendar date. */
export function checkedOrdinal(year, month, day) {
  const t = new Date(Date.UTC(year, month - 1, day));
  if (t.getUTCFullYear() !== year || t.getUTCMonth() !== month - 1 || t.getUTCDate() !== day) {
    return null;
  }
  return t.getTime() / MS_PER_DAY;
}

/** @param {string} iso @returns {number | null} */
export function isoToOrdinal(iso) {
  const m = ISO_RE.exec(iso);
  if (!m) return null;
  return checkedOrdinal(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** @param {number} ordinal @returns {string} 'YYYY-MM-DD' */
export function ordinalToIso(ordinal) {
  const t = new Date(ordinal * MS_PER_DAY);
  return `${String(t.getUTCFullYear()).padStart(4, '0')}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/**
 * Normalizes a date input to 'YYYY-MM-DD'. Date objects use LOCAL
 * year/month/day — toISOString would shift across midnight UTC.
 * @param {string | Date} input
 * @returns {string}
 */
export function toIsoDate(input) {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new RangeError('invalid Date');
    return `${String(input.getFullYear()).padStart(4, '0')}-${pad2(input.getMonth() + 1)}-${pad2(input.getDate())}`;
  }
  if (typeof input === 'string') {
    if (isoToOrdinal(input) === null) {
      throw new RangeError(`expected a 'YYYY-MM-DD' date, got ${JSON.stringify(input)}`);
    }
    return input;
  }
  throw new TypeError(`expected a 'YYYY-MM-DD' string or Date, got ${typeof input}`);
}

/** @param {string} iso @returns {string} 'DD/MM/YYYY' as the API expects */
export function formatWireDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function todayIso() {
  return toIsoDate(new Date());
}
