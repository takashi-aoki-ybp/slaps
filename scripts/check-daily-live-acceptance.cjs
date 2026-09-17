// Production-only live acceptance for the daily SLAPS release.
// It performs real UI clicks in a process-muted isolated Chrome session.
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
const target = process.env.SLAPS_CHECK_URL || 'https://slaps.tokyo/';
const dailyDate = process.env.SLAPS_DAILY_DATE || new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const output = path.resolve(process.env.SLAPS_CHECK_OUTPUT || `outputs/daily-automation/${dailyDate}`);
const evidencePath = path.join(output, 'live-interactions.json');
const screenshot = (page, name) => page.screenshot({ path: path.join(output, `live-${name}.png`) });

function actionableConsole(message) {
  return !/ERR_BLOCKED_BY_CLIENT|Failed to load resource|doubleclick\.net|blocked by CORS policy|googleads|gen_204|Service Worker registration blocked by Playwright/i.test(message);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
  const evidence = {
    status: 'failed',
    target,
    daily_date: dailyDate,
    checked_at: new Date().toISOString(),
    process_muted: true,
    writes_intercepted: true,
    console: [],
    actionable_console: [],
    page_errors: [],
    same_origin_request_failures: [],
  };

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'allow' });
    const page = await context.newPage();
    const origin = new URL(target).origin;

    page.on('console', (message) => {
      if (!['warning', 'error'].includes(message.type())) return;
      const item = { type: message.type(), text: message.text() };
      evidence.console.push(item);
      if (actionableConsole(item.text)) evidence.actionable_console.push(item);
    });
    page.on('pageerror', (error) => evidence.page_errors.push(error.message));
    page.on('requestfailed', (request) => {
      const url = new URL(request.url());
      if (url.origin === origin) evidence.same_origin_request_failures.push({ url: request.url(), error: request.failure()?.errorText || '' });
    });
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (/googletagmanager|google-analytics|karte|wicle/.test(url.hostname)) {
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      if (url.origin === origin && request.method() !== 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.continue();
    });

    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__state?.player?.getCurrentTime?.() > 1, null, { timeout: 30000 });
    await page.locator('#unmute').waitFor({ state: 'visible', timeout: 30000 });
    const beforeStart = await page.evaluate(() => ({
      video_id: window.__state.player.getVideoData().video_id,
      current_id: window.__state.queue[window.__state.index]?.youtube_id,
      time: window.__state.player.getCurrentTime(),
      player_state: window.__state.player.getPlayerState(),
      muted: window.__state.player.isMuted(),
      volume: window.__state.player.getVolume(),
      start_visible: !document.querySelector('#unmute').hidden,
      listening_intent: document.body.classList.contains('is-started'),
    }));
    await page.waitForTimeout(1800);
    const openingProgress = await page.evaluate(() => ({
      video_id: window.__state.player.getVideoData().video_id,
      time: window.__state.player.getCurrentTime(),
      muted: window.__state.player.isMuted(),
    }));
    assert.equal(beforeStart.muted, true, 'opening must be muted');
    assert.equal(beforeStart.start_visible, true, 'START must be visible');
    assert.equal(openingProgress.video_id, beforeStart.video_id, 'opening must keep the same video');
    assert.ok(openingProgress.time > beforeStart.time + 0.5, 'opening video must advance before START');
    await screenshot(page, 'before-start');

    await page.locator('#unmute').click();
    await page.waitForFunction((id) => document.body.classList.contains('is-started')
      && window.__state?.player?.getVideoData?.().video_id === id
      && window.__state.player.getPlayerState() === 1
      && !window.__state.player.isMuted(), beforeStart.video_id, { timeout: 30000 });
    await page.waitForTimeout(1900);
    const afterStart = await page.evaluate(() => ({
      video_id: window.__state.player.getVideoData().video_id,
      current_id: window.__state.queue[window.__state.index]?.youtube_id,
      time: window.__state.player.getCurrentTime(),
      player_state: window.__state.player.getPlayerState(),
      muted: window.__state.player.isMuted(),
      volume: window.__state.player.getVolume(),
      body_started: document.body.classList.contains('is-started'),
      start_present: Boolean(document.querySelector('#unmute')),
      start_visible: document.querySelector('#unmute') ? !document.querySelector('#unmute').hidden : false,
    }));
    assert.equal(afterStart.video_id, beforeStart.video_id, 'START must keep the same video ID');
    assert.equal(afterStart.current_id, beforeStart.current_id, 'START must keep the same queue item');
    assert.ok(afterStart.time > openingProgress.time, 'same video must continue after START');
    assert.equal(afterStart.player_state, 1, 'player must be playing after START');
    assert.equal(afterStart.muted, false, 'START must unlock player audio state');
    assert.equal(afterStart.body_started, true, 'START must enter the started UI state');
    assert.equal(afterStart.start_visible, false, 'START button must leave after activation');
    await screenshot(page, 'after-start');

    const beforeLatestId = afterStart.video_id;
    await page.locator('[data-order="newest"]').click();
    await page.waitForFunction(() => window.__state?.order === 'newest'
      && window.__state?.player?.getVideoData?.()?.video_id === window.__state?.queue?.[window.__state.index]?.youtube_id
      && window.__state.player.getPlayerState() === 1, null, { timeout: 30000 });
    await page.locator('[data-order="newest"]').filter({ hasText: 'LATEST' }).waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(1200);
    const latest = await page.evaluate(() => ({
      before_video_id: null,
      video_id: window.__state.player.getVideoData().video_id,
      current_id: window.__state.queue[window.__state.index]?.youtube_id,
      current_name: window.__state.queue[window.__state.index]?.name,
      index: window.__state.index,
      order: window.__state.order,
      player_state: window.__state.player.getPlayerState(),
      muted: window.__state.player.isMuted(),
      track_count: document.querySelector('#trackCount')?.textContent?.trim(),
      active: document.querySelector('[data-order="newest"]')?.classList.contains('is-active'),
    }));
    latest.before_video_id = beforeLatestId;
    assert.equal(latest.order, 'newest');
    assert.equal(latest.index, 0);
    assert.equal(latest.video_id, latest.current_id);
    assert.equal(latest.player_state, 1);
    assert.equal(latest.muted, false);
    assert.equal(latest.active, true);
    await screenshot(page, 'latest');

    await page.locator('#digOpen').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#digOpen').click();
    await page.locator('#digOverlay').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#digOverlayList .dig-record').first().waitFor({ state: 'visible', timeout: 30000 });
    const cards = page.locator('#digOverlayList .dig-record');
    const cardCount = await cards.count();
    assert.ok(cardCount > 0, 'DIG must contain at least one suggestion');
    const targetIndex = cardCount > 1 ? 1 : 0;
    await cards.nth(targetIndex).click();
    await page.waitForFunction((index) => document.querySelectorAll('#digOverlayList .dig-record')[index]?.classList.contains('is-active')
      && !document.querySelector('#digOverlayDetail').hidden, targetIndex, { timeout: 10000 });
    const dig = await page.evaluate((index) => ({
      overlay_visible: !document.querySelector('#digOverlay').hidden,
      card_count: document.querySelectorAll('#digOverlayList .dig-record').length,
      selected_index: [...document.querySelectorAll('#digOverlayList .dig-record')].findIndex((item) => item.classList.contains('is-active')),
      selected_title: document.querySelector('#digOverlayDetailName')?.textContent?.trim(),
      selected_artist: document.querySelector('#digOverlayDetailArtist')?.textContent?.trim(),
      detail_visible: !document.querySelector('#digOverlayDetail').hidden,
      intended_index: index,
    }), targetIndex);
    assert.equal(dig.overlay_visible, true);
    assert.equal(dig.selected_index, targetIndex);
    assert.ok(dig.selected_title, 'DIG selected title must be populated');
    assert.equal(dig.detail_visible, true);
    await screenshot(page, 'dig-selected');
    await page.locator('#digClose').click();
    await page.locator('#digOverlay').waitFor({ state: 'hidden', timeout: 10000 });

    await page.locator('#dailyOpen').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#dailyOpen').click();
    await page.locator('#dailyOverlay').waitFor({ state: 'visible', timeout: 10000 });
    const dailyBefore = await page.evaluate(() => ({
      date: document.querySelector('#dailyDate')?.textContent?.trim(),
      count: document.querySelectorAll('#dailyList .daily-card').length,
      first_id: document.querySelector('#dailyList .daily-card')?.dataset.dailyPlay,
      play_all_label: document.querySelector('#dailyPlayAll')?.textContent?.trim(),
    }));
    assert.equal(dailyBefore.date, dailyDate.replaceAll('-', '.'));
    assert.equal(dailyBefore.count, 10);
    assert.ok(dailyBefore.first_id);
    await page.locator('#dailyPlayAll').click();
    await page.waitForFunction((expectedId) => window.__state?.dailyMode === true
      && window.__state?.queue?.length === 10
      && window.__state?.index === 0
      && window.__state?.player?.getVideoData?.()?.video_id === expectedId
      && window.__state.player.getPlayerState() === 1, dailyBefore.first_id, { timeout: 30000 });
    const dailyTimeBefore = await page.evaluate(() => window.__state.player.getCurrentTime());
    await page.waitForTimeout(1800);
    const playAll = await page.evaluate(() => ({
      daily_mode: window.__state.dailyMode,
      daily_date: window.__state.dailyDate,
      queue_length: window.__state.queue.length,
      index: window.__state.index,
      current_id: window.__state.queue[window.__state.index]?.youtube_id,
      current_name: window.__state.queue[window.__state.index]?.name,
      video_id: window.__state.player.getVideoData().video_id,
      time: window.__state.player.getCurrentTime(),
      player_state: window.__state.player.getPlayerState(),
      muted: window.__state.player.isMuted(),
      overlay_hidden: document.querySelector('#dailyOverlay').hidden,
      url: location.href,
    }));
    assert.equal(playAll.daily_mode, true);
    assert.equal(playAll.daily_date, dailyDate);
    assert.equal(playAll.queue_length, 10);
    assert.equal(playAll.index, 0);
    assert.equal(playAll.current_id, dailyBefore.first_id);
    assert.equal(playAll.video_id, dailyBefore.first_id);
    assert.equal(playAll.player_state, 1);
    assert.equal(playAll.muted, false);
    assert.equal(playAll.overlay_hidden, true);
    assert.ok(playAll.time > dailyTimeBefore + 0.5, 'PLAY ALL video must advance');
    await screenshot(page, 'play-all');

    evidence.opening = { before: beforeStart, after_wait: openingProgress };
    evidence.start = { before: beforeStart, after: afterStart, same_video: beforeStart.video_id === afterStart.video_id };
    evidence.latest = latest;
    evidence.dig = dig;
    evidence.play_all = { before: dailyBefore, after: playAll };
    evidence.assertions = {
      start_same_video: true,
      start_unmuted_player_state: true,
      latest_live_ui_click: true,
      dig_open_select: true,
      play_all_10: true,
      page_errors_zero: evidence.page_errors.length === 0,
      actionable_console_zero: evidence.actionable_console.length === 0,
      same_origin_request_failures_zero: evidence.same_origin_request_failures.length === 0,
    };
    assert.equal(evidence.page_errors.length, 0, `page errors: ${evidence.page_errors.join(' | ')}`);
    assert.equal(evidence.actionable_console.length, 0, `actionable console: ${JSON.stringify(evidence.actionable_console)}`);
    assert.equal(evidence.same_origin_request_failures.length, 0, `same-origin failures: ${JSON.stringify(evidence.same_origin_request_failures)}`);
    evidence.status = 'pass';
    await context.close();
  } catch (error) {
    evidence.error = error.stack || error.message;
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
    await browser.close();
    console.log(JSON.stringify(evidence, null, 2));
  }
})();
