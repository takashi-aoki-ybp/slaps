const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const guards = require('../api/utils/request-guards.js');
const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

async function run() {
  const songs = JSON.parse(read('data/songs.json'));
  const knownId = songs[0].youtube_id;
  const emptyKv = async () => [];

  assert.equal(await guards.isCataloguedYoutubeId(knownId, emptyKv, 'guard-test:'), true);
  assert.equal(await guards.isCataloguedYoutubeId('abcdefghijk', emptyKv, 'guard-test:'), false);
  assert.deepEqual(
    await guards.filterCataloguedYoutubeIds([knownId, 'abcdefghijk'], emptyKv, 'guard-test:'),
    [knownId],
  );

  const rateCommands = [];
  const allowed = await guards.takeRateLimit({
    req: { headers: { 'x-forwarded-for': '203.0.113.5' } },
    kvFetch: async (command) => {
      rateCommands.push(command);
      return command[0] === 'INCR' ? 1 : 1;
    },
    prefix: 'guard-test:',
    scope: 'endpoint',
    limit: 5,
    windowSeconds: 60,
  });
  assert.equal(allowed.allowed, true);
  assert.equal(rateCommands[0][0], 'INCR');
  assert.deepEqual(rateCommands[1].slice(0, 2), ['EXPIRE', rateCommands[0][1]]);

  const blocked = await guards.takeRateLimit({
    req: { headers: { 'x-real-ip': '198.51.100.9' } },
    kvFetch: async () => 6,
    prefix: 'guard-test:',
    scope: 'endpoint',
    limit: 5,
    windowSeconds: 60,
  });
  assert.equal(blocked.allowed, false);

  assert.equal(guards.isAllowedWebOrigin({ headers: { origin: 'https://slaps.tokyo' } }), true);
  assert.equal(guards.isAllowedWebOrigin({ headers: { origin: 'https://preview.vercel.app' } }), true);
  assert.equal(guards.isAllowedWebOrigin({ headers: { origin: 'https://example.com' } }), false);

  const broken = read('api/mark_broken.js');
  assert.match(broken, /isCataloguedYoutubeId/);
  assert.match(broken, /broken_reporters/);
  assert.match(broken, /LTRIM/);

  const comments = read('api/comments.js');
  const likes = read('api/comments/like.js');
  assert.match(comments, /status\(410\)/);
  assert.doesNotMatch(comments, /RPUSH/);
  assert.match(likes, /status\(410\)/);
  assert.doesNotMatch(likes, /\bINCR\b/);

  for (const file of ['api/og-image.js', 'api/crate-og.js', 'api/report.js']) {
    const source = read(file);
    assert.match(source, /CataloguedYoutubeId/);
    assert.match(source, /takeRateLimit/);
  }

  const presence = read('api/presence.js');
  assert.match(presence, /isAllowedWebOrigin/);
  assert.match(presence, /isCataloguedYoutubeId/);
  assert.doesNotMatch(presence, /Access-Control-Allow-Origin', '\*'/);

  const player = read('src/player.js');
  assert.match(player, /primaryGenreName/);
  assert.match(player, /ヒップホップ\|ラップ/);
  const ui = read('src/ui.js');
  assert.match(ui, /active\.focus\(\{ preventScroll: true \}\)/);
  assert.match(ui, /!\$\('#digOverlay'\)\.hidden/);
  assert.match(read('src/presence.js'), /!state\.started/);
  assert.match(read('src/presence.js'), /Someone is playing:/);
  const styles = read('styles.css');
  assert.match(styles, /\.vibe-ticker\s*\{[\s\S]*left: max\(24px, env\(safe-area-inset-left\)\)/);
  assert.match(styles, /@media \(max-width: 768px\)[\s\S]*\.vibe-ticker\s*\{[\s\S]*left: 50%/);

  console.log('Public API and UI safety guard tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
