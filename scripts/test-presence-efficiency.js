const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = (file) => process.env.SLAPS_TEST_BASELINE
  ? execFileSync('git', ['show', `${process.env.SLAPS_TEST_BASELINE}:${file}`], { cwd: root, encoding: 'utf8' })
  : fs.readFileSync(path.join(root, file), 'utf8');

function loadHandler(fetcher) {
  const file = path.join(root, 'api/presence.js');
  const nativeRequire = createRequire(file);
  const source = read('api/presence.js')
    .replace(/^import \{([^}]+)\} from ['"]([^'"]+)['"];$/gm, 'const {$1} = require("$2");')
    .replace(/^import (\w+) from ['"]([^'"]+)['"];$/gm, 'const $1 = require("$2");')
    .replace(/export default /g, '');
  const context = vm.createContext({
    require: nativeRequire,
    process: {
      cwd: () => root,
      env: { KV_REST_API_URL: 'https://fixture.invalid', KV_REST_API_TOKEN: 'test', DB_PREFIX: 'test:' },
    },
    module: { exports: {} },
    exports: {},
    fetch: fetcher,
    console: { log() {}, warn() {}, error() {}, debug() {} },
    Buffer,
    URL,
    Math,
  });
  vm.runInContext(`${source}\nmodule.exports = handler;`, context);
  return context.module.exports;
}

async function invoke(handler, body) {
  let status = 200;
  let payload;
  await handler({
    method: 'POST',
    headers: { origin: 'https://slaps.tokyo', 'x-forwarded-for': '203.0.113.12' },
    body,
  }, {
    setHeader() {},
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; },
    end() {},
  });
  return { status, payload };
}

async function run() {
  const apiSource = read('api/presence.js');
  const clientSource = read('src/presence.js');

  assert.match(apiSource, /'ZCOUNT', presenceKey/);
  assert.doesNotMatch(apiSource, /\['ZCARD', presenceKey/);
  assert.doesNotMatch(apiSource, /takeRateLimit\(/);
  assert.match(clientSource, /document\.visibilityState !== 'visible'/);
  assert.match(clientSource, /clearInterval\(presenceInterval\)/);
  assert.match(clientSource, /PRESENCE_INTERVAL_MS = 15000/);
  assert.match(clientSource, /if \(hasTrackUpdate\) payload\.youtubeId = currentVideoId/);
  assert.match(clientSource, /wantsListeningSnapshot: listening/);
  assert.doesNotMatch(clientSource, /wantsListeningSnapshot: state\.started/);

  const directCommands = [];
  const pipelineBatches = [];
  const handler = loadHandler(async (url, options) => {
    const command = JSON.parse(options.body);
    if (String(url).endsWith('/pipeline')) {
      pipelineBatches.push(command);
      return {
        ok: true,
        json: async () => command.map((item) => ({
          result: item[0] === 'ZCOUNT' ? 1 : item[0] === 'ZRANGEBYSCORE' ? ['presence-test-client'] : 1,
        })),
      };
    }
    directCommands.push(command);
    return { ok: true, json: async () => ({ result: [] }) };
  });

  const clientId = 'presence-test-client';
  const legacy = await invoke(handler, { clientId, youtubeId: null });
  assert.equal(legacy.status, 409);
  assert.equal(directCommands.length, 0);
  assert.equal(pipelineBatches.length, 0, 'a stale background client must consume zero Redis commands');

  const first = await invoke(handler, { clientId, youtubeId: null, wantsListeningSnapshot: false });
  const second = await invoke(handler, { clientId, wantsListeningSnapshot: false });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.payload.onlineCount, 1);
  assert.equal(second.payload.onlineCount, 1);
  assert.equal(directCommands.length, 0, 'steady heartbeats must not issue extra direct Redis commands');
  assert(pipelineBatches[0].some((command) => command[0] === 'HDEL'));
  assert(!pipelineBatches[1].some((command) => command[0] === 'HDEL' || command[0] === 'HSET'));
  assert(pipelineBatches[1].length <= 3, 'steady heartbeat exceeds the Redis command budget');
  assert(pipelineBatches.flat().every((command) => !['INCR', 'EXPIRE', 'ZCARD', 'ZRANGE'].includes(command[0])));

  const listeners = {};
  const intervals = [];
  const clearedIntervals = [];
  const clientRequests = [];
  const badge = { hidden: true, innerHTML: '' };
  const bodyClasses = new Set();
  const document = {
    visibilityState: 'visible',
    body: { classList: { contains: value => bodyClasses.has(value) } },
    addEventListener(type, listener) { listeners[type] = listener; },
    getElementById(id) { return id === 'onlineBadge' ? badge : null; },
    querySelector() { return null; },
  };
  const clientContext = vm.createContext({
    state: { started: true, isPromo: false, all: [{ youtube_id: 'aaaaaaaaaaa' }] },
    current: () => ({ youtube_id: 'aaaaaaaaaaa' }),
    loadCurrent() {},
    document,
    window: { i18n: { getLang: () => 'ja' } },
    localStorage: { getItem: () => 'presence-test-client', setItem() {} },
    fetch: async (url, options) => {
      clientRequests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ onlineCount: 1, someoneListeningTo: null }) };
    },
    console: { log() {}, warn() {}, error() {}, debug() {} },
    setInterval(callback) { const id = intervals.length + 1; intervals.push({ id, callback }); return id; },
    clearInterval(id) { clearedIntervals.push(id); },
    setTimeout,
    clearTimeout,
    Math,
  });
  const executableClient = clientSource
    .replace(/^import[^\n]+\n/gm, '')
    .replace(/^export /gm, '');
  vm.runInContext(executableClient, clientContext);
  vm.runInContext('initPresence()', clientContext);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(clientRequests.length, 1);
  assert.equal(clientRequests[0].youtubeId, null);
  assert.equal(clientRequests[0].wantsListeningSnapshot, false);
  await intervals[0].callback();
  assert.equal(clientRequests.length, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(clientRequests[1], 'youtubeId'), false);

  bodyClasses.add('is-started');
  await intervals[0].callback();
  assert.equal(clientRequests.length, 3);
  assert.equal(clientRequests[2].youtubeId, 'aaaaaaaaaaa');
  assert.equal(clientRequests[2].wantsListeningSnapshot, true);

  document.visibilityState = 'hidden';
  listeners.visibilitychange();
  assert.deepEqual(clearedIntervals, [1]);
  await intervals[0].callback();
  assert.equal(clientRequests.length, 3, 'a hidden tab must not call the presence API');

  document.visibilityState = 'visible';
  listeners.visibilitychange();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(clientRequests.length, 4, 'a visible tab must resume immediately');
  assert.equal(intervals.length, 2);

  console.log('Presence visibility and Redis command budget tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
