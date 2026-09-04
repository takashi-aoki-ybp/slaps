const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const source = process.env.SLAPS_TEST_BASELINE
  ? execFileSync('git', ['show', process.env.SLAPS_TEST_BASELINE + ':src/player.js'], { encoding: 'utf8' })
  : fs.readFileSync('src/player.js', 'utf8');
const start = source.indexOf('export function runIntro()');
const fn = source.slice(start, source.indexOf('\n}', start) + 2).replace('export ', '');
function harness({ promo = false, absent = false, coarse = false } = {}) {
  let now = 0, sequence = 0, playing = false, stalled = false, mediaTime = 0;
  const timers = new Map(), listeners = new Map();
  const el = () => ({ hidden: true, textContent: 'Original', removed: false,
    classList: { values: new Set(), add(v) { this.values.add(v); }, remove(v) { this.values.delete(v); }, contains(v) { return this.values.has(v); } },
    addEventListener(event, cb) { this[event] = cb; }, removeEventListener(event) { delete this[event]; }, remove() { this.removed = true; } });
  const intro = el(), button = el(), retry = el(), sub = el(), copy = el(), body = el();
  copy.hidden = false;
  let mutes = 0, plays = 0, retries = 0, catalogRetries = 0, promos = 0;
  const state = { ready: true, muted: true, all: [{}], player: {
    getCurrentTime: () => coarse ? Math.floor(mediaTime * 4) / 4 : mediaTime,
    getPlayerState: () => playing ? 1 : 3,
    getVideoData: () => ({ video_id: 'video' }), mute: () => mutes++, playVideo: () => plays++,
  } };
  const ctx = vm.createContext({ state, current: () => ({ youtube_id: 'video' }), URLSearchParams,
    performance: { now: () => now }, window: { location: { search: '', pathname: promo ? '/promo' : '/' },
      addEventListener: (k, f) => listeners.set(k, f), removeEventListener: k => listeners.delete(k),
      retrySLAPS: () => catalogRetries++, i18n: { t: k => k } },
    document: { body, querySelector: s => ({ '#intro': absent ? null : intro, '#unmute': button, '#introRetry': retry, '#introSub': sub, '#introCopy': copy })[s] },
    setTimeout: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; }, clearTimeout: id => timers.delete(id),
    createYTPlayer: () => retries++, startPromoPlayback: () => promos++,
  });
  vm.runInContext('let introStarted=false, introFinished=false;\n' + fn + '\nrunIntro();', ctx);
  function advance(ms) {
    const target = now + ms;
    for (;;) {
      const next = [...timers].filter(([, x]) => x.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      if (playing && !stalled) mediaTime += (next[1].at - now) / 1000;
      now = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    if (playing && !stalled) mediaTime += (target - now) / 1000;
    now = target;
  }
  return { intro, button, retry, copy, body, state, advance, timers, listeners,
    play() { playing = true; }, buffer() { playing = false; }, stall() { stalled = true; },
    skip() { listeners.get('keydown')?.(); },
    retryClick() { retry.click({ stopPropagation() {} }); },
    get counts() { return { mutes, plays, retries, catalogRetries, promos }; },
    get fading() { return intro.classList.values.has('is-out'); } };
}
const tests = [
  ['stalled player reveals START over the opaque opening after a bounded wait', () => { const h=harness();h.advance(5999);assert.equal(h.button.hidden,true);assert.equal(h.copy.hidden,false);h.advance(451);assert.equal(h.copy.hidden,true);assert.equal(h.button.hidden,false);assert.equal(h.fading,false);assert.equal(h.intro.removed,false); }],
  // User explicitly replaced v3.44's hidden-during-fade behavior: START must
  // paint FIRST, then remain above the whole fade. v3.47 also requires the text
  // to be gone before START enters; the fallback preserves both guarantees.
  ['text exits before START fades in, then the background fades', () => { const h=harness();h.play();h.advance(2500);assert.equal(h.fading,false);assert.equal(h.button.hidden,true);h.advance(200);assert.equal(h.intro.classList.contains('is-copy-out'),true);assert.equal(h.copy.hidden,false);assert.equal(h.button.hidden,true);h.advance(399);assert.equal(h.button.hidden,true);h.advance(1);assert.equal(h.copy.hidden,true);assert.equal(h.button.hidden,false);assert.equal(h.fading,false);h.advance(400);assert.equal(h.fading,false);h.advance(50);assert.equal(h.fading,true);h.advance(1500);assert.equal(h.button.hidden,false);assert.equal(h.intro.removed,false);h.advance(100);assert.equal(h.button.hidden,false);assert.equal(h.intro.removed,true);assert.equal(h.timers.size,0); }],
  ['late playback keeps START covered, then fades after progress settles', () => { const h=harness();h.advance(6000);h.play();h.advance(450);assert.equal(h.copy.hidden,true);assert.equal(h.button.hidden,false);assert.equal(h.fading,false);h.advance(600);assert.equal(h.fading,false);h.advance(449);assert.equal(h.fading,false);h.advance(1);assert.equal(h.fading,true);h.advance(1600);assert.equal(h.intro.removed,true); }],
  ['coarse API time updates can settle', () => { const h=harness({coarse:true});h.play();h.advance(5300);assert.equal(h.intro.removed,true); }],
  ['PLAYING with frozen time uses the same covered START recovery', () => { const h=harness();h.play();h.stall();h.advance(6500);assert.equal(h.fading,false);assert.equal(h.button.hidden,false);assert.equal(h.copy.hidden,true);assert.equal(h.intro.removed,false); }],
  ['fallback START gesture completes the covered handoff', () => { const h=harness();h.advance(6500);assert.equal(h.button.hidden,false);h.state.muted=false;h.button.hidden=true;h.advance(1800);assert.equal(h.intro.removed,true);assert.equal(h.button.hidden,true);assert.equal(h.timers.size,0); }],
  ['buffering during fade restores background, never the departed text', () => { const h=harness();h.play();h.advance(3600);assert.equal(h.fading,true);h.buffer();h.advance(3000);assert.equal(h.fading,false);assert.equal(h.intro.removed,false);assert.equal(h.button.hidden,false);assert.equal(h.copy.hidden,true);h.play();h.advance(3200);assert.equal(h.intro.removed,true); }],
  ['early audio unlock never resurrects START or cancels the fade', () => { for (const clickAt of [3100,3700]) {const h=harness();h.play();h.advance(clickAt);assert.equal(h.button.hidden,false);h.state.muted=false;h.button.hidden=true;h.buffer();h.advance(2100);assert.equal(h.intro.removed,true);assert.equal(h.button.hidden,true);assert.equal(h.state.muted,false);assert.equal(h.timers.size,0);} }],
  ['START can recover when playback buffered during handoff', () => {const h=harness();h.play();h.advance(3300);h.buffer();h.advance(300);assert.equal(h.fading,false);assert.equal(h.button.hidden,false);assert.equal(h.copy.hidden,true);h.state.muted=false;h.button.hidden=true;h.advance(1800);assert.equal(h.intro.removed,true);assert.equal(h.button.hidden,true);assert.equal(h.timers.size,0);}],
  ['buffering before text exit restores text without introducing START', () => {const h=harness();h.play();h.advance(2800);h.buffer();h.advance(3000);assert.equal(h.intro.classList.contains('is-copy-out'),false);assert.equal(h.copy.hidden,false);assert.equal(h.button.hidden,true);h.play();h.advance(3600);assert.equal(h.intro.removed,true);assert.equal(h.copy.hidden,true);}],
  ['re-muting after START does not reopen the entry gate', () => {const h=harness();h.play();h.advance(3200);h.body.classList.add('is-started');h.button.hidden=true;h.state.muted=true;h.buffer();h.advance(2100);assert.equal(h.intro.removed,true);assert.equal(h.button.hidden,true);}],
  ['skip cannot expose buffering video or unlock audio', () => { const h=harness();h.skip();h.advance(2000);assert.equal(h.button.hidden,true);assert.equal(h.intro.removed,false);assert.equal(h.state.muted,true);h.play();h.advance(3600);assert.equal(h.intro.removed,true); }],
  ['missing player and catalog expose START without exposing the iframe', () => { const h=harness();h.state.ready=false;h.state.player=null;h.state.all=[];h.advance(6500);assert.equal(h.retry.hidden,true);assert.equal(h.button.hidden,false);assert.equal(h.intro.removed,false);assert.equal(h.fading,false); }],
  ['promo keeps its existing short muted entry', () => { const h=harness({promo:true});h.advance(650);assert.equal(h.counts.promos,1);assert.equal(h.intro.removed,true); }],
];
let failed = 0;
for (const [name, work] of tests) { try { work(); console.log('PASS', name); } catch (error) { failed++; console.error('FAIL', name, error.message); } }
console.log(`${tests.length} intro regressions, ${failed} failed.`);
if (failed) process.exitCode = 1;
