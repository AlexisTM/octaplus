import { Granularity, knownEarliestValidityDate, OctaplusClient, parseResponse } from 'octaplus';
import { computed, shallowRef } from 'vue';
import { isoAddDays } from '../lib/analysis.js';
import { useControls } from './useControls.js';

const client = new OctaplusClient();

const emptyStore = () => ({
  phase: 'idle', // idle | loading | ready
  status: 'loading', // loading | snapshot | snapshot+live | live | live-failed
  snapshotDays: [],
  days: [],
  snapshotDate: null,
  liveDates: new Set(),
  deltaDays: 0,
  liveError: null,
});

const stores = {
  [Granularity.HOUR]: shallowRef(emptyStore()),
  [Granularity.QUARTER_HOUR]: shallowRef(emptyStore()),
};

function todayIso() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const hm = (h) => {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// compact snapshot entry {d: 'YYYY-MM-DD', p: [numbers], pos?: [ints]} ->
// DayQuotations-like; pos is present when blank slots upstream left holes,
// so slots after a hole keep their true position/time-of-day
function expandCompactDay(entry) {
  const values = entry.p ?? [];
  const pos = entry.pos ?? null;
  const slots = pos ? pos[pos.length - 1] : values.length;
  const prices = values.map((price, i) => {
    const position = pos ? pos[i] : i + 1;
    return {
      position,
      timeRange: `${hm(((position - 1) * 24) / slots)} - ${hm((position * 24) / slots)}`,
      price,
    };
  });
  return {
    validityDate: entry.d,
    inFault: prices.length === 0,
    available: prices.length > 0,
    publicationDate: null,
    publicationTime: null,
    currencyUnit: 'EUR',
    priceMeasureUnit: 'MWh',
    prices,
  };
}

/**
 * The snapshot agent writes {days: [{d, p: [numbers], pos?}]}; also accept a bare
 * DayQuotations array, a {days: [DayQuotations]} wrapper, or the raw payload.
 */
export function normalizeSnapshot(json) {
  let entries = json;
  if (entries && !Array.isArray(entries) && typeof entries === 'object') {
    if (Array.isArray(entries.days)) entries = entries.days;
    else if ('Cotations' in entries) return parseResponse(entries);
  }
  if (!Array.isArray(entries)) throw new Error('unrecognized snapshot shape');
  const first = entries[0];
  if (first && typeof first === 'object') {
    if ('ValidityDate' in first) return parseResponse({ Cotations: entries });
    if ('d' in first && 'p' in first) return entries.map(expandCompactDay);
  }
  return entries;
}

const usableDays = (days) =>
  days
    .filter((d) => d?.available && Array.isArray(d.prices) && d.prices.length > 0)
    .sort((a, b) => (a.validityDate < b.validityDate ? -1 : 1));

async function fetchSnapshot(granularity) {
  const file = granularity === Granularity.QUARTER_HOUR ? 'quarter_hour.json' : 'hour.json';
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`, { cache: 'no-cache' });
    // dev/SPA servers answer missing files with index.html — treat as no snapshot
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    return usableDays(normalizeSnapshot(await res.json()));
  } catch {
    return null;
  }
}

async function topUp(granularity) {
  const store = stores[granularity];
  const s = store.value;
  const today = todayIso();
  const floor = knownEarliestValidityDate(granularity);
  // no snapshot: pull a recent live window so the page still works standalone
  let from = s.snapshotDate ? isoAddDays(s.snapshotDate, 1) : isoAddDays(today, -89);
  if (from < floor) from = floor;
  const to = isoAddDays(today, 1);

  if (from > to) {
    store.value = { ...s, status: 'snapshot', deltaDays: 0, liveDates: new Set(), liveError: null };
    return;
  }
  try {
    const fetched = usableDays(await client.getQuotations(from, to, granularity));
    const liveDates = new Set(fetched.map((d) => d.validityDate));
    const merged = usableDays([
      ...s.snapshotDays.filter((d) => !liveDates.has(d.validityDate)),
      ...fetched,
    ]);
    store.value = {
      ...s,
      days: merged,
      liveDates,
      deltaDays: liveDates.size,
      liveError: null,
      status: s.snapshotDate ? (liveDates.size ? 'snapshot+live' : 'snapshot') : 'live',
    };
  } catch (err) {
    store.value = { ...s, days: s.snapshotDays, liveDates: new Set(), deltaDays: 0, liveError: err, status: 'live-failed' };
  }
}

async function ensureLoaded(granularity) {
  const store = stores[granularity];
  if (store.value.phase !== 'idle') return;
  store.value = { ...store.value, phase: 'loading' };
  const snapshot = await fetchSnapshot(granularity);
  const snapshotDays = snapshot ?? [];
  store.value = {
    ...store.value,
    phase: 'ready',
    snapshotDays,
    days: snapshotDays,
    snapshotDate: snapshotDays.length ? snapshotDays[snapshotDays.length - 1].validityDate : null,
  };
  await topUp(granularity);
}

export function usePriceData() {
  const { granularity } = useControls();
  const current = computed(() => stores[granularity.value].value);
  const reloadLive = () => topUp(granularity.value);
  return { current, ensureLoaded, reloadLive };
}
