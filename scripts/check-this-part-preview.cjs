const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    'playwright',
    '/Users/aokitakashi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { return require(candidate); } catch (_) {}
  }
  throw new Error('Playwright is unavailable. Set PLAYWRIGHT_MODULE to its installed module path.');
}

const { chromium } = loadPlaywright();
const target = process.env.SLAPS_CHECK_URL || 'http://127.0.0.1:4192/?v=BnSVqxYSPPY&t=74';
const expectedId = new URL(target).searchParams.get('v');
const expectedSeconds = Number(new URL(target).searchParams.get('t')) || 0;
const output = path.resolve(process.env.SLAPS_CHECK_OUTPUT || 'outputs/this-part-preview');

function actionableConsole(text) {
  return !/ERR_BLOCKED_BY_CLIENT|Failed to load resource|doubleclick\.net|googleads|gen_204|favicon|Service Worker registration blocked by Playwright|API load failed, falling back to local JSON|target origin provided \('https:\/\/www\.youtube\.com'\) does not match the recipient window's origin/i.test(text);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
  const evidence = {
    target,
    checked_at: new Date().toISOString(),
    process_muted: true,
    console: [],
    page_errors: [],
    layouts: {},
    status: 'failed',
  };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (value) => { window.__thisPartSharedText = value; } },
      });
    });
    const origin = new URL(target).origin;
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (/googletagmanager|google-analytics|karte|wicle/.test(url.hostname)) return route.fulfill({ status: 204, body: '' });
      if (url.origin === origin && request.method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return route.continue();
    });
    const page = await context.newPage();
    page.on('console', (message) => {
      if (!['warning', 'error'].includes(message.type())) return;
      if (actionableConsole(message.text())) evidence.console.push({ type: message.type(), text: message.text() });
    });
    page.on('pageerror', (error) => evidence.page_errors.push(error.message));

    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__state?.player?.getCurrentTime?.() > 1, null, { timeout: 30000 });
    await page.locator('#unmute').waitFor({ state: 'visible', timeout: 30000 });
    const youtubeFrame = page.frames().find((frame) => /^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\//.test(frame.url()));
    assert.ok(youtubeFrame, 'real YouTube iframe must load');
    const opening = await page.evaluate(() => ({
      id: window.__state.player.getVideoData().video_id,
      muted: window.__state.player.isMuted(),
      time: window.__state.player.getCurrentTime(),
      start: !document.querySelector('#unmute').hidden,
      jumpVisible: document.querySelector('#thisPartJump')?.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || false,
    }));
    assert.equal(opening.id, expectedId);
    assert.equal(opening.muted, true);
    assert.equal(opening.start, true);
    assert.ok(opening.time >= Math.max(0, expectedSeconds - 0.75), `opening must reach shared timestamp ${expectedSeconds}`);
    assert.equal(opening.jumpVisible, false, 'SLAPS jump cover must clear only after the shared timestamp is ready');
    const youtubeSpinner = await youtubeFrame.evaluate(() => [...document.querySelectorAll('.ytp-spinner,.ytp-spinner-container')]
      .some((element) => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })));
    assert.equal(youtubeSpinner, false, 'YouTube loading spinner must not be exposed when START becomes available');

    await page.locator('#unmute').click();
    await page.waitForFunction(id => document.body.classList.contains('is-started')
      && window.__state.player.getVideoData().video_id === id
      && window.__state.player.getPlayerState() === 1, opening.id, { timeout: 30000 });
    await page.locator('#thisPartOpen').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(output, 'desktop-station.png') });

    async function inspectLayout(label, width, height) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(300);
      await page.locator('#thisPartOpen').click();
      await page.locator('#thisPartOverlay').waitFor({ state: 'visible' });
      await page.waitForTimeout(450);
      const layout = await page.evaluate(() => {
        const panel = document.querySelector('.this-part-panel').getBoundingClientRect();
        const overlay = document.querySelector('#thisPartOverlay').getBoundingClientRect();
        const title = document.querySelector('#thisPartTitle').textContent.trim();
        const track = document.querySelector('#thisPartTrack').textContent.trim();
        const time = document.querySelector('#thisPartTime').textContent.trim();
        const style = getComputedStyle(document.documentElement);
        return {
          panel: { top: panel.top, right: panel.right, bottom: panel.bottom, left: panel.left, width: panel.width, height: panel.height },
          overlay: { width: overlay.width, height: overlay.height },
          title,
          track,
          time,
          accent: style.getPropertyValue('--accent').trim(),
          bodyHeight: document.body.scrollHeight,
          viewportHeight: window.innerHeight,
        };
      });
      assert.equal(layout.title, 'THIS PART');
      assert.ok(layout.track.length > 0, `${label}: current track must be visible`);
      assert.match(layout.time, /^\d{2}:\d{2}$|^\d+:\d{2}:\d{2}$/);
      assert.equal(layout.accent.toLowerCase(), '#e0f850');
      evidence.layouts[label] = layout;
      assert.ok(layout.panel.left >= 0 && layout.panel.right <= width + 1, `${label}: panel must fit horizontally`);
      assert.ok(layout.panel.top >= 0 && layout.panel.bottom <= height + 1, `${label}: panel must fit vertically`);
      assert.ok(layout.bodyHeight <= height + 1, `${label}: overlay must not change document height`);
      await page.screenshot({ path: path.join(output, `${label}.png`) });
      await page.keyboard.press('Escape');
      await page.locator('#thisPartOverlay').waitFor({ state: 'hidden' });
    }

    await inspectLayout('desktop-open', 1440, 900);
    await inspectLayout('mobile-390-open', 390, 844);
    await inspectLayout('mobile-320-open', 320, 568);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#thisPartOpen').click();
    await page.locator('#thisPartNote').fill('この入り。');
    await page.locator('#thisPartShare').click();
    await page.waitForFunction(() => window.__thisPartSharedText?.includes('THIS PART @'));
    const shared = await page.evaluate(() => window.__thisPartSharedText);
    const sharedUrl = shared.trim().split('\n').at(-1);
    const params = new URL(sharedUrl).searchParams;
    assert.equal(params.get('v'), expectedId);
    assert.ok(/^\d+$/.test(params.get('t')));
    assert.equal([...params.keys()].sort().join(','), 't,v');
    assert.ok(shared.includes('この入り。'));
    evidence.shared_url = sharedUrl;
    assert.deepEqual(evidence.page_errors, []);
    assert.deepEqual(evidence.console, []);
    evidence.status = 'passed';
  } catch (error) {
    evidence.error = error.stack || error.message;
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
