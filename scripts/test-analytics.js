const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function run() {
  const html = fs.readFileSync('index.html', 'utf8');
  const loaderMatch = html.match(/<!-- Google Tag Manager -->\s*<script>([\s\S]*?)<\/script>/);
  assert.ok(loaderMatch, 'GTM loader must exist in index.html');
  const runLoader = (hostname, native = false) => {
    const inserted = [];
    const firstScript = { parentNode: { insertBefore: node => inserted.push(node) } };
    const window = {
      location: { hostname },
      ...(native ? { Capacitor: { isNativePlatform: () => true } } : {}),
    };
    const document = {
      getElementsByTagName: () => [firstScript],
      createElement: () => ({}),
    };
    vm.runInNewContext(loaderMatch[1], { window, document, Date });
    return { inserted, dataLayer: window.dataLayer };
  };
  for (const hostname of ['slaps.tokyo', 'www.slaps.tokyo']) {
    const result = runLoader(hostname);
    assert.equal(result.inserted.length, 1, `${hostname} must load GTM`);
    assert.equal(result.dataLayer[0].event, 'gtm.js');
  }
  for (const hostname of ['localhost', '127.0.0.1', 'slaps.tokyo.evil.test']) {
    const result = runLoader(hostname);
    assert.equal(result.inserted.length, 0, `${hostname} must not load GTM`);
    assert.equal(result.dataLayer, undefined);
  }
  assert.equal(runLoader('localhost', true).inserted.length, 1, 'native app must keep GTM enabled');

  const source = fs.readFileSync('src/analytics.js', 'utf8').replace(/^export /gm, '');
  let now = 0;
  let tick;
  let snapshot = null;
  const storage = new Map();
  const events = [];
  const wicleEvents = [];
  const context = vm.createContext({ Date, performance: { now: () => now },
    window: { dataLayer: events, krt: (command, event, props) => wicleEvents.push({ command, event, props }) },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    setInterval: fn => { tick = fn; return 1; }, clearInterval: () => {}, readPlayback: () => snapshot,
  });
  vm.runInContext(source, context);
  const call = code => vm.runInContext(code, context);
  const reset = () => { call('resetAnalyticsForTests()'); events.length = 0; snapshot = null; now = 0; };
  const count = event => events.filter(e => e.event === 'slaps_' + event).length;
  storage.set('slaps_first_visit_v1', '2026-08-04T00:00:00Z');
  call("initAnalytics(new Date('2026-09-03T00:00:00Z'))");
  assert.equal(count('return_d1'), 0); assert.equal(count('return_d7'), 0);
  reset(); storage.clear();
  storage.set('slaps_first_visit_v1', '2026-09-02T14:59:00Z');
  call("initAnalytics(new Date('2026-09-02T15:01:00Z'))");
  assert.equal(count('return_d1'), 1); assert.equal(count('return_d7'), 0);
  assert.equal(events.find(e => e.event === 'slaps_return_d1').cohort_date, '2026-09-02');
  call("initAnalytics(new Date('2026-09-02T16:00:00Z'))"); assert.equal(count('return_d1'), 1);
  call("initAnalytics(new Date('2026-09-09T14:59:00Z'))"); assert.equal(count('return_d7'), 1);
  reset();
  call("noteStarted({youtube_id:'aaaaaaaaaaa'}, 'shuffle', readPlayback)");
  now = 300000; tick(); assert.equal(count('listen_5_minutes'), 0);
  call("noteTrackLoaded({youtube_id:'bbbbbbbbbbb'}); noteTrackLoaded({youtube_id:'ccccccccccc'})");
  assert.equal(count('track_3_reached'), 0);
  reset(); snapshot = { playing: true, id: 'aaaaaaaaaaa', time: 10, mode: 'shuffle' };
  call("noteStarted({youtube_id:'aaaaaaaaaaa'}, 'shuffle', readPlayback)");
  for (let i = 0; i < 299; i++) { now += 1000; snapshot.time++; tick(); }
  assert.equal(count('listen_5_minutes'), 0);
  snapshot.playing = false; now += 1000; tick(); now += 300000; tick();
  assert.equal(count('listen_5_minutes'), 0);
  snapshot.playing = true; tick(); now += 1000; tick();
  snapshot.time += 120; now += 1000; tick();
  snapshot.time++; now += 60000; tick(); assert.equal(count('listen_5_minutes'), 0);
  now += 1000; snapshot.time++; tick(); assert.equal(count('listen_5_minutes'), 1);
  assert.deepEqual(JSON.parse(JSON.stringify(wicleEvents)), [{
    command: 'send',
    event: 'slaps_listen_5_minutes',
    props: { tracks_loaded: 1, measurement_version: '2' },
  }]);
  now += 1000; snapshot.time++; tick();
  assert.equal(wicleEvents.length, 1, 'Wicle conversion must be sent once per session');
  call("window.krt = () => { throw new Error('blocked'); }");
  assert.equal(call("trackWicleEvent('slaps_test')"), false, 'Wicle failure must not affect playback');
  for (const id of ['bbbbbbbbbbb', 'ccccccccccc']) {
    call('noteTrackLoaded()'); snapshot = { playing: true, id, time: 0, mode: 'daily' };
    now += 1000; tick(); now += 1000; snapshot.time++; tick();
  }
  assert.equal(count('track_3_reached'), 1);
  assert(events.every(e => e.measurement_version === '2'));
  const { deliverShare } = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync('src/sharing.js')).toString('base64'));
  const doc = { createElement: () => ({ style: {}, select() {}, remove() {} }), body: { appendChild() {} }, execCommand: () => false };
  assert.equal(await deliverShare('test', { userAgent: 'iPhone', share: async () => { throw { name: 'AbortError' }; } }, doc), 'cancelled');
  assert.equal(await deliverShare('test', { userAgent: 'iPhone', share: async () => {} }, doc), 'shared');
  assert.equal(await deliverShare('test', { userAgent: 'Mac', clipboard: { writeText: async () => {} } }, doc), 'copied');
  assert.equal(await deliverShare('test', { userAgent: 'Mac' }, doc), 'failed');
  assert.equal(await deliverShare('test', { userAgent: 'Mac' }, { ...doc, execCommand: () => true }), 'copied');
  const config = require('../config/gtm-product-events.json').containerVersion;
  const getter = config.variable.find(v => v.name === 'SLAPS - Current event parameters').parameter[0].value
    .replaceAll('{{Event}}', 'event').replaceAll('{{SLAPS - GTM event ID}}', 'id').replaceAll('{{Debug Mode}}', 'false');
  const layer = [
    { event: 'slaps_save', 'gtm.uniqueEventId': 10, action: 'add', youtube_id: 'aaaaaaaaaaa', secret: 'excluded' },
    { event: 'slaps_save', 'gtm.uniqueEventId': 11, action: 'remove', youtube_id: 'bbbbbbbbbbb' },
    { event: 'slaps_daily_open', 'gtm.uniqueEventId': 12, date: '2026-09-03' },
  ];
  const read = (event, id) => JSON.parse(JSON.stringify(vm.runInNewContext('(' + getter + ')()', { window: { dataLayer: layer }, event, id })));
  assert.deepEqual(read('slaps_save', 10), { action: 'add', youtube_id: 'aaaaaaaaaaa' });
  assert.deepEqual(read('slaps_save', 11), { action: 'remove', youtube_id: 'bbbbbbbbbbb' });
  assert.deepEqual(read('slaps_daily_open', 12), { date: '2026-09-03' });
  assert.deepEqual(read('slaps_save', undefined), {});
  assert.deepEqual(read('slaps_save', 12), {});
  const host = new RegExp(config.trigger[0].filter[0].parameter[1].value);
  assert(host.test('slaps.tokyo')); assert(!host.test('localhost')); assert(!host.test('slaps.tokyo.evil.test'));
  console.log('Analytics regression tests passed: event identity, JST retention, confirmed playback, share outcomes.');
}
run().catch(error => { console.error(error); process.exit(1); });
