const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const { retired } = require('../data/retired-descriptions.json');
const { isBoilerplate, retireGeneratedDescription } = require('../api/utils/description-policy.js');
const songs = require('../data/songs.json');
const byId = new Map(songs.map(s => [s.youtube_id, s]));

async function run() {
  assert.equal(Object.keys(retired).length, 308);
  for (const [id, description] of Object.entries(retired)) {
    for (const lang of ['ja', 'en']) assert(isBoilerplate(description[lang], lang), id + ':' + lang);
    assert.deepEqual(byId.get(id).description, { ja: '', en: '' });
    const original = { youtube_id: id, user_name: 'Original user', description };
    const cleaned = retireGeneratedDescription(original);
    assert.deepEqual(cleaned.description, { ja: '', en: '' });
    assert.equal(cleaned.user_name, original.user_name);
    assert.deepEqual(original.description, description);
  }
  const id = '8PLifPUIuic';
  assert.deepEqual(retireGeneratedDescription({ youtube_id: id, description: { ja: 'かっこいい♪', en: 'My favorite.' } }).description,
    { ja: 'かっこいい♪', en: 'My favorite.' });
  assert.deepEqual(retireGeneratedDescription({ youtube_id: id, description: { ja: '好き', en: retired[id].en } }).description,
    { ja: '好き', en: '' });
  const unrelated = { youtube_id: 'not-retired', description: retired[id] };
  assert.equal(retireGeneratedDescription(unrelated), unrelated);
  assert(!isBoilerplate('好き', 'ja')); assert(!isBoilerplate('So cool.', 'en'));
  assert(isBoilerplate('YouTubeで公開中の「A new title」。日本の2020年代ヒップホップとして収録。', 'ja'));
  assert(isBoilerplate('“New title” on YouTube. Hip-hop from Japan, released in the 2020s.', 'en'));

  const catalogBefore = fs.readFileSync('data/songs.json', 'utf8');
  const disabled = spawnSync(process.execPath, ['scripts/fill-empty-descriptions.js'], { encoding: 'utf8' });
  assert.equal(disabled.status, 1); assert.match(disabled.stderr, /disabled/);
  assert.equal(fs.readFileSync('data/songs.json', 'utf8'), catalogBefore);

  // Exercise the real API merge: exact retired DB copy removed, user edit kept,
  // non-retired community record kept, no Redis writes or external requests.
  const secondId = Object.keys(retired).find(key => key !== id);
  const dbRows = [
    { ...byId.get(id), description: retired[id] },
    { ...byId.get(secondId), description: { ja: 'ユーザー自身のコメント', en: 'My own comment.' } },
    { youtube_id: 'newUser1234', name: 'Community track', description: { ja: 'いい曲', en: 'Love it.' } },
  ];
  let result;
  const requests = [];
  const source = fs.readFileSync('api/songs.js', 'utf8')
    .replace("import fs from 'fs';", "const fs = require('node:fs');")
    .replace("import path from 'path';", "const path = require('node:path');")
    .replace('export default async function handler', 'async function handler');
  const context = vm.createContext({
    require: createRequire(path.resolve('api/songs.js')),
    process: { cwd: () => process.cwd(), env: { KV_REST_API_URL: 'https://example.invalid', KV_REST_API_TOKEN: 'test-only', DB_PREFIX: 'test:' } },
    console,
    fetch: async (url, options) => { const command = JSON.parse(options.body); requests.push(command[0]); return { ok: true, json: async () => ({ result: command[0] === 'LRANGE' ? dbRows.map(s => JSON.stringify(s)) : [] }) }; },
    req: {}, res: { setHeader() {}, status(code) { assert.equal(code,200); return this; }, json(value) { result=value; } },
  });
  vm.runInContext(source, context); await vm.runInContext('handler(req,res)', context);
  const live = new Map(JSON.parse(JSON.stringify(result)).map(s => [s.youtube_id,s]));
  assert.deepEqual(live.get(id).description, { ja: '', en: '' });
  assert.equal(live.get(secondId).description.ja, 'ユーザー自身のコメント');
  assert.equal(live.get('newUser1234').description.ja, 'いい曲');
  assert.equal(live.size, songs.length + 1);
  assert.deepEqual(requests, ['LRANGE','HGETALL','HGETALL']);
  console.log('Description policy tests passed: 308 retired pairs, user edits preserved, real API merge, generator disabled.');
}
run().catch(error => { console.error(error); process.exitCode=1; });
