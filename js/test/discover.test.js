import { expect, test } from 'vitest';

import { earliestSearch, SEARCH_FLOOR } from '../src/discover.js';
import { ApiStatusError, Granularity, knownEarliestValidityDate, OctaplusClient } from '../src/index.js';

const KNOWN = '2023-04-11';
const TODAY = '2026-06-10';

function drive(available, known = KNOWN, today = TODAY) {
  const search = earliestSearch(known, today);
  const probes = [];
  let step = search.next();
  while (!step.done) {
    probes.push(step.value);
    step = search.next(available(step.value));
  }
  return { result: step.value, probes };
}

test('fast path confirms the known floor in two probes', () => {
  const { result, probes } = drive((d) => d >= KNOWN);
  expect(result).toBe(KNOWN);
  expect(probes).toEqual(['2023-04-11', '2023-04-10']);
});

test('finds a later floor by bisection without repeats', () => {
  const floor = '2024-03-15';
  const { result, probes } = drive((d) => d >= floor);
  expect(result).toBe(floor);
  expect(probes.length).toBeLessThanOrEqual(20);
  expect(new Set(probes).size).toBe(probes.length);
});

test('finds a backfilled earlier floor', () => {
  const floor = '2022-01-01';
  const { result } = drive((d) => d >= floor);
  expect(result).toBe(floor);
});

test('floor at the search lower bound', () => {
  const { result } = drive(() => true);
  expect(result).toBe(SEARCH_FLOOR);
});

test('only today available', () => {
  const { result } = drive((d) => d >= TODAY);
  expect(result).toBe(TODAY);
});

test('nothing available returns null in three probes', () => {
  const { result, probes } = drive(() => false);
  expect(result).toBeNull();
  expect(probes).toEqual([KNOWN, TODAY, '2026-06-09']);
});

function floorFetch(floor) {
  const calls = { count: 0 };
  const fetchImpl = async (url) => {
    calls.count += 1;
    const raw = new URL(url).searchParams.get('ValidityDate');
    const [d, m, y] = raw.split('/');
    const entry =
      `${y}-${m}-${d}` >= floor
        ? {
            ValidityDate: raw,
            PublicationDate: raw,
            PublicationTime: '14:30:00',
            CurrencyUnit: 'EUR',
            PriceMeasureUnit: 'MWh',
            Cotations: [{ Position: 1, TimeRange: '00 - 01', PriceAmount: '100,0' }],
            InFault: 0,
          }
        : { ValidityDate: raw, InFault: 1 };
    return new Response(JSON.stringify({ Cotations: [entry] }), { status: 200 });
  };
  return { fetchImpl, calls };
}

test('client discovers a synthetic floor', async () => {
  const floor = '2024-03-15';
  const { fetchImpl, calls } = floorFetch(floor);
  const client = new OctaplusClient({ fetch: fetchImpl });
  expect(await client.getEarliestValidityDate(Granularity.HOUR)).toBe(floor);
  expect(calls.count).toBeLessThanOrEqual(20);
});

test('client fast path makes exactly two fetch calls', async () => {
  const known = knownEarliestValidityDate(Granularity.HOUR);
  const { fetchImpl, calls } = floorFetch(known);
  const client = new OctaplusClient({ fetch: fetchImpl });
  expect(await client.getEarliestValidityDate(Granularity.HOUR)).toBe(known);
  expect(calls.count).toBe(2);
});

test('all-fault API returns null in three fetch calls', async () => {
  const { fetchImpl, calls } = floorFetch('9999-01-01');
  const client = new OctaplusClient({ fetch: fetchImpl });
  expect(await client.getEarliestValidityDate(Granularity.QUARTER_HOUR)).toBeNull();
  expect(calls.count).toBe(3);
});

test('probe HTTP 500 propagates as ApiStatusError', async () => {
  const fetchImpl = async () => new Response('boom', { status: 500 });
  const client = new OctaplusClient({ fetch: fetchImpl });
  await expect(client.getEarliestValidityDate()).rejects.toBeInstanceOf(ApiStatusError);
});
