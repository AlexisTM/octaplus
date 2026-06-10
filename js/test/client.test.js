import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

import {
  ApiStatusError,
  Granularity,
  InvalidDateRangeError,
  InvalidResponseError,
  OctaplusClient,
  TransportError,
} from '../src/index.js';

const read = (name) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');

const HOUR_BODY = read('hour_two_days.json');
const ONE_DAY_BODY = read('quarter_hour_one_day.json');

function fixedFetch(body, status = 200) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: new URL(url), options });
    return new Response(body, { status });
  };
  return { fetchImpl, calls };
}

const client = (fetchImpl, extra = {}) => new OctaplusClient({ fetch: fetchImpl, ...extra });

test('query params are exact, ToValidityDate defaults to start', async () => {
  const { fetchImpl, calls } = fixedFetch(HOUR_BODY);
  const days = await client(fetchImpl).getQuotations('2026-06-10');
  expect(calls).toHaveLength(1);
  expect(calls[0].url.pathname).toBe('/websiterest/GetTarDynCotations');
  expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({
    ValidityDate: '10/06/2026',
    ToValidityDate: '10/06/2026',
    Granularity: 'HOUR',
    CallStating: '0',
  });
  expect(days).toHaveLength(2);
  expect(days[0].prices[0].price).toBe(112.7175);
});

test('quarter-hour wire string and explicit end date', async () => {
  const { fetchImpl, calls } = fixedFetch(ONE_DAY_BODY);
  await client(fetchImpl).getQuotations('2026-06-10', '2026-06-12', Granularity.QUARTER_HOUR);
  const params = Object.fromEntries(calls[0].url.searchParams);
  expect(params.Granularity).toBe('QUARTER_HOUR');
  expect(params.ToValidityDate).toBe('12/06/2026');
});

test('Date inputs use local year/month/day', async () => {
  const { fetchImpl, calls } = fixedFetch(HOUR_BODY);
  await client(fetchImpl).getQuotations(new Date(2026, 5, 10, 0, 30));
  const params = Object.fromEntries(calls[0].url.searchParams);
  expect(params.ValidityDate).toBe('10/06/2026');
  expect(params.ToValidityDate).toBe('10/06/2026');
});

test('HTTP 500 rejects with ApiStatusError carrying status', async () => {
  const { fetchImpl } = fixedFetch('boom', 500);
  const err = await client(fetchImpl).getQuotations('2026-06-10').catch((e) => e);
  expect(err).toBeInstanceOf(ApiStatusError);
  expect(err.status).toBe(500);
});

test('network failure rejects with TransportError', async () => {
  const fetchImpl = async () => {
    throw new TypeError('fetch failed');
  };
  await expect(client(fetchImpl).getQuotations('2026-06-10')).rejects.toBeInstanceOf(TransportError);
});

test('timeout abort rejects with TransportError', async () => {
  const fetchImpl = (url, { signal }) =>
    new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    });
  await expect(
    client(fetchImpl, { timeoutMs: 5 }).getQuotations('2026-06-10'),
  ).rejects.toBeInstanceOf(TransportError);
});

test('garbage body rejects with InvalidResponseError', async () => {
  const { fetchImpl } = fixedFetch('<html>not json</html>');
  await expect(client(fetchImpl).getQuotations('2026-06-10')).rejects.toBeInstanceOf(
    InvalidResponseError,
  );
});

test('getDay returns the single day and pins start=end', async () => {
  const { fetchImpl, calls } = fixedFetch(ONE_DAY_BODY);
  const day = await client(fetchImpl).getDay('2026-06-10', Granularity.QUARTER_HOUR);
  expect(day.validityDate).toBe('2026-06-10');
  expect(day.prices).toHaveLength(96);
  const params = Object.fromEntries(calls[0].url.searchParams);
  expect(params.ValidityDate).toBe('10/06/2026');
  expect(params.ToValidityDate).toBe('10/06/2026');
});

test('getDay with wrong entry count rejects with InvalidResponseError', async () => {
  const { fetchImpl } = fixedFetch(HOUR_BODY);
  await expect(client(fetchImpl).getDay('2026-06-10')).rejects.toBeInstanceOf(
    InvalidResponseError,
  );
});

test('end before start rejects with InvalidDateRangeError before any fetch', async () => {
  const { fetchImpl, calls } = fixedFetch(HOUR_BODY);
  await expect(
    client(fetchImpl).getQuotations('2026-06-10', '2026-06-09'),
  ).rejects.toBeInstanceOf(InvalidDateRangeError);
  expect(calls).toHaveLength(0);
});
