import { current, state } from './state.js';
import { analyticsMode, trackEvent } from './analytics.js';
import { deliverShare } from './sharing.js';
import { buildPartUrl, clampPartTime, formatPartTime, readPartRequest } from './this-part-link.js';

let capturedTime = 0;
let initialPart = null;
let initialPartApplied = false;
let returnFocus = null;
let arrivalTimer = null;
let jumpRevealTimer = null;
let jumpFallbackTimer = null;
let jumpPollTimer = null;
let jumpHideTimer = null;
let jumpShownAt = 0;
let initialPartReady = false;

const JUMP_REVEAL_DELAY_MS = 2200;
const JUMP_FALLBACK_HIDE_MS = 5600;
const JUMP_MIN_VISIBLE_MS = 650;
const JUMP_READY_HOLD_MS = 450;
const JUMP_POLL_LIMIT_MS = 30000;

const $ = (selector) => document.querySelector(selector);

export { buildPartUrl, clampPartTime, formatPartTime, readPartRequest } from './this-part-link.js';

if (typeof window !== 'undefined') initialPart = readPartRequest(window.location.search);

function copy() {
  const ja = window.i18n?.getLang?.() !== 'en';
  return ja ? {
    trigger: 'この瞬間を共有',
    eyebrow: 'NOW MARKING',
    lead: 'この瞬間を残す。',
    noteLabel: 'シェアに添えるひとこと（任意）',
    notePlaceholder: 'ここが好き。',
    helper: 'リンクを開くと、この位置から再生。',
    jumpLabel: 'JUMPING TO',
    jumpHelp: '指定位置を読み込み中',
    cancel: 'CANCEL',
    share: 'SHARE THIS PART',
    shared: 'LINK COPIED',
  } : {
    trigger: 'Share this moment',
    eyebrow: 'NOW MARKING',
    lead: 'Mark this moment.',
    noteLabel: 'Note (optional)',
    notePlaceholder: 'This part right here.',
    helper: 'The link opens at this exact moment.',
    jumpLabel: 'JUMPING TO',
    jumpHelp: 'Loading the marked moment',
    cancel: 'CANCEL',
    share: 'SHARE THIS PART',
    shared: 'LINK COPIED',
  };
}

function updateCopy() {
  const words = copy();
  $('#thisPartOpen')?.setAttribute('aria-label', words.trigger);
  if ($('#thisPartEyebrow')) $('#thisPartEyebrow').textContent = words.eyebrow;
  if ($('#thisPartLead')) $('#thisPartLead').textContent = words.lead;
  if ($('#thisPartNoteLabel')) $('#thisPartNoteLabel').textContent = words.noteLabel;
  if ($('#thisPartNote')) $('#thisPartNote').placeholder = words.notePlaceholder;
  if ($('#thisPartHelper')) $('#thisPartHelper').textContent = words.helper;
  if ($('#thisPartJumpLabel')) $('#thisPartJumpLabel').textContent = words.jumpLabel;
  if ($('#thisPartJumpHelp')) $('#thisPartJumpHelp').textContent = words.jumpHelp;
  if ($('#thisPartCancel')) $('#thisPartCancel').textContent = words.cancel;
  if ($('#thisPartShare')) $('#thisPartShare').textContent = words.share;
}

function renderTime() {
  const formatted = formatPartTime(capturedTime);
  if ($('#thisPartTime')) $('#thisPartTime').textContent = formatted;
  if ($('#thisPartMarkerTime')) $('#thisPartMarkerTime').textContent = formatted;
  if ($('#thisPartStickerTime')) $('#thisPartStickerTime').textContent = formatted;
  const slider = $('#thisPartRange');
  if (slider) {
    const duration = Number(state.player?.getDuration?.()) || Math.max(capturedTime + 5, 60);
    slider.max = String(Math.max(1, Math.round(duration)));
    slider.value = String(Math.min(capturedTime, Number(slider.max)));
    slider.setAttribute('aria-valuetext', formatted);
  }
}

function positionThisPartSticker() {
  const sticker = $('#thisPartOpen');
  if (!sticker || sticker.hidden) return;
  if (!window.matchMedia('(max-width: 767px)').matches) {
    sticker.style.removeProperty('--this-part-bottom');
    return;
  }
  const report = $('#reportBtn');
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const reportTop = report?.getBoundingClientRect().top;
  const safeBottom = Number.isFinite(reportTop)
    ? Math.max(18, Math.ceil(viewportHeight - reportTop + 10))
    : 18;
  sticker.style.setProperty('--this-part-bottom', `${safeBottom}px`);
}

