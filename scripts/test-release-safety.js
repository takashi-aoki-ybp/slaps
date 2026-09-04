const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp');
const { extractLengthSeconds, isTooShortTrack } = require('./audit-youtube.js');

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

async function loadQualityModule() {
  const source = read('api/utils/submission-quality.js');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

async function run() {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.dependencies.jimp, '1.6.1',
    'image generation must stay on the audited Jimp release');

  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(!vercel.crons || vercel.crons.length === 0, 'retired auto-classify cron must not be scheduled');

  const cron = read('api/cron/auto-classify.js');
  assert.match(cron, /!expected\s*\|\|/);
  assert.match(cron, /status\(410\)/);
  assert.doesNotMatch(cron, /\bDEL\b|\bRPUSH\b|generativelanguage/);

  const quality = await loadQualityModule();
  assert.equal(quality.normalizeTrackTitle('Nas - One Mic (Official Video)'), 'nas one mic');
  assert.equal(quality.normalizeTrackTitle('Nas – One Mic [Official Music Video]'), 'nas one mic');
  assert.equal(quality.eraFromPublishDate('2016-07-29'), '10s');
  assert.equal(quality.eraFromPublishDate('2024-02-01'), '20s');
  assert.equal(quality.assessHipHop({ category: 'Music', keywords: ['hip hop'] }).confident, true);
  assert.equal(quality.assessHipHop({ category: 'Music', title: 'Lion Heart' }).confident, false);
  assert.equal(quality.assessHipHop({ category: 'Comedy', keywords: ['rap'] }).confident, false);
  assert.equal(quality.findTitleDuplicate('Nas - One Mic [Official Video]', [{ name: 'Nas - One Mic' }]).name, 'Nas - One Mic');
  assert.equal(extractLengthSeconds('{"lengthSeconds":"16"}'), 16);
  assert.equal(extractLengthSeconds('<html>metadata unavailable</html>'), null);
  assert.equal(isTooShortTrack(16), true);
  assert.equal(isTooShortTrack(169), false);
  assert.equal(isTooShortTrack(null), false);
  assert.ok(!JSON.parse(read('data/songs.json')).some(song => song.youtube_id === 'cvxAVkrXNvQ'),
    'known 16-second same side teaser must not return to the catalog');

  const submit = read('api/submit.js');
  assert.match(submit, /eraFromPublishDate/);
  assert.match(submit, /findTitleDuplicate/);
  assert.match(submit, /moderation_status: 'live'/);
  assert.doesNotMatch(submit, /assessHipHop|status: 'needs_review'/);
  assert.match(submit, /slaps:submission_ids/);
  assert.match(submit, /LREM/);

  const youtubeSearch = read('api/youtube-search.js');
  assert.match(youtubeSearch, /yt_search_rate/);
  assert.match(youtubeSearch, /attempts > 30/);
  assert.match(youtubeSearch, /yt_search:v1/);

  const middleware = read('middleware.js');
  assert.match(middleware, /matcher:\s*\['\/\(\(\?!api\/\)\.\*\)'\]/,
    'API routes must bypass page metadata middleware');

  const ogImage = read('api/og-image.js');
  assert.match(ogImage, /export default \{ fetch: handleOgImage \}/,
    'OG endpoint must use the Web Request/Response handler');
  assert.doesNotMatch(ogImage, /req\.query|res\.send|res\.setHeader/,
    'OG endpoint must not fall back to the legacy Node response adapter');

  const manifest = JSON.parse(read('manifest.json'));
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((item) => item.sizes === `${size}x${size}`);
    assert.ok(icon, `manifest must declare ${size}x${size}`);
    const image = await Jimp.read(path.join(process.cwd(), icon.src.replace(/^\.\//, '')));
    assert.equal(image.bitmap.width, size);
    assert.equal(image.bitmap.height, size);
  }

  assert.ok(fs.existsSync(path.join(process.cwd(), 'robots.txt')));
  assert.ok(fs.existsSync(path.join(process.cwd(), 'sitemap.xml')));
  const html = read('index.html');
  assert.match(html, /HIPHOP Online Station/);
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(html, /id="toast"[^>]*role="status"[^>]*aria-live="polite"/,
    'transient errors and confirmations must be announced without stealing focus');
  assert.match(html, /<button type="button" class="vibe-ticker" id="vibeTicker"/,
    'the clickable live-listener ticker must be keyboard operable');
  assert.match(html, /ミュートのままランダム再生/);
  assert.match(html, /id="pinBtn"[^>]*aria-pressed="false"/,
    'mobile markup must not claim the desktop-only pinned default');
  assert.doesNotMatch(html, /id="pinBtn"[^>]*class="[^"]*is-pinned/,
    'mobile markup must not style the unpinned default as active');
  assert.match(read('src/ui.js'), /setAttribute\('aria-pressed'/);
  assert.doesNotMatch(read('src/ui.js'), /el\.innerHTML = msg/,
    'toast text, including API errors, must not be injected as HTML');
  assert.match(read('src/ui.js'), /split\(\/<br\\s\*\\\/\?>\/i\)/,
    'safe toast rendering must preserve intentional line breaks');
  assert.match(read('src/ui.js'), /openDialog\(\$\('#submitModal'\), \$\('#ytUrl'\), \$\('#submitOpen'\)\)/,
    'the add-track dialog must move focus inside and remember its trigger');
  assert.match(read('src/ui.js'), /closeDialog\(\$\('#favModal'\), \$\('#favOpen'\)/,
    'the saved-tracks dialog must restore focus when it closes');
  assert.doesNotMatch(read('src/ui.js'), /class="fav-item"[^>]*role="button"/,
    'saved-track rows must not create a button containing nested buttons');
  assert.match(read('src/ui.js'), /class="fav-item__body" data-fav-play/,
    'saved-track title and metadata must remain an explicit play button');
  assert.match(read('src/state.js'), /commentMode: 0/);
  assert.doesNotMatch(read('src/ui.js'), /fav-item__sub[^\n]*zoneLabel/);
  assert.doesNotMatch(read('src/ui.js'), /needs_review|toastNeedsReview/);
  assert.doesNotMatch(read('i18n.js'), /HIPHOPを自動確認|HIPHOPかどうかの確認後|HIPHOP checks/);
  assert.match(read('src/ui.js'), /if \(opts\.first\)[\s\S]*state\.index = 0;[\s\S]*loadCurrent\(\);/);
  assert.match(read('src/ui.js'), /order === 'newest' \? \{ first: true \} :/);
  assert.match(read('src/ui.js'), /state\.all = data;[\s\S]*setBalance\(state\.balance, \{ first: true \}\)/);
  assert.doesNotMatch(read('src/state.js'), /injectPromoSongs|promoIdx|countSinceLastPromo/,
    'retired promotional queue weighting must not remain available for accidental reactivation');

  console.log('Release safety tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
