const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.join(process.cwd(), 'api', 'og-image.js');
const source = fs
  .readFileSync(sourcePath, 'utf8')
  .replace("import sharp from 'sharp';", "const sharp = require('sharp');")
  .replace("import path from 'path';", "const path = require('path');")
  .replace("import fs from 'fs';", "const fs = require('fs');")
  .replace("import requestGuards from './utils/request-guards.js';", "const requestGuards = require('./utils/request-guards.js');")
  .replace('export async function handleOgImage', 'async function handleOgImage')
  .replace('export default { fetch: handleOgImage };', '')
  .concat('\nmodule.exports = { handleOgImage };\n');

function loadHandler({ kvResults = [], imageError = null } = {}) {
  const commands = [];
  let kvIndex = 0;
  let sharpCall = 0;
  const sharp = () => {
    sharpCall += 1;
    if (imageError) throw imageError;
    const output = sharpCall % 2 === 1 ? Buffer.from('overlay-png') : Buffer.from('generated-jpeg');
    return {
      resize() { return this; },
      composite() { return this; },
      png() { return this; },
      jpeg() { return this; },
      async toBuffer() { return output; },
    };
  };

  const sandbox = {
    module: { exports: {} },
    exports: {},
    Buffer,
    Headers,
    Request,
    Response,
    URL,
    console: { error() {} },
    process: {
      cwd: () => process.cwd(),
      env: {
        KV_REST_API_URL: 'https://kv.example.test',
        KV_REST_API_TOKEN: 'test-token',
        DB_PREFIX: 'test:',
      },
    },
    require(id) {
      if (id === 'sharp') return sharp;
      if (id === 'path') return path;
      if (id === './utils/request-guards.js') {
        return {
          isCataloguedYoutubeId: async () => true,
          takeRateLimit: async () => ({ allowed: true }),
        };
      }
      if (id === 'fs') {
        return { readFileSync: () => Buffer.from('fallback-png') };
      }
      throw new Error(`Unexpected require: ${id}`);
    },
    async fetch(url, options) {
      if (url.startsWith('https://img.youtube.com/')) {
        if (imageError) throw imageError;
        return { ok: true, async arrayBuffer() { return Buffer.from('thumbnail'); } };
      }
      assert.equal(url, 'https://kv.example.test');
      const command = JSON.parse(options.body);
      commands.push(command);
      const result = kvResults[kvIndex++];
      if (result instanceof Error) throw result;
      return {
        ok: true,
        async json() { return { result: result ?? null }; },
      };
    },
  };

  vm.runInNewContext(source, sandbox, { filename: sourcePath });
  return { handler: sandbox.module.exports.handleOgImage, commands };
}

const ogRequest = (videoId) => new Request(`https://slaps.tokyo/api/og-image?v=${videoId}`, {
  headers: { 'x-forwarded-for': '203.0.113.10' },
});

const responseBuffer = async (response) => Buffer.from(await response.arrayBuffer());

async function run() {
  {
    const cached = Buffer.from('cached-jpeg');
    const { handler, commands } = loadHandler({
      kvResults: [cached.toString('base64')],
    });
    const res = await handler(ogRequest('cachedVid01'));

    assert.deepEqual(commands, [['GET', 'test:slaps:og:cachedVid01']]);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=86400, s-maxage=86400');
    assert.equal(res.headers.get('x-slaps-cache'), 'KV_HIT');
    assert.deepEqual(await responseBuffer(res), cached);
  }

  {
    const { handler, commands } = loadHandler({ kvResults: [null, 'OK'] });
    const res = await handler(ogRequest('newVideo123'));

    assert.deepEqual(commands[0], ['GET', 'test:slaps:og:newVideo123']);
    assert.deepEqual(commands[1], [
      'SET',
      'test:slaps:og:newVideo123',
      Buffer.from('generated-jpeg').toString('base64'),
      'EX',
      2592000,
    ]);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=86400, s-maxage=86400');
    assert.equal(res.headers.get('x-slaps-cache'), 'KV_MISS');
    assert.deepEqual(await responseBuffer(res), Buffer.from('generated-jpeg'));
  }

  {
    const { handler } = loadHandler({
      kvResults: [null],
      imageError: new Error('thumbnail unavailable'),
    });
    const res = await handler(ogRequest('brokenVid01'));

    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.deepEqual(await responseBuffer(res), Buffer.from('fallback-png'));
  }

  assert.match(fs.readFileSync(sourcePath, 'utf8'), /export default \{ fetch: handleOgImage \}/);

  console.log('OG image cache tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
