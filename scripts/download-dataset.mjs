#!/usr/bin/env node
// Downloads the full Octaplus day-ahead price history into compact JSON
// snapshots consumed by the web app. Node >= 18, no install step needed.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Granularity, OctaplusClient } from '../js/src/index.js';

const RETRIES = 3;
const BASE_DELAY_MS = 1_000;
const MS_PER_DAY = 86_400_000;
const FILES = {
  [Granularity.HOUR]: 'hour.json',
  [Granularity.QUARTER_HOUR]: 'quarter_hour.json',
};

const utcToIso = (date) => date.toISOString().slice(0, 10);
const isoToUtc = (iso) => new Date(`${iso}T00:00:00Z`);
const addDays = (iso, n) => utcToIso(new Date(isoToUtc(iso).getTime() + n * MS_PER_DAY));
const todayIso = () => utcToIso(new Date());

function endOfMonth(iso) {
  const d = isoToUtc(iso);
  return utcToIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

function* monthlyChunks(startIso, endIso) {
  for (let cur = startIso; cur <= endIso; ) {
    const monthEnd = endOfMonth(cur);
    const chunkEnd = monthEnd < endIso ? monthEnd : endIso;
    yield [cur, chunkEnd];
    cur = addDays(chunkEnd, 1);
  }
}

async function withRetries(fn, label) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= RETRIES) throw err;
      const delayMs = BASE_DELAY_MS * 2 ** attempt;
      console.error(`${label}: ${err?.message ?? err} — retrying in ${delayMs} ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function buildSnapshot(client, granularity, generatedAt) {
  const floor = await withRetries(
    () => client.getEarliestValidityDate(granularity),
    `${granularity} floor discovery`,
  );
  if (floor === null) {
    throw new Error(`${granularity}: upstream reports no data available for any date`);
  }
  const tomorrow = addDays(generatedAt, 1);

  const days = [];
  for (const [from, to] of monthlyChunks(floor, tomorrow)) {
    const chunk = await withRetries(
      () => client.getQuotations(from, to, granularity),
      `${granularity} ${from}..${to}`,
    );
    for (const day of chunk) {
      if (!day.available) continue;
      const entry = { d: day.validityDate, p: day.prices.map((pt) => pt.price) };
      // sporadic blank slots leave holes; keep slot identity so time-of-day survives
      if (day.prices.some((pt, i) => pt.position !== i + 1)) {
        entry.pos = day.prices.map((pt) => pt.position);
      }
      days.push(entry);
    }
  }
  days.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));

  return {
    granularity,
    generatedAt,
    earliest: days[0]?.d ?? null,
    latest: days.at(-1)?.d ?? null,
    days,
  };
}

function parseArgs(argv) {
  let out = fileURLToPath(new URL('../web/public/data', import.meta.url));
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) {
      out = argv[++i];
    } else if (argv[i].startsWith('--out=')) {
      out = argv[i].slice('--out='.length);
    } else {
      console.error(`usage: download-dataset.mjs [--out <dir>]`);
      process.exit(2);
    }
  }
  return { out };
}

const { out } = parseArgs(process.argv.slice(2));
await mkdir(out, { recursive: true });

const client = new OctaplusClient({ timeoutMs: 30_000 });
const generatedAt = todayIso();

for (const granularity of [Granularity.HOUR, Granularity.QUARTER_HOUR]) {
  const snapshot = await buildSnapshot(client, granularity, generatedAt);
  if (snapshot.days.length === 0) {
    // exit non-zero without writing so CI keeps serving the committed snapshot
    throw new Error(`${granularity}: snapshot came back with zero days, refusing to write`);
  }
  const json = JSON.stringify(snapshot);
  const file = path.join(out, FILES[granularity]);
  await writeFile(file, json);
  const points = snapshot.days.reduce((n, day) => n + day.p.length, 0);
  console.log(
    `${granularity}: ${snapshot.days.length} days (${snapshot.earliest}..${snapshot.latest}), ` +
      `${points} points, ${Buffer.byteLength(json)} bytes -> ${file}`,
  );
}
