const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const loadModule = (file) => import(`data:text/javascript;base64,${Buffer.from(read(file)).toString('base64')}`);

async function run() {
  const daily = await loadModule('src/daily.js');
  const sample = [
    { youtube_id: 'aaaaaaaaaaa', user_name: 'SLAPS', created_at: '2026-09-03T00:00:00Z' },
    { youtube_id: 'bbbbbbbbbbb', user_name: 'Guest', created_at: '2026-09-03T01:00:00Z' },
    { youtube_id: 'ccccccccccc', user_name: 'SLAPS', created_at: '2026-09-02T00:00:00Z' },
  ];
  const archive = daily.buildDailyArchive(sample);
  assert.deepEqual(archive.map((entry) => entry.date), ['2026-09-03', '2026-09-02']);
  assert.deepEqual(archive[0].tracks.map((song) => song.youtube_id), ['aaaaaaaaaaa']);
  assert.equal(daily.jstDateKey(new Date('2026-09-06T14:59:59Z')), '2026-09-06');
  assert.equal(daily.jstDateKey(new Date('2026-09-06T15:00:00Z')), '2026-09-07');
  assert.equal(daily.dailyShareUrl('https://slaps.tokyo', '2026-09-03'), 'https://slaps.tokyo/?daily=2026-09-03');

  const analytics = await loadModule('src/analytics.js');
  assert.equal(analytics.calendarDayDiff('2026-09-01T00:00:00Z', '2026-09-08T00:00:00Z'), 7);
  assert.deepEqual(analytics.sanitizeProps({ ok: true, count: 3, nested: { no: true } }), { ok: true, count: 3 });

  const html = read('index.html');
  assert.match(html, /id="dailyOpen"/);
  assert.match(html, /id="dailyOverlay"/);
  assert.match(read('middleware.js'), /api\/daily-og/);
  assert.match(read('api/daily-og.js'), /'EX', 604800/);
  assert.doesNotMatch(read('api/daily-og.js'), /loadFont/);
  assert.match(read('src/player.js'), /noteStarted\(current\(\)/);
  console.log('Growth feature tests passed.');
}

run().catch((error) => { console.error(error); process.exit(1); });
