const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Jimp, JimpMime } = require('jimp');

const root = process.cwd();

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

function loadCrateHandler() {
  const sourcePath = path.join(root, 'api', 'crate-og.js');
  const source = fs.readFileSync(sourcePath, 'utf8')
    .replace('export default async function handler', 'async function handler')
    .concat('\nmodule.exports = handler;\n');
  const sandbox = {
    module: { exports: {} },
    exports: {},
    require(id) {
      if (id === './utils/request-guards.js') return require(path.join(root, 'api', 'utils', 'request-guards.js'));
      return require(id);
    },
    process: { cwd: () => root, env: {} },
    Buffer,
    fetch: (...args) => global.fetch(...args),
    console,
  };
  vm.runInNewContext(source, sandbox, { filename: sourcePath });
  return sandbox.module.exports;
}

async function assertJpegResponse(response, label) {
  assert.equal(response.statusCode, 200, `${label} must return 200`);
  assert.equal(response.headers['content-type'], 'image/jpeg');
  assert.equal(response.headers['cache-control'], 'public, max-age=86400, s-maxage=86400');
  assert.equal(response.headers['x-slaps-cache'], 'KV_MISS');
  assert.ok(Buffer.isBuffer(response.body), `${label} must return a Buffer`);
  const image = await Jimp.read(response.body);
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
    const crateResponse = responseRecorder();
    await crateHandler({ query: { crate: crateIds.join('.') }, headers: {} }, crateResponse);
    await assertJpegResponse(crateResponse, 'CRATE OG');

    const dailyDate = songs
      .map((song) => String(song.created_at || song.publish_at || '').slice(0, 10))
      .find((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && songs.some((song) =>
        String(song.user_name || '').toUpperCase() === 'SLAPS' &&
        String(song.created_at || song.publish_at || '').startsWith(date)
      ));
    assert.ok(dailyDate, 'catalogue must contain a SLAPS daily-drop date');

    delete require.cache[require.resolve(path.join(root, 'api', 'daily-og.js'))];
    const dailyHandler = require(path.join(root, 'api', 'daily-og.js'));
    const dailyResponse = responseRecorder();
    await dailyHandler({ query: { date: dailyDate }, headers: {} }, dailyResponse);
    await assertJpegResponse(dailyResponse, 'DAILY OG');
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
