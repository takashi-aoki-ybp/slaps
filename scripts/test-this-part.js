const assert = require('node:assert/strict');
const fs = require('node:fs');

async function run() {
  const sourceUrl = `data:text/javascript;base64,${Buffer.from(fs.readFileSync('src/this-part-link.js')).toString('base64')}`;
  const { buildPartUrl, clampPartTime, formatPartTime, readPartRequest } = await import(sourceUrl);

  assert.equal(clampPartTime(-9), 0);
  assert.equal(clampPartTime(74.4), 74);
  assert.equal(clampPartTime(999999), 43200);
  assert.equal(formatPartTime(74), '01:14');
  assert.equal(formatPartTime(3723), '1:02:03');
  assert.deepEqual(readPartRequest('?v=abcdefghijk&t=74'), { youtubeId: 'abcdefghijk', seconds: 74 });
  assert.deepEqual(readPartRequest('?foo=1&v=A1b2C3d4E5_&t=7.6'), { youtubeId: 'A1b2C3d4E5_', seconds: 8 });
  assert.equal(readPartRequest('?v=short&t=5'), null);
  assert.equal(readPartRequest('?v=abcdefghijk'), null);
  assert.equal(buildPartUrl('https://preview.example.com/path', 'abcdefghijk', 74), 'https://preview.example.com/?v=abcdefghijk&t=74');

  const html = fs.readFileSync('index.html', 'utf8');
  for (const id of ['thisPartOpen', 'thisPartOverlay', 'thisPartRange', 'thisPartShare', 'thisPartArrival', 'thisPartJump', 'thisPartJumpTime']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} must remain in the page contract`);
  }

  const css = fs.readFileSync('styles.css', 'utf8');
  assert.match(css, /--accent:\s*#e0f850/i, 'DIG fluorescent yellow must be the shared accent');
  for (const legacy of [/#6baaff/i, /#ff6b4a/i, /#00e676/i, /#00ff66/i, /#ff3366/i, /#ffcc00/i, /rgba\(255,\s*51,\s*102/i]) {
    assert.doesNotMatch(css, legacy, `legacy colored accent remains: ${legacy}`);
  }

  const thisPart = fs.readFileSync('src/this-part.js', 'utf8');
  assert.match(thisPart, /beginSharedPartLanding\(initialPart\.seconds\);[\s\S]*seekTo\(initialPart\.seconds, true\)/,
    'shared landing must cover the YouTube seek before it starts');
  assert.match(thisPart, /time >= Math\.max\(0, targetSeconds - 0\.75\)/,
    'shared landing must confirm the requested timestamp');
  assert.match(thisPart, /now - advancingSince >= JUMP_READY_HOLD_MS/,
    'shared landing must confirm advancing playback before it clears');

  const serviceWorker = fs.readFileSync('service-worker.js', 'utf8');
  assert.match(serviceWorker, /this-part\.js\?v=3\.85/);
  assert.match(serviceWorker, /this-part-link\.js\?v=3\.85/);
  console.log('THIS PART contract tests passed: URL, timestamp, markup, palette, offline assets.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
