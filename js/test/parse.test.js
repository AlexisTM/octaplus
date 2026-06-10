import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

import { InvalidResponseError, parseResponse } from '../src/index.js';
import { parsePrice } from '../src/parse.js';

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8'));

test('hour fixture parses two days of 24 points', () => {
  const days = parseResponse(load('hour_two_days.json'));
  expect(days).toHaveLength(2);
  const first = days[0];
  expect(first.validityDate).toBe('2026-06-10');
  expect(first.publicationDate).toBe('2026-06-09');
  expect(first.publicationTime).toBe('14:30:00');
  expect(first.currencyUnit).toBe('EUR');
  expect(first.priceMeasureUnit).toBe('MWh');
  expect(first.available).toBe(true);
  expect(first.inFault).toBe(false);
  for (const day of days) expect(day.prices).toHaveLength(24);
  expect(first.prices[0]).toEqual({ position: 1, timeRange: '00 - 01', price: 112.7175 });
  expect(Object.isFrozen(first)).toBe(true);
  expect(Object.isFrozen(first.prices)).toBe(true);
});

test('comma decimal with long float tail round-trips exactly', () => {
  const days = parseResponse(load('hour_two_days.json'));
  expect(days[0].prices[1].price).toBe(107.28999999999999);
});

test('quarter-hour fixture parses one day of 96 points', () => {
  const days = parseResponse(load('quarter_hour_one_day.json'));
  expect(days).toHaveLength(1);
  expect(days[0].prices).toHaveLength(96);
  expect(days[0].prices[0].timeRange).toBe('00:00 - 00:15');
});

test('in-fault days are normalized to empty prices and null metadata', () => {
  const days = parseResponse(load('in_fault_days.json'));
  expect(days).toHaveLength(2);
  for (const day of days) {
    expect(day.inFault).toBe(true);
    expect(day.available).toBe(false);
    expect(day.prices).toEqual([]);
    expect(day.publicationDate).toBeNull();
    expect(day.publicationTime).toBeNull();
    expect(day.currencyUnit).toBeNull();
    expect(day.priceMeasureUnit).toBeNull();
  }
  expect(days[0].validityDate).toBe('2026-06-15');
});

test('mixed fixture splits one available and two in-fault days', () => {
  const days = parseResponse(load('mixed_days.json'));
  expect(days).toHaveLength(3);
  const available = days.filter((d) => d.available);
  const unavailable = days.filter((d) => !d.available);
  expect(available).toHaveLength(1);
  expect(unavailable).toHaveLength(2);
  expect(available[0].prices).toHaveLength(24);
});

test('single-object Cotations is treated as a one-day list', () => {
  const payload = load('quarter_hour_one_day.json');
  payload.Cotations = payload.Cotations[0];
  const days = parseResponse(payload);
  expect(days).toHaveLength(1);
  expect(days[0].prices).toHaveLength(96);
});

test('InFault accepts bool, int, and missing means available', () => {
  const day = {
    ValidityDate: '10/06/2026',
    PublicationDate: '09/06/2026',
    PublicationTime: '14:30:00',
    Cotations: [{ Position: 1, TimeRange: '00 - 01', PriceAmount: '-0,07' }],
  };
  expect(parseResponse({ Cotations: [{ ValidityDate: '15/06/2026', InFault: true }] })[0].inFault).toBe(true);
  expect(parseResponse({ Cotations: [{ ValidityDate: '15/06/2026', InFault: 1 }] })[0].inFault).toBe(true);
  const parsed = parseResponse({ Cotations: [day] })[0];
  expect(parsed.available).toBe(true);
  expect(parsed.prices[0].price).toBe(-0.07);
});

test('blank-price points are dropped as missing slots', () => {
  // seen live: spring DST days (e.g. 30/03/2025) carry the skipped hour
  // as PriceAmount '' instead of omitting the slot
  const day = {
    ValidityDate: '30/03/2025',
    PublicationDate: '29/03/2025',
    PublicationTime: '14:30:00',
    Cotations: [
      { Position: 1, TimeRange: '00 - 01', PriceAmount: '50,5' },
      { Position: 2, TimeRange: '02 - 03', PriceAmount: '' },
      { Position: 3, TimeRange: '03 - 04', PriceAmount: '60' },
    ],
  };
  const parsed = parseResponse({ Cotations: [day] })[0];
  expect(parsed.prices.map((p) => p.position)).toEqual([1, 3]);
  expect(parsed.prices.map((p) => p.price)).toEqual([50.5, 60]);
});

test('parsePrice handles comma decimals, integers, and negatives', () => {
  expect(parsePrice('112,7175')).toBe(112.7175);
  expect(parsePrice('109')).toBe(109);
  expect(parsePrice('-5,25')).toBe(-5.25);
  // seen live in April 2023 history: no integer part before the comma
  expect(parsePrice(',01')).toBe(0.01);
  expect(parsePrice('-,5')).toBe(-0.5);
});

test.each([
  [[]],
  [{}],
  [{ Cotations: 'nope' }],
  [{ Cotations: [{ ValidityDate: 'not-a-date', InFault: 1 }] }],
  [{ Cotations: [{ ValidityDate: '10/06/2026', InFault: 0, PublicationDate: '09/06/2026', PublicationTime: '14:30:00', Cotations: [{ Position: 1, TimeRange: '00 - 01', PriceAmount: 'abc' }] }] }],
  [{ Cotations: [{ ValidityDate: '10/06/2026', InFault: 0 }] }],
])('invalid payload %# raises InvalidResponseError', (payload) => {
  expect(() => parseResponse(payload)).toThrow(InvalidResponseError);
});
