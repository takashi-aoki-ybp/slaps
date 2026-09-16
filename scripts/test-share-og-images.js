const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Jimp, JimpMime } = require('jimp');

const root = process.cwd();

function loadCrateHandler() {
  const sourcePath = path.join(root, 'api', 'crate-og.js');
  const source = fs.readFileSync(sourcePath, 'utf8')
    .replace('export async function handleCrateOg', 'async function handleCrateOg')
    .replace('export default { fetch: handleCrateOg };', '')
    .concat('\nmodule.exports = handleCrateOg;\n');
  const sandbox = {
    module: { exports: {} },
    exports: {},
    require(id) {
      if (id === './utils/request-guards.js') return require(path.join(root, 'api', 'utils', 'request-guards.js'));
      return require(id);
    },
    process: { cwd: () => root, env: {} },
    Buffer,
    Headers,
    Request,
    Response,
    URL,
    fetch: (...args) => global.fetch(...args),
    console,
  };
  vm.runInNewContext(source, sandbox, { filename: sourcePath });
  return sandbox.module.exports;
}

function loadDailyHandler() {
  const sourcePath = path.join(root, 'api', 'daily-og.js');
  const source = fs.readFileSync(sourcePath, 'utf8')
    .replace("import crypto from 'crypto';", "const crypto = require('crypto');")
    .replace("import { Jimp, JimpMime, HorizontalAlign, VerticalAlign } from 'jimp';", "const { Jimp, JimpMime, HorizontalAlign, VerticalAlign } = require('jimp');")
    .replace("import path from 'path';", "const path = require('path');")
    .replace("import fs from 'fs';", "const fs = require('fs');")
    .replace("import kvList from './utils/kv-list.js';", "const kvList = require('./utils/kv-list.js');")
    .replace('export async function handleDailyOg', 'async function handleDailyOg')
    .replace('export default { fetch: handleDailyOg };', '')
    .concat('\nmodule.exports = handleDailyOg;\n');
  const sandbox = {
    module: { exports: {} },
    exports: {},
    require(id) {
      if (id === './utils/kv-list.js') return require(path.join(root, 'api', 'utils', 'kv-list.js'));
      return require(id);
    },
    process: { cwd: () => root, env: {} },
    Buffer,
    Headers,
    Request,
    Response,
    URL,
    fetch: (...args) => global.fetch(...args),
    console,
  };
  vm.runInNewContext(source, sandbox, { filename: sourcePath });
  return sandbox.module.exports;
}

async function assertFetchJpegResponse(response, label) {
  assert.equal(response.status, 200, `${label} must return 200`);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=86400, s-maxage=86400');
  assert.equal(response.headers.get('x-slaps-cache'), 'KV_MISS');
  const image = await Jimp.read(Buffer.from(await response.arrayBuffer()));
  assert.equal(image.bitmap.width, 1200);
  assert.equal(image.bitmap.height, 630);
}

async function run() {
  const previousFetch = global.fetch;
  const previousUrl = process.env.KV_REST_API_URL;
  const previousToken = process.env.KV_REST_API_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;

  const thumbnail = await new Jimp({ width: 480, height: 360, color: 0x315a78ff })
    .getBuffer(JimpMime.jpeg, { quality: 90 });
  global.fetch = async (url) => {
    assert.match(String(url), /^https:\/\/img\.youtube\.com\/vi\/[A-Za-z0-9_-]{11}\/hqdefault\.jpg$/);
    return {
      ok: true,
      status: 200,
      async arrayBuffer() { return thumbnail; },
    };
  };

  try {
    const songs = JSON.parse(fs.readFileSync(path.join(root, 'data', 'songs.json'), 'utf8'));
    const crateIds = songs.slice(0, 4).map((song) => song.youtube_id);
    assert.equal(crateIds.length, 4);

    const crateHandler = loadCrateHandler();
    const invalidCrateResponse = await crateHandler(new Request('https://slaps.tokyo/api/crate-og?crate=invalid'));
    assert.equal(invalidCrateResponse.status, 400);
    assert.equal(await invalidCrateResponse.text(), 'Missing or invalid crate IDs');

    const crateResponse = await crateHandler(new Request(`https://slaps.tokyo/api/crate-og?crate=${crateIds.join('.')}`));
    await assertFetchJpegResponse(crateResponse, 'CRATE OG');
    const crateSource = fs.readFileSync(path.join(root, 'api', 'crate-og.js'), 'utf8');
    assert.match(crateSource, /export default \{ fetch: handleCrateOg \}/);
    assert.match(crateSource, /new URL\(request\.url\)/);
    assert.doesNotMatch(crateSource, /req\.query|res\.send|res\.setHeader/);

    const dailyDate = songs
      .map((song) => String(song.created_at || song.publish_at || '').slice(0, 10))
      .find((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && songs.some((song) =>
        String(song.user_name || '').toUpperCase() === 'SLAPS' &&
        String(song.created_at || song.publish_at || '').startsWith(date)
      ));
    assert.ok(dailyDate, 'catalogue must contain a SLAPS daily-drop date');

    const dailyHandler = loadDailyHandler();
    const invalidResponse = await dailyHandler(new Request('https://slaps.tokyo/api/daily-og?date=invalid'));
    assert.equal(invalidResponse.status, 400);
    assert.equal(await invalidResponse.text(), 'Invalid date');

    const dailyResponse = await dailyHandler(new Request(`https://slaps.tokyo/api/daily-og?date=${dailyDate}`));
    await assertFetchJpegResponse(dailyResponse, 'DAILY OG');
    const dailySource = fs.readFileSync(path.join(root, 'api', 'daily-og.js'), 'utf8');
    assert.match(dailySource, /export default \{ fetch: handleDailyOg \}/);
    assert.match(dailySource, /new URL\(request\.url\)/);
    assert.doesNotMatch(dailySource, /req\.query/);
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = previousUrl;
    if (previousToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = previousToken;
  }

  console.log('Share OG image tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