function syncStickerTime() {
  const trigger = $('#thisPartOpen');
  if (!trigger || trigger.hidden || !state.player || !state.ready) return;
  const value = formatPartTime(state.player.getCurrentTime?.() || 0);
  if ($('#thisPartStickerTime')) $('#thisPartStickerTime').textContent = value;
}

function showArrival() {
  const arrival = $('#thisPartArrival');
  if (!arrival || !initialPartApplied || !initialPartReady) return;
  clearTimeout(arrivalTimer);
  $('#thisPartArrivalTime').textContent = formatPartTime(capturedTime);
  arrival.hidden = false;
  requestAnimationFrame(() => arrival.classList.add('is-show'));
  arrivalTimer = setTimeout(() => {
    arrival.classList.remove('is-show');
    setTimeout(() => { arrival.hidden = true; }, 240);
  }, 4200);
}

function hideSharedPartJump() {
  clearTimeout(jumpRevealTimer);
  clearTimeout(jumpFallbackTimer);
  clearTimeout(jumpHideTimer);
  jumpRevealTimer = null;
  jumpFallbackTimer = null;
  jumpHideTimer = null;
  const jump = $('#thisPartJump');
  if (!jump || jump.hidden) {
    document.body.classList.remove('is-this-part-jumping');
    return;
  }
  const remaining = Math.max(0, JUMP_MIN_VISIBLE_MS - (performance.now() - jumpShownAt));
  jumpHideTimer = setTimeout(() => {
    jump.classList.add('is-out');
    setTimeout(() => {
      jump.hidden = true;
      jump.classList.remove('is-show', 'is-out');
      document.body.classList.remove('is-this-part-jumping');
    }, 320);
  }, remaining);
}

function completeSharedPartLanding() {
  if (initialPartReady) return;
  initialPartReady = true;
  clearTimeout(jumpPollTimer);
  jumpPollTimer = null;
  hideSharedPartJump();
  setTimeout(() => {
    if (document.body.classList.contains('is-started')) showArrival();
  }, JUMP_READY_HOLD_MS);
}

function beginSharedPartLanding(targetSeconds) {
  const jump = $('#thisPartJump');
  if (!jump || !state.player) return;
  initialPartReady = false;
  clearTimeout(jumpRevealTimer);
  clearTimeout(jumpFallbackTimer);
  clearTimeout(jumpPollTimer);
  clearTimeout(jumpHideTimer);
  jump.hidden = true;
  jump.classList.remove('is-show', 'is-out');
  $('#thisPartJumpTime').textContent = formatPartTime(targetSeconds);
  updateCopy();

  const startedAt = performance.now();
  let lastTime = null;
  let advancingSince = null;

  jumpRevealTimer = setTimeout(() => {
    if (initialPartReady) return;
    jump.hidden = false;
    document.body.classList.add('is-this-part-jumping');
    jumpShownAt = performance.now();
    requestAnimationFrame(() => jump.classList.add('is-show'));
  }, JUMP_REVEAL_DELAY_MS);

  // Never block the existing START recovery path if YouTube is slow or unavailable.
  jumpFallbackTimer = setTimeout(hideSharedPartJump, JUMP_FALLBACK_HIDE_MS);

  const check = () => {
    if (initialPartReady) return;
    let time = null;
    let playing = false;
    try {
      time = Number(state.player?.getCurrentTime?.());
      playing = state.player?.getPlayerState?.() === (window.YT?.PlayerState?.PLAYING ?? 1);
    } catch { /* Keep polling until the bounded limit. */ }
    const now = performance.now();
    const atTarget = Number.isFinite(time) && time >= Math.max(0, targetSeconds - 0.75);
    if (playing && atTarget && lastTime !== null && time > lastTime) {
      if (advancingSince === null) advancingSince = now;
    } else if (!playing || !atTarget || (lastTime !== null && time <= lastTime)) {
      advancingSince = null;
    }
    lastTime = time;
    if (advancingSince !== null && now - advancingSince >= JUMP_READY_HOLD_MS) {
      completeSharedPartLanding();
      return;
    }
    if (now - startedAt >= JUMP_POLL_LIMIT_MS) {
      clearTimeout(jumpPollTimer);
      jumpPollTimer = null;
      hideSharedPartJump();
      return;
    }
    jumpPollTimer = setTimeout(check, 150);
  };
  jumpPollTimer = setTimeout(check, 100);
}

