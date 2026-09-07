// Live acceptance check, intentionally separate from offline npm test.
// Requires Playwright + Chrome. PLAYWRIGHT_MODULE may point to an installed module.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const target = process.env.SLAPS_CHECK_URL || 'https://slaps.tokyo/?v=I55oZGIewkg';
const output = path.resolve(process.env.SLAPS_CHECK_OUTPUT || 'outputs/pc-player-controls');
const centralControls = '.player-control-play-pause-icon,.ytp-bezel,.ytp-large-play-button,.ytmCuedOverlayPlayButton';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
  const evidence = { target, checks: [], failures: [] };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (/googletagmanager|google-analytics|karte|wicle/.test(url.hostname)) return route.fulfill({ body: '' });
      if (url.origin === new URL(target).origin && request.method() !== 'GET') return route.fulfill({ json: {} });
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(target);
    await page.waitForFunction(() => window.__state?.player?.getCurrentTime?.() > 2, null, { timeout: 30000 });
    const opening = await page.evaluate(() => ({
      id: window.__state.player.getVideoData().video_id,
      muted: window.__state.player.isMuted(),
      css: document.querySelector('link[href*="styles.css"]')?.href,
    }));
    evidence.opening = opening;
    assert.equal(opening.muted, true, 'Opening must remain muted');
    await page.locator('#unmute').click();
    await page.waitForFunction(() => window.__state.player.getPlayerState() === 1, null, { timeout: 30000 });
    assert.equal(await page.evaluate(() => window.__state.player.getVideoData().video_id), opening.id, 'START must keep the same video');
    const frame = page.frames().find(f => /^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\//.test(f.url()));
    assert.ok(frame, 'Real YouTube embed must load');
    evidence.embed = frame.url();
    async function check(label, expectedState) {
      await page.waitForFunction(expected => window.__state.player.getPlayerState() === expected, expectedState, { timeout: 15000 });
      await page.waitForTimeout(1800); // Exclude the existing brief tap feedback.
      const own = await page.locator('#playBtn').isVisible();
      const tap = await page.locator('#tapIndicator').isVisible();
      const youtube = await frame.evaluate(selector => [...document.querySelectorAll(selector)]
        .filter(e => e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
        .map(e => ({ className: e.className, label: e.getAttribute('aria-label') })), centralControls);
      const result = { label, expectedState, own, tap, youtube };
      evidence.checks.push(result);
      await page.screenshot({ path: path.join(output, label + '.png') });
      if (own || tap || youtube.length) evidence.failures.push(result);
    }
    for (let cycle = 0; cycle < 3; cycle++) {
      await check(`cycle-${cycle}-playing`, 1);
      await page.mouse.click(720, 450);
      await check(`cycle-${cycle}-paused`, 2);
      await page.mouse.click(720, 450);
    }
    assert.equal(evidence.failures.length, 0, 'Persistent central controls must not appear; see evidence.json and screenshots');
    evidence.status = 'passed';
  } catch (error) {
    evidence.status = 'failed';
    evidence.error = error.message;
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
