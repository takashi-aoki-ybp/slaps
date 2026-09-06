const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
// Baseline mode proves these new checks reject the pre-fix artifact, without
// checking out or changing any project files.
const read = file => process.env.SLAPS_TEST_BASELINE
  ? execFileSync('git', ['show', process.env.SLAPS_TEST_BASELINE + ':' + file], { cwd: root, encoding: 'utf8' })
  : fs.readFileSync(path.join(root, file), 'utf8');
const plain = source => source.replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*$/gm, '').replace(/^export /gm, '');
const fn = (file, name) => {
  const source = read(file);
  const start = source.search(new RegExp('(?:export )?(?:async )?function ' + name + '\\('));
  assert(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2).replace(/^export /, '');
};
const quiet = { log() {}, warn() {}, error() {}, debug() {} };
function backend(file, fetcher) {
  const full = path.join(root, file), native = createRequire(full);
  let source = read(file)
    .replace(/^import \{([^}]+)\} from ['"]([^'"]+)['"];$/gm, 'const {$1} = require("$2");')
    .replace(/^import (\w+) from ['"]([^'"]+)['"];$/gm, 'const $1 = require("$2");')
    .replace(/export default /g, '').replace(/^export /gm, '');
  const exports = [...read(file).matchAll(/export (?:async )?function (\w+)/g)].map(m => m[1]);
  const def = read(file).match(/export default (?:async )?function (\w+)/)?.[1];
  const ctx = vm.createContext({
    require: name => name.startsWith('.') && /classifier|submission-quality/.test(name)
      ? backend(path.relative(root, path.resolve(path.dirname(full), name)), fetcher) : native(name),
    process: { cwd: () => root, env: { KV_REST_API_URL: 'https://fixture.invalid', KV_REST_API_TOKEN: 'test', SLAPS_ADMIN_TOKEN: 'test' } },
    module: { exports: {} }, exports: {}, fetch: fetcher, console: quiet, Buffer, URL, Response, Headers, AbortSignal, setTimeout, clearTimeout,
  });
  vm.runInContext(source + '\nmodule.exports = ' + (def || '{' + exports.join(',') + '}'), ctx);
  return ctx.module.exports;
}
async function invoke(handler, req) {
  let status = 200, body;
  await handler({ headers: {}, query: {}, ...req }, {
    setHeader() {}, status(n) { status = n; return this; },
    json(x) { body = x; return this; }, send(x) { body = x; return this; }, end() {},
  });
  return { status, body };
}
const ok = result => ({ ok: true, json: async () => ({ result }) });
const cases = [];
const test = (name, work) => cases.push({ name, work });

test('one malformed database row does not discard valid community tracks', async () => {
  const row = { youtube_id: 'auditSong01', name: 'User track', description: { ja: '好き', en: '' } };
  const handler = backend('api/songs.js', async (url, opt) => ok(JSON.parse(opt.body)[0] === 'LRANGE' ? [JSON.stringify(row), '{bad', 'null', '[]'] : []));
  const result = await invoke(handler, {});
  assert.equal(result.status, 200);
  assert.equal(result.body.find(s => s.youtube_id === row.youtube_id).description.ja, '好き');
  assert.equal(result.body.length, require('../data/songs.json').length + 1);
});