export function syncThisPartAvailability() {
  const trigger = $('#thisPartOpen');
  if (!trigger) return;
  const available = Boolean(current()?.youtube_id && state.player && state.ready);
  trigger.hidden = !available;
  if (available) {
    syncStickerTime();
    positionThisPartSticker();
    if (!$('#thisPartOverlay')?.hidden) renderTime();
  }
}

export function openThisPart() {
  if (!current() || !state.player || !state.ready) return;
  capturedTime = clampPartTime(state.player.getCurrentTime?.() || 0);
  returnFocus = document.activeElement;
  renderTime();
  updateCopy();
  const track = $('#thisPartTrack');
  if (track) track.textContent = current().name || '';
  const overlay = $('#thisPartOverlay');
  if (!overlay) return;
  overlay.hidden = false;
  document.body.classList.add('is-this-part-open');
  $('#thisPartOpen')?.setAttribute('aria-expanded', 'true');
  trackEvent('this_part_open', { youtube_id: current().youtube_id, seconds: capturedTime, mode: analyticsMode(state) });
  requestAnimationFrame(() => $('#thisPartClose')?.focus({ preventScroll: true }));
}

export function closeThisPart({ restoreFocus = true } = {}) {
  const overlay = $('#thisPartOverlay');
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.body.classList.remove('is-this-part-open');
  $('#thisPartOpen')?.setAttribute('aria-expanded', 'false');
  if (restoreFocus && returnFocus && typeof returnFocus.focus === 'function') {
    returnFocus.focus({ preventScroll: true });
  }
}

function adjustTime(delta) {
  capturedTime = clampPartTime(capturedTime + delta);
  renderTime();
}

async function shareThisPart() {
  const song = current();
  if (!song) return;
  const url = buildPartUrl(window.location.origin, song.youtube_id, capturedTime);
  const note = $('#thisPartNote')?.value.trim().slice(0, 80) || '';
  const lines = [`THIS PART @ ${formatPartTime(capturedTime)} | ${song.name}`];
  if (note) lines.push(note);
  lines.push(url);
  const outcome = await deliverShare(lines.join('\n'));
  trackEvent('this_part_share', {
    youtube_id: song.youtube_id,
    seconds: capturedTime,
    mode: analyticsMode(state),
    share_outcome: outcome,
  });
  const button = $('#thisPartShare');
  if (button && (outcome === 'copied' || outcome === 'shared')) {
    const original = copy().share;
    button.textContent = copy().shared;
    setTimeout(() => { button.textContent = original; }, 1400);
  }
}

export function applySharedPartOnce() {
  if (!initialPart || initialPartApplied || !state.player || !state.ready) return false;
  const activeId = state.player.getVideoData?.().video_id || current()?.youtube_id;
  if (activeId !== initialPart.youtubeId || current()?.youtube_id !== initialPart.youtubeId) return false;
  try {
    beginSharedPartLanding(initialPart.seconds);
    state.player.seekTo(initialPart.seconds, true);
    initialPartApplied = true;
    capturedTime = initialPart.seconds;
    if (document.body.classList.contains('is-started')) showArrival();
    trackEvent('this_part_open_link', { youtube_id: initialPart.youtubeId, seconds: initialPart.seconds });
    return true;
  } catch {
    return false;
  }
}

function trapOverlayFocus(event) {
  if (event.key !== 'Tab') return;
  const overlay = $('#thisPartOverlay');
  if (!overlay || overlay.hidden) return;
  const focusable = [...overlay.querySelectorAll('button, input, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.disabled && element.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function setupThisPart() {
  updateCopy();
  $('#thisPartOpen')?.addEventListener('click', openThisPart);
  $('#thisPartClose')?.addEventListener('click', closeThisPart);
  $('#thisPartCancel')?.addEventListener('click', closeThisPart);
  $('#thisPartMinus')?.addEventListener('click', () => adjustTime(-5));
  $('#thisPartPlus')?.addEventListener('click', () => adjustTime(5));
  $('#thisPartRange')?.addEventListener('input', (event) => {
    capturedTime = clampPartTime(event.target.value);
    renderTime();
  });
  $('#thisPartShare')?.addEventListener('click', shareThisPart);
  $('#thisPartArrival')?.addEventListener('click', openThisPart);
  $('#thisPartOverlay')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeThisPart();
  });
  $('#thisPartOverlay')?.addEventListener('keydown', trapOverlayFocus);
  window.addEventListener('slaps:languagechange', updateCopy);
  window.addEventListener('resize', positionThisPartSticker, { passive: true });
  window.addEventListener('slaps:started', showArrival);
  setInterval(syncStickerTime, 1000);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#thisPartOverlay')?.hidden) {
      event.preventDefault();
      closeThisPart();
    }
  });
}
