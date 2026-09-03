const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.join(process.cwd(), 'api', 'og-image.js');
const source = fs
  .readFileSync(sourcePath, 'utf8')
  .replace('export default async function handler', 'async function handler')
  .concat('\nmodule.exports = { handler };\n');

function createImage({ output = Buffer.from('generated-jpeg') } = {}) {
  return {
    bitmap: { width: 1200, height: 630 },
    cover() { return this; },
    resize() { return this; },
    composite() { return this; },
    quality() { return this; },
    async getBufferAsync() { return output; },
  };
}

function loadHandler({ kvResults = [], imageError = null } = {}) {
  const commands = [];
  let kvIndex = 0;
  const jimp = {
    HORIZONTAL_ALIGN_CENTER: 1,
    VERTICAL_ALIGN_MIDDLE: 2,
    MIME_JPEG: 'image/jpeg',
    async read() {
      if (imageError) throw imageError;
      return createImage();
    },
  };

  const sandbox = {
    module: { exports: {} },
    exports: {},
    Buffer,
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
      if (id === 'jimp') return jimp;
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
  return { handler: sandbox.module.exports.handler, commands };
}

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
  };
}

async function run() {
  {
    const cached = Buffer.from('cached-jpeg');
    const { handler, commands } = loadHandler({
      kvResults: [cached.toString('base64')],
    });
    const res = createResponse();
    await handler({ query: { v: 'cachedVid01' } }, res);

    assert.deepEqual(commands, [['GET', 'test:slaps:og:cachedVid01']]);
    assert.equal(res.headers['Content-Type'], 'image/jpeg');
    assert.equal(res.headers['Cache-Control'], 'public, max-age=86400, s-maxage=86400');
    assert.equal(res.headers['X-Slaps-Cache'], 'KV_HIT');
    assert.deepEqual(res.body, cached);
  }

  {
    const { handler, commands } = loadHandler({ kvResults: [null, 'OK'] });
    const res = createResponse();
    await handler({ query: { v: 'newVideo123' } }, res);

    assert.deepEqual(commands[0], ['GET', 'test:slaps:og:newVideo123']);
    assert.deepEqual(commands[1], [
      'SET',
      'test:slaps:og:newVideo123',
      Buffer.from('generated-jpeg').toString('base64'),
      'EX',
      2592000,
    ]);
    assert.equal(res.headers['Content-Type'], 'image/jpeg');
    assert.equal(res.headers['Cache-Control'], 'public, max-age=86400, s-maxage=86400');
    assert.equal(res.headers['X-Slaps-Cache'], 'KV_MISS');
    assert.deepEqual(res.body, Buffer.from('generated-jpeg'));
  }

  {
    const { handler } = loadHandler({
      kvResults: [null],
      imageError: new Error('thumbnail unavailable'),
    });
    const res = createResponse();
    await handler({ query: { v: 'brokenVid01' } }, res);

    assert.equal(res.headers['Content-Type'], 'image/png');
    assert.deepEqual(res.body, Buffer.from('fallback-png'));
  }

  console.log('OG image cache tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
