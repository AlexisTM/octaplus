import { checkedOrdinal } from './dates.js';
import { InvalidResponseError } from './errors.js';

/**
 * @typedef {Object} PricePoint
 * @property {number} position 1-based slot within the day
 * @property {string} timeRange opaque label, e.g. '23 - 24' or '23:45 - 24:00'
 * @property {number} price EUR/MWh; can be negative
 */

/**
 * @typedef {Object} DayQuotations
 * @property {string} validityDate 'YYYY-MM-DD'
 * @property {boolean} inFault
 * @property {boolean} available
 * @property {string | null} publicationDate 'YYYY-MM-DD', null when in fault
 * @property {string | null} publicationTime 'HH:MM:SS', null when in fault
 * @property {string | null} currencyUnit
 * @property {string | null} priceMeasureUnit
 * @property {readonly PricePoint[]} prices empty when in fault
 */

const WIRE_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const WIRE_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
// integer part is optional: the API emits ',01' for 0.01 EUR/MWh
const NUMBER_RE = /^-?(\d+(\.\d+)?|\.\d+)$/;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Parses a Belgian comma-decimal price string ('112,7175') to a Number. */
export function parsePrice(raw) {
  if (typeof raw !== 'string') {
    throw new InvalidResponseError(`expected price string, got ${JSON.stringify(raw)}`);
  }
  const normalized = raw.replace(',', '.');
  if (!NUMBER_RE.test(normalized)) {
    throw new InvalidResponseError(`unparseable price: ${JSON.stringify(raw)}`);
  }
  return Number(normalized);
}

function parseWireDate(raw) {
  if (typeof raw !== 'string') {
    throw new InvalidResponseError(`expected date string, got ${JSON.stringify(raw)}`);
  }
  const m = WIRE_DATE_RE.exec(raw);
  if (!m || checkedOrdinal(Number(m[3]), Number(m[2]), Number(m[1])) === null) {
    throw new InvalidResponseError(`unparseable date: ${JSON.stringify(raw)}`);
  }
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseWireTime(raw) {
  if (typeof raw !== 'string' || !WIRE_TIME_RE.test(raw)) {
    throw new InvalidResponseError(`unparseable time: ${JSON.stringify(raw)}`);
  }
  return raw;
}

function parsePoint(entry) {
  if (!isPlainObject(entry)) {
    throw new InvalidResponseError(`expected price point object, got ${JSON.stringify(entry)}`);
  }
  const { Position: position, TimeRange: timeRange } = entry;
  if (!Number.isInteger(position) || typeof timeRange !== 'string') {
    throw new InvalidResponseError(`malformed price point: ${JSON.stringify(entry)}`);
  }
  return Object.freeze({ position, timeRange, price: parsePrice(entry.PriceAmount) });
}

function parseDay(entry) {
  if (!isPlainObject(entry)) {
    throw new InvalidResponseError(`expected day object, got ${JSON.stringify(entry)}`);
  }
  const validityDate = parseWireDate(entry.ValidityDate);
  if (entry.InFault) {
    return Object.freeze({
      validityDate,
      inFault: true,
      available: false,
      publicationDate: null,
      publicationTime: null,
      currencyUnit: null,
      priceMeasureUnit: null,
      prices: Object.freeze([]),
    });
  }
  let points = entry.Cotations;
  if (!Array.isArray(points)) {
    throw new InvalidResponseError(`missing price points for ${validityDate}`);
  }
  // blank PriceAmount = missing slot (e.g. the skipped hour on spring DST days)
  points = points.filter(
    (p) => !(isPlainObject(p) && typeof p.PriceAmount === 'string' && p.PriceAmount.trim() === ''),
  );
  return Object.freeze({
    validityDate,
    inFault: false,
    available: true,
    publicationDate: parseWireDate(entry.PublicationDate),
    publicationTime: parseWireTime(entry.PublicationTime),
    currencyUnit: entry.CurrencyUnit ?? null,
    priceMeasureUnit: entry.PriceMeasureUnit ?? null,
    prices: Object.freeze(points.map(parsePoint)),
  });
}

/**
 * Parses a decoded GetTarDynCotations payload into one entry per day.
 * @param {unknown} payload
 * @returns {DayQuotations[]}
 */
export function parseResponse(payload) {
  if (!isPlainObject(payload) || !('Cotations' in payload)) {
    throw new InvalidResponseError(`unexpected response shape: ${JSON.stringify(payload)}`);
  }
  let days = payload.Cotations;
  if (isPlainObject(days)) days = [days]; // API returns a bare object for single-day responses
  if (!Array.isArray(days)) {
    throw new InvalidResponseError(`unexpected Cotations shape: ${JSON.stringify(days)}`);
  }
  return days.map(parseDay);
}