for (const fault of ['transport', 'redis-error', 'conflict', 'success', 'empty']) {
  test('description update preserves records and reports ' + fault, async () => {
    const row = { youtube_id: 'auditSong01', name: 'User track', description: { ja: 'original', en: '' } };
    const original = JSON.stringify(row);
    let rows = ['before', original, 'after'], commands = [];
    const handler = backend('api/admin/submissions.js', async (url, opt) => {
      const cmd = JSON.parse(opt.body); commands.push(cmd);
      if (cmd[0] === 'LRANGE') return ok(cmd[1].endsWith('slaps:songs') ? rows : []);
      if (cmd[0] === 'LREM') { rows = rows.filter(raw => raw !== cmd[3]); return ok(1); }
      if (cmd[0] === 'EVAL' || cmd[0] === 'LPUSH' && cmd[1].endsWith('slaps:songs')) {
        if (fault === 'transport') throw Error('fixture network failure');
        if (fault === 'redis-error') return { ok: true, json: async () => ({ error: 'ERR fixture denied' }) };
        if (fault === 'conflict') return ok(0);
        assert.equal(cmd[0], 'EVAL');
        assert.match(cmd[1], /redis.call\('LSET'/);
        assert.doesNotMatch(cmd[1], /LREM|DEL|LPUSH/);
        const changes = JSON.parse(cmd[4]);
        rows = rows.map(raw => changes.find(change => change.oldRaw === raw)?.newRaw || raw);
        return ok(1);
      }
      return ok(1);
    });
    const description = fault === 'empty' ? { ja: '', en: '' } : { ja: 'New real comment', en: 'A real comment' };
    const result = await invoke(handler, { method: 'POST', headers: { authorization: 'Bearer test' }, body: { action: 'update_description', youtube_id: row.youtube_id, description } });
    assert.equal(result.status, ['transport', 'redis-error'].includes(fault) ? 500 : fault === 'conflict' ? 409 : 200);
    assert.equal(rows.length, 3);
    assert.equal(rows[0], 'before'); assert.equal(rows[2], 'after');
    if (['success', 'empty'].includes(fault)) assert.deepEqual(JSON.parse(rows[1]).description, description);
    else assert.equal(rows[1], original);
    assert(!commands.some(cmd => cmd[0] === 'LREM'));
  });
}

test('all Redis helpers reject HTTP200 command errors', async () => {
  for (const file of ['songs','submit','report','mark_broken','presence','youtube-search','og-image','crate-og','daily-og','comments','comments/like','admin/submissions']) {
    const ctx = vm.createContext({ process: { env: { KV_REST_API_URL: 'fixture', KV_REST_API_TOKEN: 'test' } },
      fetch: async () => ({ ok: true, json: async () => ({ error: 'ERR denied' }) }) });
    vm.runInContext(fn('api/' + file + '.js', 'kvFetch'), ctx);
    await assert.rejects(vm.runInContext('kvFetch(["PING"])', ctx), /ERR denied/, file);
  }
});

test('bodyless public POST returns validation error', async () => {
  for (const file of ['submit','report','mark_broken']) {
    const result = await invoke(backend('api/' + file + '.js', async () => { throw Error('must not access network'); }), { method: 'POST' });
    assert.equal(result.status, 400, file);
  }
});

test('crawler HTML rejects invalid IDs and escapes user titles', async () => {
  const marker = '"><audit-marker> & test';
  const handler = backend('middleware.js', async url => {
    if (String(url) === 'https://fixture.invalid') return ok([JSON.stringify({ youtube_id: 'auditSong01', name: marker })]);
    return new Response(read('index.html'));
  });
  let url = new URL('https://slaps.tokyo/'); url.searchParams.set('v', marker);
  let response = await handler({ url: url.href, headers: new Headers({ 'user-agent': 'Twitterbot' }) });
  assert.equal(response.headers.get('x-middleware-next'), '1');
  url.searchParams.set('v', 'auditSong01');
  response = await handler({ url: url.href, headers: new Headers({ 'user-agent': 'Twitterbot' }) });
  const html = await response.text();
  assert(!html.includes('<audit-marker>'));
  assert(html.includes('&quot;&gt;&lt;audit-marker&gt; &amp; test'));
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
});

test('LATEST orders by addition date; favorites count matches queue', () => {
  const ctx = vm.createContext({ URLSearchParams, window: { location: { search: '' } }, localStorage: { getItem: () => 'not-a-volume' } });
  vm.runInContext(plain(read('src/state.js')), ctx);
  vm.runInContext("state.queue=[{youtube_id:'new',created_at:'2026-09-03',publish_at:'2013-01-01'},{youtube_id:'old',created_at:'2026-09-02'}];state.order='newest';applyOrder(state.queue)", ctx);
  assert.equal(vm.runInContext('state.queue[0].youtube_id', ctx), 'new');
  vm.runInContext('state.favMode=true;state.all=[]', ctx);
  assert.equal(vm.runInContext('playableCount()', ctx), 2);
  assert.equal(vm.runInContext('state.volume', ctx), 100);
});

test('favorite snapshots use current copy without rewriting storage; invalid shape is safe', () => {
  const ui = read('src/ui.js'), start = ui.indexOf("const FAV_KEY");
  let stored = JSON.stringify([{ youtube_id: '8PLifPUIuic', name: 'old', description: { ja: 'retired generated text', en: '' } }]), writes = 0;
  const ctx = vm.createContext({
    state: { all: [{ youtube_id: '8PLifPUIuic', name: 'current', description: { ja: '', en: '' } }] },
    localStorage: { getItem: () => stored, setItem() { writes++; throw Error('QuotaExceeded'); } },
    window: { i18n: { t: x => x } }, showToast() {},
  });
  vm.runInContext(ui.slice(start, ui.indexOf('export function isFav', start)).replace(/^export /gm, ''), ctx);
  assert.equal(vm.runInContext('favGet()[0].description.ja', ctx), '');
  assert.equal(writes, 0); assert(stored.includes('retired'));
  ctx.state.all[0].description.ja = '本物のコメント';
  assert.equal(vm.runInContext('favGet()[0].description.ja', ctx), '本物のコメント');
  stored = '{}'; assert.equal(vm.runInContext('favGet().length', ctx), 0);
  vm.runInContext("favSave([{youtube_id:'newUser1234',description:'好き'}])", ctx);
  assert.equal(vm.runInContext('favGet()[0].description', ctx), '好き');
});

test('DAILY deep link is consumed once, never reopened on LATEST refresh', () => {
  for (const requested of ['', '2026-09-03']) {
    let opened = 0;
    const open = { hidden: false, dataset: {} };
    const ctx = vm.createContext({ state: { all: [], dailyDate: requested }, buildDailyArchive: () => [{ date: '2026-09-03', tracks: [1] }],
      $: selector => selector === '#dailyOpen' ? open : {}, jstDateKey: () => '2026-09-04', openDaily: () => opened++ });
    vm.runInContext('let dailyArchive=[];let initialDailyRequestHandled=false;\n' + fn('src/ui.js', 'initDaily'), ctx);
    vm.runInContext('initDaily();initDaily();initDaily()', ctx);
    assert.equal(opened, requested ? 1 : 0);
    assert.equal(open.hidden, true);
  }
});

test('TODAY button never relabels the latest historical drop as today', () => {
  const open = { hidden: false, dataset: {} }, count = { textContent: '' };
  const ctx = vm.createContext({
    state: { all: [], dailyDate: '' },
    buildDailyArchive: () => [{ date: '2026-09-06', tracks: [1, 2, 3] }],
    jstDateKey: () => '2026-09-07',
    $: selector => selector === '#dailyOpen' ? open : count,
    openDaily() { throw Error('historical drop must not open as today'); },
  });
  vm.runInContext('let dailyArchive=[];let initialDailyRequestHandled=false;\n' + fn('src/ui.js', 'initDaily'), ctx);
  vm.runInContext('initDaily()', ctx);
  assert.equal(open.hidden, true);
  assert.equal(ctx.state.dailyDate, '');
  assert.equal(count.textContent, '');
});

test('catalog fallback tolerates invalid local storage lists', async () => {
  const ctx = vm.createContext({ console: quiet, AbortController, setTimeout, clearTimeout,
    localStorage: { getItem: key => key === 'slaps_broken' ? '{}' : '[null]' },
    fetch: async url => {
      if (url === '/api/songs') throw Error('fixture API outage');
      return { ok: true, json: async () => [{ youtube_id: 'auditSong01', name: 'Local seed' }] };
    },
  });
  vm.runInContext(plain(read('src/db.js')), ctx);
  const songs = await vm.runInContext('db.loadSongs()', ctx);
  assert.equal(songs.length, 1); assert.equal(songs[0].youtube_id, 'auditSong01');
});

test('DIG keyboard stops propagation', () => {
  let stopped = false, picked;
  const records = [0, 1].map(id => ({ id, focus() {} }));
  const ctx = vm.createContext({ getComputedStyle: () => ({ gridTemplateColumns: '1fr 1fr' }), setDigSelection: r => picked = r.id });
  vm.runInContext(fn('src/ui.js', 'handleDigKeyboard'), ctx);
  ctx.event = { key: 'ArrowRight', currentTarget: { querySelectorAll: () => records }, target: { closest: () => records[0] }, preventDefault() {}, stopPropagation() { stopped = true; } };
  vm.runInContext('handleDigKeyboard(event)', ctx);
  assert.equal(picked, 1); assert(stopped);
});

test('rapid LATEST responses cannot roll back catalog or strand loading label', async () => {
  const pending = [], button = { innerHTML: 'LATEST', dataset: {} };
  const state = { order: 'shuffle', favMode: false, balance: 2.5, all: [] };
  const ctx = vm.createContext({ state, console: quiet, clearCrateMode() {}, trackEvent() {}, setBalance() {}, initDaily() {}, updateTrackCount() {},
    document: { querySelectorAll: () => [], querySelector: () => button },
    fetch: () => new Promise(resolve => pending.push(data => resolve({ ok: true, json: async () => data }))),
  });
  vm.runInContext('let orderRequestVersion=0;\n' + fn('src/ui.js', 'setOrder'), ctx);
  const first = vm.runInContext('setOrder("newest")', ctx);
  const second = vm.runInContext('setOrder("newest")', ctx);
  pending[1]([{ youtube_id: 'new' }]); await second;
  pending[0]([{ youtube_id: 'old' }]); await first;
  assert.equal(state.all[0].youtube_id, 'new'); assert.equal(button.innerHTML, 'LATEST');
  const third = vm.runInContext('setOrder("newest")', ctx);
  await vm.runInContext('setOrder("shuffle")', ctx);
  pending[2]([{ youtube_id: 'stale' }]); await third;
  assert.equal(state.order, 'shuffle'); assert.equal(state.all[0].youtube_id, 'new'); assert.equal(button.innerHTML, 'LATEST');
});

test('late DIG success and failure cannot replace current recommendations', async () => {
  for (const fail of [false, true]) {
    let release;
    const state = { all: [], queue: [{ youtube_id: 'artistA0001', name: 'Artist A - First' }], index: 0, recommendations: [] };
    const ctx = vm.createContext({ state, window: {}, console: quiet, current: () => state.queue[0], renderRecommendations() {},
      fetch: async url => {
        if (String(url).includes('Artist%20A')) await new Promise((resolve, reject) => { release = () => fail ? reject(Error('old error')) : resolve(); });
        return { ok: true, json: async () => ({ results: [{ artistName: String(url).includes('Artist%20A') ? 'Artist A' : 'Artist B', trackName: 'Second', primaryGenreName: 'Hip-Hop/Rap' }] }) };
      } });
    vm.runInContext(plain(read('src/player.js')), ctx);
    const old = vm.runInContext('fetchRecommendations("Artist A",true)', ctx);
    state.queue[0] = { youtube_id: 'artistB0001', name: 'Artist B - First' };
    await vm.runInContext('fetchRecommendations("Artist B",true)', ctx);
    assert.equal(state.recommendations[0].artist, 'Artist B');
    release(); await old;
    assert.equal(state.recommendations[0].artist, 'Artist B');
  }
});

test('no phantom start or null player access', () => {
  const state = { started: false, ready: true, player: null, all: [{}] };
  const ctx = vm.createContext({ state, current: () => ({}), noteTrackLoaded() { throw Error('should not load'); },
    URLSearchParams, window: { location: { search: '', pathname: '/' } }, setBalance() { throw Error('should not start'); } });
  vm.runInContext(fn('src/player.js','tryStart') + '\n' + fn('src/player.js','loadCurrent'), ctx);
  vm.runInContext('tryStart();loadCurrent()', ctx);
  assert.equal(state.started, false);
  assert.doesNotMatch(read('script.js'), /state\.ready\s*=\s*true/);
});

test('region matcher avoids partial words and preserves explicit OTHER', () => {
  const { classifySong } = backend('api/utils/classifier.js', async () => {});
  assert.notEqual(classifySong({ name: 'Example artist - Motion' }).region, 'jp');
  assert.equal(classifySong({ name: 'IO - Track' }).region, 'jp');
  assert.equal(classifySong({ name: 'IO - Track', region: 'other' }).region, 'other');
});

(async () => {
  let failures = 0;
  for (const { name, work } of cases) {
    try { await work(); console.log('PASS ' + name); }
    catch (error) { failures++; console.error('FAIL ' + name + ': ' + error.message); }
  }
  if (failures) process.exitCode = 1;
  console.log(cases.length + ' audit regressions, ' + failures + ' failed.');
})();
