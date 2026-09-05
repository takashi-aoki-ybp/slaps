#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp');

const DEFAULT_PRODUCTION_URL = 'https://slaps.tokyo';
const DEFAULT_EXPECTED = 10;

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (arg === '--self-test') {
      options.selfTest = true;
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) throw new Error(`Unsupported argument: ${arg}`);
    options[match[1]] = match[2];
  }
  return options;
}

function jstDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function songDate(song) {
  const date = new Date(song.created_at);
  return Number.isNaN(date.getTime()) ? null : jstDate(date);
}

function dailySlapsSongs(songs, date) {
  return songs.filter((song) => song.user_name === 'SLAPS' && songDate(song) === date);
}

function duplicateIds(songs) {
  const seen = new Set();
  const duplicates = new Set();
  for (const song of songs) {
    if (seen.has(song.youtube_id)) duplicates.add(song.youtube_id);
    seen.add(song.youtube_id);
  }
  return [...duplicates];
}

function compareDailyState({ localSongs, productionSongs, baseline, date, expected }) {
  const errors = [];
  const localDuplicates = duplicateIds(localSongs);
  const productionDuplicates = duplicateIds(productionSongs);
  const localDaily = dailySlapsSongs(localSongs, date);
  const productionDaily = dailySlapsSongs(productionSongs, date);
  const localDailyIds = new Set(localDaily.map((song) => song.youtube_id));
  const productionDailyIds = new Set(productionDaily.map((song) => song.youtube_id));

  if (localDuplicates.length) errors.push(`local duplicate YouTube IDs: ${localDuplicates.join(', ')}`);
  if (productionDuplicates.length) errors.push(`production duplicate YouTube IDs: ${productionDuplicates.join(', ')}`);
  if (localDaily.length !== expected) errors.push(`local daily SLAPS count is ${localDaily.length}, expected ${expected}`);
  if (productionDaily.length !== expected) errors.push(`production daily SLAPS count is ${productionDaily.length}, expected ${expected}`);

  const missingInProduction = [...localDailyIds].filter((id) => !productionDailyIds.has(id));
  const unexpectedInProduction = [...productionDailyIds].filter((id) => !localDailyIds.has(id));
  if (missingInProduction.length) errors.push(`daily IDs missing in production: ${missingInProduction.join(', ')}`);
  if (unexpectedInProduction.length) errors.push(`unexpected production daily IDs: ${unexpectedInProduction.join(', ')}`);

  let baselineResult = null;
  if (baseline) {
    if (baseline.date !== date) errors.push(`baseline date is ${baseline.date}, expected ${date}`);
    const baselineIds = new Set(baseline.productionIds || []);
    const baselineDailyIds = new Set(baseline.dailySlapsIds || []);
    const expectedDelta = Math.max(0, expected - baselineDailyIds.size);
    const addedSongs = productionSongs.filter((song) => !baselineIds.has(song.youtube_id));
    const addedIds = addedSongs.map((song) => song.youtube_id);
    const addedDailySlapsIds = addedSongs
      .filter((song) => song.user_name === 'SLAPS' && songDate(song) === date)
      .map((song) => song.youtube_id);
    const addedSlapsOutsideDaily = addedSongs
      .filter((song) => song.user_name === 'SLAPS' && songDate(song) !== date)
      .map((song) => song.youtube_id);
    const newCommunityIds = addedSongs
      .filter((song) => song.user_name !== 'SLAPS')
      .map((song) => song.youtube_id);
    const removedIds = [...baselineIds].filter((id) => !productionSongs.some((song) => song.youtube_id === id));

    if (addedDailySlapsIds.length !== expectedDelta) {
      errors.push(`daily SLAPS ID delta is ${addedDailySlapsIds.length}, expected ${expectedDelta}`);
    }
    if (removedIds.length) errors.push(`production IDs removed since baseline: ${removedIds.join(', ')}`);
    if (addedSlapsOutsideDaily.length) {
      errors.push(`new SLAPS IDs outside today's set: ${addedSlapsOutsideDaily.join(', ')}`);
    }

    baselineResult = { expectedDelta, addedIds, addedDailySlapsIds, newCommunityIds, removedIds };
  }

  return {
    ok: errors.length === 0,
    errors,
    localCount: localSongs.length,
    productionCount: productionSongs.length,
    localDaily,
    productionDaily,
    baselineResult,
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

async function verifyDailyOg(productionUrl, date) {
  const url = `${productionUrl}/api/daily-og?date=${encodeURIComponent(date)}`;
  const first = await fetch(url, { headers: { accept: 'image/jpeg' } });
  if (!first.ok) throw new Error(`daily OG first request returned HTTP ${first.status}`);
  const firstType = first.headers.get('content-type') || '';
  if (!firstType.toLowerCase().startsWith('image/jpeg')) throw new Error(`daily OG content-type is ${firstType}`);
  const firstBuffer = Buffer.from(await first.arrayBuffer());
  const image = await Jimp.read(firstBuffer);
  if (image.width !== 1200 || image.height !== 630) {
    throw new Error(`daily OG dimensions are ${image.width}x${image.height}, expected 1200x630`);
  }

  const second = await fetch(url, { headers: { accept: 'image/jpeg' } });
  if (!second.ok) throw new Error(`daily OG second request returned HTTP ${second.status}`);
  await second.arrayBuffer();
  const secondCache = second.headers.get('x-slaps-cache');
  if (secondCache !== 'KV_HIT') throw new Error(`daily OG second request cache is ${secondCache || '(missing)'}, expected KV_HIT`);

  return {
    url,
    firstCache: first.headers.get('x-slaps-cache'),
    secondCache,
    contentType: firstType,
    width: image.width,
    height: image.height,
  };
}

function runSelfTest() {
  const makeSong = (id, date, user = 'SLAPS') => ({ youtube_id: id.padEnd(11, 'x'), user_name: user, created_at: `${date}T00:00:00.000Z` });
  const date = '2026-09-05';
  const previous = makeSong('previous', '2026-09-04');
  const daily = Array.from({ length: 10 }, (_, index) => makeSong(`daily${index}`, date));
  const localSongs = [previous, ...daily];
  const productionSongs = [previous, ...daily];
  const baseline = {
    date,
    productionIds: [previous.youtube_id],
    dailySlapsIds: [],
  };

  assert.equal(compareDailyState({ localSongs, productionSongs, baseline, date, expected: 10 }).ok, true);

  const shortResult = compareDailyState({
    localSongs: localSongs.slice(0, -1),
    productionSongs: productionSongs.slice(0, -1),
    baseline,
    date,
    expected: 10,
  });
  assert.equal(shortResult.ok, false);
  assert(shortResult.errors.some((error) => error.includes('count is 9')));

  const duplicateResult = compareDailyState({
    localSongs: [...localSongs, daily[0]],
    productionSongs,
    baseline,
    date,
    expected: 10,
  });
  assert.equal(duplicateResult.ok, false);
  assert(duplicateResult.errors.some((error) => error.includes('duplicate YouTube IDs')));

  const concurrentCommunity = compareDailyState({
    localSongs,
    productionSongs: [...productionSongs, makeSong('unrelated', date, '匿名')],
    baseline,
    date,
    expected: 10,
  });
  assert.equal(concurrentCommunity.ok, true);
  assert.equal(concurrentCommunity.baselineResult.newCommunityIds.length, 1);

  const wrongManagedDelta = compareDailyState({
    localSongs,
    productionSongs: [...productionSongs, makeSong('wrongday', '2026-09-04')],
    baseline,
    date,
    expected: 10,
  });
  assert.equal(wrongManagedDelta.ok, false);
  assert(wrongManagedDelta.errors.some((error) => error.includes("new SLAPS IDs outside today's set")));

  console.log('Daily completion gate self-test passed.');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    runSelfTest();
    return;
  }

  const date = options.date || jstDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid --date: ${date}`);
  const expected = Number(options.expected || DEFAULT_EXPECTED);
  if (!Number.isInteger(expected) || expected < 1) throw new Error(`Invalid --expected: ${options.expected}`);
  const productionUrl = (options.production || DEFAULT_PRODUCTION_URL).replace(/\/$/, '');
  const localPath = path.resolve(options.local || path.join(__dirname, '..', 'data', 'songs.json'));
  const localSongs = JSON.parse(fs.readFileSync(localPath, 'utf8'));
  const productionSongs = await fetchJson(`${productionUrl}/api/songs`);

  if (options['capture-baseline']) {
    const baselinePath = path.resolve(options['capture-baseline']);
    const baseline = {
      date,
      capturedAt: new Date().toISOString(),
      productionUrl,
      productionCount: productionSongs.length,
      productionIds: productionSongs.map((song) => song.youtube_id),
      dailySlapsIds: dailySlapsSongs(productionSongs, date).map((song) => song.youtube_id),
    };
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(JSON.stringify({
      mode: 'baseline',
      baselinePath,
      date,
      capturedAt: baseline.capturedAt,
      productionUrl,
      productionCount: baseline.productionCount,
      dailySlapsCount: baseline.dailySlapsIds.length,
    }, null, 2));
    return;
  }

  const baseline = options.baseline
    ? JSON.parse(fs.readFileSync(path.resolve(options.baseline), 'utf8'))
    : null;
  const state = compareDailyState({ localSongs, productionSongs, baseline, date, expected });
  if (!state.ok) {
    console.error(JSON.stringify({ date, expected, errors: state.errors }, null, 2));
    process.exitCode = 1;
    return;
  }

  const dailyOg = await verifyDailyOg(productionUrl, date);
  console.log(JSON.stringify({
    status: 'pass',
    date,
    expected,
    localCount: state.localCount,
    productionCount: state.productionCount,
    dailyIds: state.productionDaily.map((song) => song.youtube_id),
    dailyTitles: state.productionDaily.map((song) => song.name),
    baseline: state.baselineResult,
    dailyOg,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

module.exports = {
  compareDailyState,
  dailySlapsSongs,
  duplicateIds,
  jstDate,
};
