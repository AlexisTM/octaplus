import { formatWireDate, todayIso, toIsoDate } from './dates.js';
import { earliestSearch } from './discover.js';
import {
  ApiStatusError,
  InvalidDateRangeError,
  InvalidResponseError,
  TransportError,
} from './errors.js';
import { assertGranularity, Granularity, knownEarliestValidityDate } from './granularity.js';
import { parseResponse } from './parse.js';

export const DEFAULT_BASE_URL = 'https://srv.octaplus.be';
export const DEFAULT_TIMEOUT_MS = 10_000;
const PATH = '/websiterest/GetTarDynCotations';

/** @typedef {import('./parse.js').DayQuotations} DayQuotations */

export class OctaplusClient {
  #baseUrl;
  #timeoutMs;
  #fetch;

  /**
   * @param {Object} [options]
   * @param {string} [options.baseUrl]
   * @param {number} [options.timeoutMs]
   * @param {typeof fetch} [options.fetch] injectable for tests
   */
  constructor({ baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS, fetch: fetchImpl } = {}) {
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#timeoutMs = timeoutMs;
    this.#fetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  }

  /**
   * @param {string | Date} start
   * @param {string | Date | null} [end] defaults to start
   * @param {'HOUR' | 'QUARTER_HOUR'} [granularity]
   * @returns {Promise<DayQuotations[]>} one entry per day, start..end inclusive
   */
  async getQuotations(start, end = null, granularity = Granularity.HOUR) {
    assertGranularity(granularity);
    const startIso = toIsoDate(start);
    const endIso = end == null ? startIso : toIsoDate(end);
    if (endIso < startIso) {
      throw new InvalidDateRangeError(`end date ${endIso} is before start date ${startIso}`);
    }

    const url = new URL(this.#baseUrl + PATH);
    url.search = new URLSearchParams({
      ValidityDate: formatWireDate(startIso),
      ToValidityDate: formatWireDate(endIso),
      Granularity: granularity,
      CallStating: '0',
    });

    const signal =
      Number.isFinite(this.#timeoutMs) && this.#timeoutMs > 0
        ? AbortSignal.timeout(this.#timeoutMs)
        : undefined;
    let response;
    try {
      response = await this.#fetch(url.toString(), { signal });
    } catch (err) {
      throw new TransportError(err?.message ?? String(err), { cause: err });
    }
    if (!(response.status >= 200 && response.status < 300)) {
      throw new ApiStatusError(`API returned HTTP ${response.status}`, response.status);
    }
    let payload;
    try {
      payload = await response.json();
    } catch (err) {
      if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
        throw new TransportError(err.message, { cause: err });
      }
      throw new InvalidResponseError(`response body is not valid JSON: ${err?.message ?? err}`, {
        cause: err,
      });
    }
    return parseResponse(payload);
  }

  /**
   * @param {string | Date} day
   * @param {'HOUR' | 'QUARTER_HOUR'} [granularity]
   * @returns {Promise<DayQuotations>}
   */
  async getDay(day, granularity = Granularity.HOUR) {
    const dayIso = toIsoDate(day);
    const days = await this.getQuotations(dayIso, dayIso, granularity);
    if (days.length !== 1) {
      throw new InvalidResponseError(`expected 1 day entry for ${dayIso}, got ${days.length}`);
    }
    return days[0];
  }

  /**
   * Probes the live API for the earliest day with data: 2 requests when the
   * known floor still holds, ~15 when it moved. Probe errors propagate.
   * @param {'HOUR' | 'QUARTER_HOUR'} [granularity]
   * @returns {Promise<string | null>} 'YYYY-MM-DD', or null when no day has data
   */
  async getEarliestValidityDate(granularity = Granularity.HOUR) {
    const search = earliestSearch(knownEarliestValidityDate(granularity), todayIso());
    let step = search.next();
    while (!step.done) {
      const day = await this.getDay(step.value, granularity);
      step = search.next(day.available);
    }
    return step.value;
  }
}
