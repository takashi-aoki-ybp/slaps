import { state, REGION_LABELS, CT, current, getFilteredPool, playableCount, eligibleByBalance, applyOrder } from './state.js';
import { db } from './db.js';
import { togglePlay, next, prev, loadCurrent, unmute, createYTPlayer, seekBy, setVolume } from './player.js';
import { analyticsMode, trackEvent } from './analytics.js';
import { buildDailyArchive, dailyShareUrl } from './daily.js';

const $ = (sel) => document.querySelector(sel);

// ---- プログレスバーのアニメーション ----
let progressRAF = null;
export function startProgress() {
  stopProgress();
  (function tick() {
    if (!state.player || !state.ready) return;
    try {
      const dur = state.player.getDuration() || 1;
      const cur = state.player.getCurrentTime() || 0;
      $('#progressBar').style.width = `${(cur / dur) * 100}%`;
      checkComments(cur);
    } catch {
      stopProgress();
      return;
    }
    progressRAF = requestAnimationFrame(tick);
  })();
}
export function stopProgress() { if (progressRAF) { cancelAnimationFrame(progressRAF); progressRAF = null; } }
export function resetProgress() { $('#progressBar').style.width = '0%'; }

// ---- トースト通知 ----
let toastTimer = null;
export function showToast(msg) {
  const el = $('#toast');
  el.innerHTML = msg;
  el.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-show'), 3500);
}

// ---- アイドル時UIを隠す ----
let idleTimer = null;
const IDLE_MS = 3500;
export function wake() {
  document.body.classList.remove('is-idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const aboutOverlay = $('#aboutOverlay');
    if ($('#submitModal').hidden && $('#reportModal').hidden && $('#favModal').hidden && $('#dailyOverlay').hidden && aboutOverlay.hidden && !state.paused) {
      document.body.classList.add('is-idle');
    }
  }, IDLE_MS);
}

// ---- UI表示曲数更新 ----
export function updateTrackCount() {
  const el = $('#trackCount');
  if (!el) return;
  const n = playableCount();
  const unit = window.i18n.t(n === 1 ? 'track' : 'tracks');
  el.innerHTML = `<b>${n.toLocaleString(window.i18n.getLang() === 'ja' ? 'ja-JP' : 'en-US')}</b>&nbsp;${unit}`;
  el.classList.toggle('is-filtered', state.crateMode || state.dailyMode || state.region !== 'all' || state.era !== 'all');
}

function clearSpecialMode() {
  const wasSpecial = state.crateMode || state.dailyMode;
  state.crateMode = false;
  state.crateIds = [];
  state.dailyMode = false;
  state.dailyIds = [];
  $('#dailyOpen')?.classList.remove('is-active');
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('crate');
    url.searchParams.delete('daily');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {}
}

const clearCrateMode = clearSpecialMode;

// ---- Vibeネオンカラー更新 ----
export function updateVibeColor(p, element = balanceRange) {
  if (!element) return;
  let color;
  if (p < 2.5) {
    const ratio = p / 2.5;
    const r = Math.round(107 + (255 - 107) * ratio);
    const g = Math.round(170 + (255 - 170) * ratio);
    const b = 255;
    color = `rgb(${r}, ${g}, ${b})`;
  } else {
    const ratio = (p - 2.5) / 2.5;
    const r = 255;
    const g = Math.round(255 - (255 - 107) * ratio);
    const b = Math.round(255 - (255 - 74) * ratio);
    color = `rgb(${r}, ${g}, ${b})`;
  }
  element.style.setProperty('--vibe-color', color);
}

export function updateBalanceLabel(p) {
  function zoneLabel(v) { if (v <= 2) return 'CONSCIOUS'; if (v >= 4) return 'TURNT'; return 'ALL'; }
  const el = $('#balanceZone');
  if (el) el.textContent = zoneLabel(p);
}

// ---- バランス（Conscious/Turnt）設定 ----
export function setBalance(p, opts = {}) {
  state.balance = p;
  const cur = current();
  state.queue = eligibleByBalance(p);
  applyOrder(state.queue);
  updateVibeColor(p);
  if (opts.shareId) {
    const targetSong = state.all.find((s) => s.youtube_id === opts.shareId);
    if (targetSong) {
      const filtered = state.queue.filter((s) => s.youtube_id !== opts.shareId);
      state.queue = [targetSong, ...filtered];
      state.index = 0;
      if (state.ready && state.queue.length) loadCurrent();
      return;
    }
  }
  if (opts.first) {
    state.index = 0;
    if (state.ready && state.queue.length) loadCurrent();
    return;
  }
  if (opts.keep && cur) {
    if (state.order === 'shuffle') {
      const filtered = state.queue.filter((s) => s.youtube_id !== cur.youtube_id);
      state.queue = [cur, ...filtered];
      state.index = 0;
      return;
    }
    const keepIdx = state.queue.findIndex((s) => s.youtube_id === cur.youtube_id);
    if (keepIdx >= 0) { state.index = keepIdx; return; }
    state.queue.unshift(cur);
    state.index = 0;
    return;
  }
  state.index = (cur && state.queue.length > 1 && state.queue[0].youtube_id === cur.youtube_id) ? 1 : 0;
  if (state.ready && state.queue.length) loadCurrent();
}

// ---- フィルター変更フィードバック ----
let filterFeedbackTimer = null;
export function showFilterFeedback() {
  clearTimeout(filterFeedbackTimer);
  filterFeedbackTimer = setTimeout(() => {
    const n = playableCount();
    if (n === 0) {
      showToast(window.i18n.t('noMatch') + ' — ' + window.i18n.t('tryBroaderFilters'));
    } else if (state.region !== 'all' || state.era !== 'all') {
      showToast(window.i18n.t('filterApplied'));
    }
  }, 400);
}

export function setRegion(region) {
  clearCrateMode();
  trackEvent('filter_region', { region });
  state.region = region;
  document.querySelectorAll('.region__btn').forEach((b) => {
    const active = b.dataset.region === region;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  state.favMode = false;
  $('#favOpen').classList.remove('is-active');
  updateFavCount();
  setBalance(state.balance, { keep: true });
  updateTrackCount();
  showFilterFeedback();
}

export function setEra(era) {
  clearCrateMode();
  trackEvent('filter_era', { era });
  state.era = era;
  document.querySelectorAll('.era__btn').forEach((b) => {
    const active = b.dataset.era === era;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  state.favMode = false;
  $('#favOpen').classList.remove('is-active');
  updateFavCount();
  setBalance(state.balance, { keep: true });
  updateTrackCount();
  showFilterFeedback();
}

export async function setOrder(order) {
  clearCrateMode();
  trackEvent('order', { order });
  if (order === state.order && order !== 'newest' && order !== 'shuffle') return;
  state.order = order;
  document.querySelectorAll('.order__btn').forEach((b) => {
    const active = b.dataset.order === order;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  // 1. Immediately apply order to the queue based on current memory
  if (state.favMode) {
    const cur = current();
    applyOrder(state.queue);
    if (state.order === 'shuffle') state.index = 0;
    else state.index = (cur && state.queue[0] && state.queue[0].youtube_id === cur.youtube_id && state.queue.length > 1) ? 1 : 0;
    if (state.ready) loadCurrent();
  } else {
    // If LATEST (newest) or SHUFFLE is clicked, we want to play the new song (index 0) immediately.
    const shouldCutPlay = (order === 'newest' || order === 'shuffle');
    setBalance(state.balance, order === 'newest' ? { first: true } : { keep: !shouldCutPlay });
  }

  // 2. Fetch latest database songs in the background if LATEST is selected
  if (order === 'newest') {
    const btn = document.querySelector(`[data-order="${order}"]`);
    const originalHTML = btn ? btn.innerHTML : '';
    const labelText = 'LATEST';
    // Avoid backing up the loading "..." HTML on rapid double-clicks
    const fixedOriginalHTML = (originalHTML && originalHTML.includes('...')) ? labelText : originalHTML;
    if (btn) btn.innerHTML = '<span style="opacity: 0.5;">...</span>';
    try {
      const res = await fetch(`/api/songs?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        // Check if the user hasn't switched away from target order while waiting
        if (Array.isArray(data) && state.order === order) {
          state.all = data;
          initDaily();
          updateTrackCount();
          if (!state.favMode) {
            // LATEST is an explicit request for the newest track. A stale tab may
            // only learn about a submission here, so do not preserve the old song.
            setBalance(state.balance, { first: true });
          }
        }
      }
    } catch (e) {
      console.warn(`Failed to refresh songs on ${labelText} click:`, e);
    } finally {
      if (btn) btn.innerHTML = fixedOriginalHTML;
    }
  }
}

// ---- 曲情報メタ描画 ----
export function renderMeta(song) {
  const meta = $('#meta');
  renderFavBtn();
  updatePromoBadge(song);
  meta.classList.remove('is-show');
  setTimeout(() => {
    $('#metaTitle').textContent = song.name;
    const idleTitle = $('#idleTitle');
    if (idleTitle) idleTitle.textContent = song.name;
    const descEl = $('#metaDesc');
    let desc = '';
    if (song.description) {
      if (typeof song.description === 'string') {
        desc = song.description;
      } else {
        const lang = window.i18n.getLang();
        desc = song.description[lang] || song.description.en || song.description.ja || '';
      }
    }
    descEl.textContent = desc;
    descEl.hidden = !desc;
    
    // サンプリング元ネタの表示
    const samplesEl = $('#metaSamples');
    if (samplesEl) {
      if (song.sample_sources && song.sample_sources.length > 0) {
        const listStr = song.sample_sources.map(src => `"${src.title}" by ${src.artist}`).join(', ');
        samplesEl.textContent = `🎤 Samples: ${listStr}`;
        samplesEl.hidden = false;
      } else {
        samplesEl.hidden = true;
      }
    }
    
    $('#metaUser').textContent = song.user_name ? `${window.i18n.t('postedBy')} ${song.user_name}` : '';
    $('#metaRegion').textContent = REGION_LABELS[song.region] || '';
    meta.classList.add('is-show');
  }, 250);
}

// ---- ピン留め ----
export function togglePin() {
  state.pinned = !state.pinned;
  document.body.classList.toggle('is-pinned', state.pinned);
  $('#pinBtn').classList.toggle('is-pinned', state.pinned);
  $('#pinBtn').setAttribute('aria-pressed', state.pinned ? 'true' : 'false');
  $('#playBtn').style.display = state.pinned ? 'none' : '';
}

// ---- Fill mode ----
export function toggleFill() {
  state.fill = !state.fill;
  document.body.classList.toggle('is-fill', state.fill);
  $('#fillBtn').classList.toggle('is-fill', state.fill);
  $('#fillBtn').setAttribute('aria-pressed', state.fill ? 'true' : 'false');
}

// ---- 投稿 ----
const YT_ID_RE = /(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/;
function parseYouTubeId(url) {
  if (/^[A-Za-z0-9_-]{11}$/.test(url)) {
    return url;
  }
  const m = url.match(YT_ID_RE);
  return m ? m[1] : null;
}

let urlInputDebounce = null;
export async function onUrlInput() {
  clearTimeout(urlInputDebounce);
  urlInputDebounce = setTimeout(async () => {
    const id = parseYouTubeId($('#ytUrl').value.trim());
    const preview = $('#preview');
    if (!id) { preview.hidden = true; $('#submitDo').disabled = true; return; }
    
    // 即時重複検知
    if (state.all.some((s) => s.youtube_id === id)) {
      preview.hidden = true;
      $('#submitDo').disabled = true;
      showToast(window.i18n.t('toastDuplicate'));
      return;
    }
    
    if (state.fromDig && state.digArtwork && id === state.digVideoId) {
      $('#previewThumb').src = state.digArtwork;
    } else {
      $('#previewThumb').src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    }
    $('#previewTitle').textContent = 'Loading...';
    preview.hidden = false;
    $('#submitDo').disabled = false;
    try {
      const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`);
      const data = await res.json();
      $('#previewTitle').textContent = data.title || '(Title fetch failed)';
      $('#previewTitle').dataset.title = data.title || '';
    } catch {
      $('#previewTitle').textContent = '(Title fetch failed)';
    }
  }, 300);
}

function zoneLabel(v) { if (v <= 2) return 'CONSCIOUS'; if (v >= 4) return 'TURNT'; return 'ALL'; }

let lastSubmitTime = 0;
export async function doSubmit() {
  if (Date.now() - lastSubmitTime < 30000) {
    showToast(window.i18n.t('toastWait'));
    return;
  }
  const id = parseYouTubeId($('#ytUrl').value.trim());
  if (!id) return;
  if (state.all.some((s) => s.youtube_id === id)) {
    showToast(window.i18n.t('toastDuplicate'));
    return;
  }
  const rawName = ($('#previewTitle').dataset.title || 'Untitled').trim().slice(0, 100);
  const rawDesc = $('#ytComment').value.trim().slice(0, 500);
  const rawUser = ($('#ytName').value.trim() || window.i18n.t('anon')).slice(0, 50);
  const song = {
    youtube_id: id,
    name: rawName,
    description: rawDesc,
    user_name: rawUser,
    thumbnail: (state.fromDig && state.digArtwork && id === state.digVideoId)
      ? state.digArtwork
      : `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
    region: $('#ytRegion').value || null,
    era: $('#ytEra').value || null,
    conscious_turnt: (ytCtTouched && $('#ytConsTurnt')) ? Number($('#ytConsTurnt').value) : null,
  };
  const btn = $('#submitDo');
  const inputs = [
    $('#ytUrl'),
    $('#ytConsTurnt'),
    $('#ytRegion'),
    $('#ytEra'),
    $('#ytName'),
    $('#ytComment'),
    btn
  ];
  inputs.forEach((el) => { if (el) el.disabled = true; });
  try {
    const result = await db.submit(song);
    if (!result || result.status !== 'published' || !result.song) throw new Error('Submit failed');
    state.all = [result.song, ...state.all.filter((item) => item.youtube_id !== result.song.youtube_id)];
    trackEvent('submit_success', { youtube_id: result.song.youtube_id });
    setBalance(state.balance, { keep: true });
    updateTrackCount();
    lastSubmitTime = Date.now();
    closeModal();
    showToast(window.i18n.t('toastAdded'));
  } catch (error) {
    if (error && error.message && error.message !== 'Submit failed') {
      if (error.message.includes('already exists')) {
        showToast(window.i18n.t('toastDuplicate'));
      } else {
        showToast(error.message);
      }
    } else {
      showToast(window.i18n.t('toastAddFail'));
    }
  } finally {
    inputs.forEach((el) => { if (el) el.disabled = false; });
  }
}

export function openDig() {
  const overlay = $('#digOverlay');
  overlay.hidden = false;
  trackEvent('dig_open', { suggestions: state.recommendations.length });
  const trigger = $('#digOpen');
  if (trigger) trigger.setAttribute('aria-expanded', 'true');
  const ticker = $('#vibeTicker');
  if (ticker) ticker.hidden = true;
  document.body.style.overflow = 'hidden';
  syncDigDetailPlacement();
  requestAnimationFrame(() => {
    const active = $('#digOverlayList .dig-record.is-active') || $('#digOverlayList .dig-record');
    if (active) {
      setDigSelection(active);
      active.focus({ preventScroll: true });
    }
  });
}
export function closeDig({ restoreFocus = true } = {}) {
  $('#digOverlay').hidden = true;
  const trigger = $('#digOpen');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  const detail = $('#digOverlayDetail');
  const crate = $('#digOverlay .dig-crate');
  if (detail) {
    detail.hidden = true;
    if (crate && detail.parentElement !== crate) crate.append(detail);
  }
  document.body.style.overflow = '';
  if (restoreFocus && trigger && !trigger.hidden) trigger.focus({ preventScroll: true });
}

function syncDigDetailPlacement() {
  const overlay = $('#digOverlay');
  const detail = $('#digOverlayDetail');
  const crate = $('#digOverlay .dig-crate');
  if (!overlay || !detail || !crate || overlay.hidden) return;
  const mobile = window.matchMedia('(max-width: 480px)').matches;
  const target = mobile ? document.body : crate;
  if (detail.parentElement !== target) target.append(detail);
}

function positionDigSticker() {
  const sticker = $('#digOpen');
  if (!sticker || sticker.hidden) return;
  if (!window.matchMedia('(max-width: 767px)').matches) {
    sticker.style.removeProperty('--dig-bottom');
    return;
  }
  const report = $('#reportBtn');
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const reportTop = report?.getBoundingClientRect().top;
  const safeBottom = Number.isFinite(reportTop)
    ? Math.max(18, Math.ceil(viewportHeight - reportTop + 10))
    : 18;
  sticker.style.setProperty('--dig-bottom', `${safeBottom}px`);
}

function setDigSelection(item) {
  if (!item) return;
  const list = $('#digOverlayList');
  const detail = $('#digOverlayDetail');
  if (!list || !detail) return;
  list.querySelectorAll('.dig-record').forEach((record) => {
    const active = record === item;
    record.classList.toggle('is-active', active);
    record.setAttribute('aria-selected', String(active));
    record.tabIndex = active ? 0 : -1;
  });
  detail.hidden = false;
  detail.dataset.artist = item.dataset.artist || '';
  detail.dataset.title = item.dataset.title || '';
  detail.dataset.artwork = item.dataset.artwork || '';
  detail.dataset.youtubeId = item.dataset.youtubeId || '';
  detail.dataset.registered = item.dataset.registered || 'false';
  $('#digOverlayDetailIndex').textContent = `${String(Number(item.dataset.index) + 1).padStart(2, '0')} / ${String(list.querySelectorAll('.dig-record').length).padStart(2, '0')}`;
  $('#digOverlayDetailName').textContent = item.dataset.title || '';
  $('#digOverlayDetailArtist').textContent = item.dataset.artist || '';
  $('#digOverlayDetailAction').textContent = item.dataset.registered === 'true' ? '▶ PLAY' : '＋ ADD';
}

function handleDigKeyboard(e) {
  const records = [...e.currentTarget.querySelectorAll('.dig-record')];
  const currentIndex = records.indexOf(e.target.closest('.dig-record'));
  if (currentIndex < 0) return;
  const columns = Math.max(1, getComputedStyle(e.currentTarget).gridTemplateColumns.split(' ').length);
  let nextIndex = currentIndex;
  if (e.key === 'ArrowRight') nextIndex = Math.min(records.length - 1, currentIndex + 1);
  else if (e.key === 'ArrowLeft') nextIndex = Math.max(0, currentIndex - 1);
  else if (e.key === 'ArrowDown') nextIndex = Math.min(records.length - 1, currentIndex + columns);
  else if (e.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - columns);
  else if (e.key === 'Home') nextIndex = 0;
  else if (e.key === 'End') nextIndex = records.length - 1;
  else return;
  e.preventDefault();
  setDigSelection(records[nextIndex]);
  records[nextIndex].focus();
}

export function openModal() {
  $('#submitModal').hidden = false;
  closeDig({ restoreFocus: false }); // スマホ用オーバーレイが開いていれば同時に閉じる
}
export function closeModal() {
  $('#submitModal').hidden = true;
  $('#ytUrl').value = ''; $('#ytComment').value = ''; $('#ytName').value = '';
  $('#ytRegion').value = ''; $('#ytEra').value = '';
  $('#preview').hidden = true; $('#submitDo').disabled = true;
  ytCtTouched = false;
  const ytCtEl = $('#ytConsTurnt'); if (ytCtEl) { ytCtEl.value = '2.5'; }
  const ytCtValEl = $('#ytConsTurntVal'); if (ytCtValEl) { ytCtValEl.textContent = window.i18n.t('vibeNotSet'); }
  state.fromDig = false;
  state.digArtwork = null;
  state.digVideoId = null;
}

// ---- 報告 ----
export function openReport() {
  const song = current();
  if (!song) return;
  $('#reportTarget').textContent = `${window.i18n.t('reportingPrefix')} "${song.name}"`;
  $('#reportNote').value = '';
  $('#reportModal').hidden = false;
}
export function closeReport() { $('#reportModal').hidden = true; }
let lastReportTime = 0;
export async function doReport() {
  if (Date.now() - lastReportTime < 30000) {
    showToast(window.i18n.t('toastWait'));
    return;
  }
  const song = current();
  if (!song) return;
  const report = {
    youtube_id: song.youtube_id,
    name: song.name,
    reason: $('#reportReason').value,
    note: $('#reportNote').value.trim(),
  };
  const btn = $('#reportDo');
  btn.disabled = true;
  try {
    await db.report(report);
    lastReportTime = Date.now();
    closeReport();
    showToast(window.i18n.t('toastReported'));
  } catch {
    showToast(window.i18n.t('toastReportFail'));
  } finally {
    btn.disabled = false;
  }
}

// ---- お気に入り ----
const FAV_KEY = 'slaps_favorites';
export function favGet() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } }
export function favSave(arr) { try { localStorage.setItem(FAV_KEY, JSON.stringify(arr)); } catch { /* quota exceeded */ } }
export function isFav(id) { return favGet().some((f) => f.youtube_id === id); }

export function toggleFav() {
  const song = current();
  if (!song) return;
  let favs = favGet();
  const removing = favs.some((f) => f.youtube_id === song.youtube_id);
  if (removing) {
    favs = favs.filter((f) => f.youtube_id !== song.youtube_id);
  } else {
    favs.unshift({
      youtube_id: song.youtube_id, name: song.name, description: song.description || '',
      user_name: song.user_name || '', thumbnail: song.thumbnail || `https://img.youtube.com/vi/${song.youtube_id}/mqdefault.jpg`,
      region: song.region || null, era: song.era || null, conscious_turnt: CT(song),
    });
    showFavToast();
  }
  trackEvent('save', { action: removing ? 'remove' : 'add', youtube_id: song.youtube_id });
  favSave(favs);
  renderFavBtn();
  updateFavCount();
}

const FAV_NOTICE_OFF = 'slaps_fav_notice_off';
let favToastTimer = null;
export function showFavToast() {
  try { if (localStorage.getItem(FAV_NOTICE_OFF)) return; } catch { return; }
  const t = $('#favToast');
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('is-show'));
  clearTimeout(favToastTimer);
  favToastTimer = setTimeout(hideFavToast, 4500);
}
export function hideFavToast() {
  const t = $('#favToast');
  t.classList.remove('is-show');
  setTimeout(() => { t.hidden = true; }, 300);
}

export function renderFavBtn() {
  const song = current();
  const btn = $('#favBtn');
  const on = song ? isFav(song.youtube_id) : false;
  btn.textContent = on ? window.i18n.t('saved') : window.i18n.t('save');
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.classList.toggle('is-fav', on);
}
export function updateFavCount() {
  const count = state.crateMode ? state.crateIds.length : favGet().length;
  const labelKey = state.crateMode ? 'crateExit' : (state.favMode ? 'favOpenActive' : 'favOpen');
  const label = window.i18n.t(labelKey);
  const icon = state.crateMode || state.favMode ? '◀' : '♡';
  $('#favOpen').innerHTML = `${icon} ${label} (<span id="favCount">${count}</span>)`;
  $('#favOpen').classList.toggle('is-active', state.crateMode || state.favMode);
}
window.updateFavCount = updateFavCount;

function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export function openFavs() {
  const favs = favGet();
  const list = $('#favList');
  $('#favEmpty').hidden = favs.length > 0;
  $('#favPlayAll').hidden = favs.length === 0;
  $('#crateShare').hidden = favs.length === 0;
  list.innerHTML = favs.map((f) => `
    <div class="fav-item" data-yt="${escapeHtml(f.youtube_id)}" role="button" tabindex="0">
      <img class="fav-item__thumb" loading="lazy" src="${escapeHtml(f.thumbnail)}" alt="">
      <div class="fav-item__body">
        <span class="fav-item__title">${escapeHtml(f.name)}</span>
        <span class="fav-item__sub">${escapeHtml(f.user_name || window.i18n.t('anon'))} · ${REGION_LABELS[f.region] || ''}</span>
      </div>
      <button type="button" class="fav-item__btn" data-fav-play aria-label="Play" tabindex="-1">▶</button>
      <button type="button" class="fav-item__btn fav-item__del" data-fav-del aria-label="Remove" tabindex="0">×</button>
    </div>`).join('');
  $('#favModal').hidden = false;
}
export function closeFavs() { $('#favModal').hidden = true; }

export function playFavorites(fromId) {
  const favs = favGet();
  if (!favs.length) return;
  state.favMode = true;
  clearCrateMode();
  state.queue = favs.map((f) => ({ ...f }));
  if (fromId) {
    state.index = Math.max(0, state.queue.findIndex((s) => s.youtube_id === fromId));
  } else {
    applyOrder(state.queue);
    state.index = 0;
  }
  $('#favOpen').classList.add('is-active');
  updateFavCount();
  if (state.ready) loadCurrent();
  closeFavs();
}

async function sharePayload(fullCopyText) {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile && navigator.share) {
    try {
      await navigator.share({ text: fullCopyText });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(fullCopyText);
    showToast(window.i18n.t('shareCopied'));
  } catch (_) {
    const input = document.createElement('input');
    input.value = fullCopyText;
    input.style.position = 'absolute';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand('copy');
      showToast(window.i18n.t('shareCopied'));
    } catch (__err) {}
    document.body.removeChild(input);
  }
}

export async function shareCrate() {
  const ids = favGet().map((song) => song.youtube_id).filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id)).slice(0, 50);
  if (!ids.length) return;
  const url = new URL('/', window.location.origin);
  url.searchParams.set('crate', ids.join('.'));
  const shareText = window.i18n.t('crateShareText').replace('{count}', String(ids.length));
  trackEvent('share_crate', { count: ids.length });
  await sharePayload(`${shareText}\n${url.toString()}`);
}

export async function doShare() {
  const song = current();
  if (!song) return;
  const shareUrl = `${window.location.origin}/?v=${song.youtube_id}`;

  // OGP 画像の事前生成をバックグラウンドでトリガー（プリウォーム）
  fetch(`/api/og-image?v=${song.youtube_id}`).catch(() => {});

  const shareText = `Play on SLAPS | ${song.name}`;
  const fullCopyText = `${shareText}\n${shareUrl}`;
  trackEvent('share_track', { youtube_id: song.youtube_id, mode: analyticsMode(state) });
  await sharePayload(fullCopyText);
}

let dailyArchive = [];
let dailyIndex = 0;

function dailyEntry(date) {
  return dailyArchive.find((entry) => entry.date === date) || dailyArchive[0] || null;
}

function renderDaily(date) {
  const entry = dailyEntry(date);
  if (!entry) return;
  dailyIndex = Math.max(0, dailyArchive.findIndex((item) => item.date === entry.date));
  state.dailyDate = entry.date;
  $('#dailyDate').textContent = entry.date.replaceAll('-', '.');
  $('#dailyPrev').disabled = dailyIndex >= dailyArchive.length - 1;
  $('#dailyNext').disabled = dailyIndex <= 0;
  const list = $('#dailyList');
  list.innerHTML = entry.tracks.map((song, index) => `
    <button type="button" class="daily-card" data-daily-play="${escapeHtml(song.youtube_id)}" aria-label="${escapeHtml(song.name)}">
      <span class="daily-card__cover"><img loading="lazy" src="${escapeHtml(song.thumbnail || `https://img.youtube.com/vi/${song.youtube_id}/mqdefault.jpg`)}" alt=""></span>
      <span class="daily-card__number">${String(index + 1).padStart(2, '0')}</span>
      <strong class="daily-card__title">${escapeHtml(song.name)}</strong>
    </button>`).join('');
  $('#dailyPlayAll').textContent = window.i18n.t('dailyPlayAll').replace('{count}', entry.tracks.length);
  $('#dailyCount').textContent = `${entry.tracks.length} CUTS`;
}

export function openDaily(date = state.dailyDate) {
  if (!dailyArchive.length) return;
  renderDaily(date);
  $('#dailyOverlay').hidden = false;
  document.body.style.overflow = 'hidden';
  trackEvent('daily_open', { date: state.dailyDate });
  requestAnimationFrame(() => $('#dailyClose')?.focus({ preventScroll: true }));
}

export function closeDaily() {
  $('#dailyOverlay').hidden = true;
  document.body.style.overflow = '';
  $('#dailyOpen')?.focus({ preventScroll: true });
}

export function playDaily(fromId = '') {
  const entry = dailyEntry(state.dailyDate);
  if (!entry?.tracks.length) return;
  clearSpecialMode();
  state.favMode = false;
  state.dailyMode = true;
  state.dailyDate = entry.date;
  state.dailyIds = entry.tracks.map((song) => song.youtube_id);
  state.queue = entry.tracks.map((song) => ({ ...song }));
  state.index = fromId ? Math.max(0, state.queue.findIndex((song) => song.youtube_id === fromId)) : 0;
  $('#dailyOpen')?.classList.add('is-active');
  updateTrackCount();
  updateFavCount();
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('crate');
    url.searchParams.set('daily', entry.date);
    history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {}
  trackEvent('daily_play', { date: entry.date, start_index: state.index + 1, count: entry.tracks.length });
  if (state.ready) loadCurrent();
  closeDaily();
}

export async function shareDaily() {
  const entry = dailyEntry(state.dailyDate);
  if (!entry) return;
  const url = dailyShareUrl(window.location.origin, entry.date);
  const text = window.i18n.t('dailyShareText').replace('{date}', entry.date).replace('{count}', entry.tracks.length);
  trackEvent('daily_share', { date: entry.date, count: entry.tracks.length });
  await sharePayload(`${text}\n${url}`);
}

export function initDaily() {
  dailyArchive = buildDailyArchive(state.all);
  const open = $('#dailyOpen');
  if (!dailyArchive.length || !open) return;
  const requested = state.dailyDate;
  const entry = dailyEntry(requested);
  state.dailyDate = entry.date;
  $('#dailyOpenCount').textContent = entry.tracks.length;
  open.hidden = false;
  if (requested) openDaily(requested);
}
window.refreshDaily = () => { if (dailyArchive.length) renderDaily(state.dailyDate); };

export function trapFocus(modal) {
  modal.addEventListener('keydown', (e) => {
    if (modal.hidden || e.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.disabled && element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
    else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
  });
}

const INFO_GUIDE_KEY = 'slaps_info_shown';
export function showInfoGuide() {
  try { if (localStorage.getItem(INFO_GUIDE_KEY)) return; } catch { return; }
  try { localStorage.setItem(INFO_GUIDE_KEY, '1'); } catch { /* ignore */ }
  setTimeout(() => {
    const btn = $('#infoLink');
    if (!btn) return;
    btn.classList.add('guide-pulse');
    document.body.classList.add('guide-active');
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      btn.classList.remove('guide-pulse');
      document.body.classList.remove('guide-active');
      clearTimeout(guideTimeout);
    };
    btn.addEventListener('click', stop, { once: true });
    const guideTimeout = setTimeout(stop, 8000);
  }, 3000);
}

// ---- イベントバインディングと初期セットアップ ----
export const balanceRange = $('#balanceRange');
let ytCtTouched = false;

export function setupUIListeners() {
  const aboutOverlay = $('#aboutOverlay');
  const dailyOverlay = $('#dailyOverlay');

  // Next / Prev / Play
  $('#nextBtn').addEventListener('click', next);
  $('#prevBtn').addEventListener('click', prev);
  $('#playBtn').addEventListener('click', togglePlay);

  // player click for play/pause in pinned mode
  $('#player').addEventListener('click', (e) => {
    if (!state.pinned) return;
    if (e.target.closest('button, a, input, select, .brand, .dock, .top-right, .regions, .eras, .balance, .order')) return;
    const wasPlaying = state.player && state.player.getPlayerState() === YT.PlayerState.PLAYING;
    togglePlay();
    const ind = $('#tapIndicator');
    ind.hidden = false;
    ind.classList.toggle('is-paused', wasPlaying);
    ind.style.animation = 'none';
    ind.offsetHeight;
    ind.style.animation = '';
    setTimeout(() => { ind.hidden = true; }, 650);
  });

  // Modal actions
  $('#submitOpen').addEventListener('click', openModal);
  $('#submitClose').addEventListener('click', closeModal);
  $('#submitDo').addEventListener('click', doSubmit);
  $('#ytUrl').addEventListener('input', onUrlInput);
  $('#unmute').addEventListener('click', unmute);
  $('#reportBtn').addEventListener('click', openReport);
  $('#reportClose').addEventListener('click', closeReport);
  $('#reportDo').addEventListener('click', doReport);
  $('#dailyOpen').addEventListener('click', () => openDaily());
  $('#dailyClose').addEventListener('click', closeDaily);
  $('#dailyPlayAll').addEventListener('click', () => playDaily());
  $('#dailyShare').addEventListener('click', shareDaily);
  $('#dailyPrev').addEventListener('click', () => renderDaily(dailyArchive[Math.min(dailyArchive.length - 1, dailyIndex + 1)]?.date));
  $('#dailyNext').addEventListener('click', () => renderDaily(dailyArchive[Math.max(0, dailyIndex - 1)]?.date));
  $('#dailyList').addEventListener('click', (event) => {
    const card = event.target.closest('[data-daily-play]');
    if (card) playDaily(card.dataset.dailyPlay);
  });

  // Form Vibe slider
  const ytCt = $('#ytConsTurnt');
  if (ytCt) {
    ytCt.addEventListener('input', () => {
      ytCtTouched = true;
      const v = Number(ytCt.value);
      const ytCtValEl = $('#ytConsTurntVal');
      if (ytCtValEl) ytCtValEl.textContent = `${v.toFixed(1)} ${zoneLabel(v)}`;
      updateVibeColor(v, ytCt);
    });
  }

  // Vibe slider
  if (balanceRange) {
    balanceRange.addEventListener('input', () => {
      const v = Number(balanceRange.value);
      updateBalanceLabel(v);
      updateVibeColor(v);
    });
    balanceRange.addEventListener('change', () => {
      clearCrateMode();
      state.favMode = false;
      $('#favOpen').classList.remove('is-active');
      updateFavCount();
      setBalance(Number(balanceRange.value));
    });
    ['touchstart', 'touchend'].forEach((ev) =>
      balanceRange.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
  }

  // Playback order
  $('#order').addEventListener('click', (e) => {
    const btn = e.target.closest('.order__btn');
    if (btn) setOrder(btn.dataset.order);
  });

  // Regions
  $('#regions').addEventListener('click', (e) => {
    const btn = e.target.closest('.region__btn');
    if (btn) setRegion(btn.dataset.region);
  });

  // Eras
  $('#eras').addEventListener('click', (e) => {
    const btn = e.target.closest('.era__btn');
    if (btn) setEra(btn.dataset.era);
  });

  // Pin / Fill
  $('#pinBtn').addEventListener('click', togglePin);
  $('#fillBtn').addEventListener('click', toggleFill);

  // Default Pin settings based on viewport
  if (window.innerWidth >= 768) {
    state.pinned = true;
    document.body.classList.add('is-pinned');
    $('#pinBtn').classList.add('is-pinned');
    $('#pinBtn').setAttribute('aria-pressed', 'true');
    $('#playBtn').style.display = 'none';
  }
  
  // Default fill settings (ON by default)
  document.body.classList.add('is-fill');
  $('#fillBtn').classList.add('is-fill');
  $('#fillBtn').setAttribute('aria-pressed', 'true');

  // Share / Favs
  $('#shareBtn').addEventListener('click', doShare);
  $('#favBtn').addEventListener('click', toggleFav);
  $('#favOpen').addEventListener('click', () => {
    if (state.crateMode || state.favMode) {
      clearCrateMode();
      state.favMode = false;
      $('#favOpen').classList.remove('is-active');
      updateFavCount();
      setBalance(state.balance);
      updateTrackCount();
      showToast(window.i18n.t('toastBackToAll'));
    } else {
      openFavs();
    }
  });
  $('#favClose').addEventListener('click', closeFavs);
  $('#favPlayAll').addEventListener('click', () => playFavorites());
  $('#crateShare').addEventListener('click', shareCrate);

  // 音量コントロールの初期化 (HOTFIX)
  const volumeSlider = $('#volumeSlider');
  const volumeValue = $('#volumeValue');
  const volumeIcon = $('#volumeIcon');
  if (volumeSlider && volumeValue && volumeIcon) {
    const initVol = state.muted ? 0 : state.volume;
    volumeSlider.value = initVol;
    volumeValue.textContent = `${initVol}%`;
    volumeIcon.textContent = initVol === 0 ? '🔇' : '🔊';

    volumeSlider.addEventListener('input', () => {
      const vol = parseInt(volumeSlider.value, 10);
      setVolume(vol);
      volumeValue.textContent = `${vol}%`;
      volumeIcon.textContent = vol === 0 ? '🔇' : '🔊';
    });

    volumeIcon.addEventListener('click', () => {
      if (state.volume > 0 && !state.muted) {
        state.preMuteVolume = state.volume;
        setVolume(0);
        volumeSlider.value = 0;
        volumeValue.textContent = '0%';
        volumeIcon.textContent = '🔇';
      } else {
        const restoreVol = state.preMuteVolume || 100;
        setVolume(restoreVol);
        volumeSlider.value = restoreVol;
        volumeValue.textContent = `${restoreVol}%`;
        volumeIcon.textContent = '🔊';
      }
    });
  }

  // 推薦曲の追加アクション (PCホバー / スマホオーバーレイ共通)
  const handleRecommendClick = async (e) => {
    const item = e.target.closest('.recommend-item');
    if (!item || item.classList.contains('is-loading')) return;
    if (item.id === 'digOverlayDetail' && !e.target.closest('.dig-overlay-detail__action')) return;

    const isRegistered = item.dataset.registered === 'true';
    const youtubeId = item.dataset.youtubeId;

    if (isRegistered && youtubeId) {
      closeDig();
      const targetSong = state.all.find(s => s.youtube_id === youtubeId);
      if (targetSong) {
        const filtered = state.queue.filter(s => s.youtube_id !== youtubeId);
        state.queue = [targetSong, ...filtered];
        state.index = 0;
        loadCurrent();
      }
      return;
    }

    const artist = item.dataset.artist;
    const title = item.dataset.title;
    const artwork = item.dataset.artwork;

    item.classList.add('is-loading');
    state.fromDig = true;

    // 透過オーバーレイを表示して検索中の状態を明示する
    const overlay = $('#recommendOverlay');
    const overlayText = $('#recommendOverlayText');
    const isJa = window.i18n.getLang() === 'ja';
    
    if (overlay && overlayText) {
      overlayText.textContent = isJa
        ? `「${title}」の音源をYouTubeから検索しています...`
        : `Searching YouTube for "${title}"...`;
      overlay.hidden = false;
    }

    try {
      // 1. バックエンドの検索プロキシを叩いて YouTube ID を取得
      const searchQ = `${artist} - ${title}`;
      const res = await fetch(`/api/youtube-search?q=${encodeURIComponent(searchQ)}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      
      if (!data.videoId) throw new Error('No video found');

      state.digArtwork = artwork || null;
      state.digVideoId = data.videoId || null;

      // 検索完了後に初めてスマホ用のオーバーレイを閉じる
      closeDig();

      // 2. 登録モーダルを開いてプリフィル
      openModal();
      
      // URLを入力
      const urlInput = $('#ytUrl');
      urlInput.value = `https://www.youtube.com/watch?v=${data.videoId}`;
      
      // input イベントを手動で発火させて重複チェックとサムネイル取得を走らせる
      onUrlInput();

      // 登録モーダル内の各フィールドに事前入力可能な情報をセット
      $('#ytName').value = '';
      $('#ytComment').value = '';
      
      // URL欄にフォーカスを合わせる
      urlInput.focus();

    } catch (err) {
      console.warn('Failed to prefill recommendation:', err);
      showToast(isJa ? 'YouTube音源の検索に失敗しました。' : 'Failed to find YouTube link.');
    } finally {
      item.classList.remove('is-loading');
      if (overlay) {
        overlay.hidden = true;
      }
    }
  };

  if ($('#recommendList')) $('#recommendList').addEventListener('click', handleRecommendClick);
  if ($('#digOverlayList')) {
    $('#digOverlayList').addEventListener('pointerover', (e) => setDigSelection(e.target.closest('.dig-record')));
    $('#digOverlayList').addEventListener('focusin', (e) => setDigSelection(e.target.closest('.dig-record')));
    $('#digOverlayList').addEventListener('click', (e) => setDigSelection(e.target.closest('.dig-record')));
    $('#digOverlayList').addEventListener('keydown', handleDigKeyboard);
  }
  if ($('#digOverlayDetail')) $('#digOverlayDetail').addEventListener('click', handleRecommendClick);

  // DIG SLAPS スマホ用透過オーバーレイ開閉
  const digOverlay = $('#digOverlay');
  if ($('#digOpen')) $('#digOpen').addEventListener('click', openDig);
  if ($('#digClose')) $('#digClose').addEventListener('click', closeDig);
  if (digOverlay) {
    digOverlay.addEventListener('click', (e) => { if (e.target === digOverlay) closeDig(); });
  }
  window.addEventListener('resize', () => {
    syncDigDetailPlacement();
    positionDigSticker();
  }, { passive: true });

  // Modal backdrops
  $('#submitModal').addEventListener('click', (e) => { if (e.target === $('#submitModal')) closeModal(); });
  $('#reportModal').addEventListener('click', (e) => { if (e.target === $('#reportModal')) closeReport(); });
  $('#favModal').addEventListener('click', (e) => { if (e.target === $('#favModal')) closeFavs(); });
  dailyOverlay.addEventListener('click', (e) => { if (e.target === dailyOverlay) closeDaily(); });

  // About overlay
  $('#infoLink').addEventListener('click', (e) => { e.preventDefault(); aboutOverlay.hidden = false; document.body.style.overflow = 'hidden'; });
  $('#aboutClose').addEventListener('click', () => { aboutOverlay.hidden = true; document.body.style.overflow = ''; });

  // Fav list interactions
  function handleFavAction(target, item) {
    const id = item.dataset.yt;
    if (target.closest('[data-fav-del]')) {
      favSave(favGet().filter((f) => f.youtube_id !== id));
      updateFavCount();
      openFavs();
      renderFavBtn();
    } else {
      playFavorites(id);
    }
  }
  $('#favList').addEventListener('click', (e) => {
    const item = e.target.closest('.fav-item');
    if (!item) return;
    handleFavAction(e.target, item);
  });
  $('#favList').addEventListener('keydown', (e) => {
    const item = e.target.closest('.fav-item');
    if (!item) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleFavAction(e.target, item);
    }
  });

  $('#favToast').addEventListener('click', (e) => { if (e.target === $('#favToast')) hideFavToast(); });
  $('#favToastDismiss').addEventListener('change', (e) => {
    if (e.target.checked) { try { localStorage.setItem(FAV_NOTICE_OFF, '1'); } catch { /* ignore */ } hideFavToast(); }
    else { try { localStorage.removeItem(FAV_NOTICE_OFF); } catch { /* ignore */ } }
  });

  // Idle setup
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'].forEach((ev) =>
    document.addEventListener(ev, wake, { passive: true })
  );

  // Sleep wake handler
  let lastVisibleAt = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { lastVisibleAt = Date.now(); return; }
    if (document.visibilityState !== 'visible') return;
    if (!state.started || !state.player) return;
    if (Date.now() - lastVisibleAt < 300000) return;
    try {
      state.player.pauseVideo();
    } catch (_) {}
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.target && typeof e.target.closest === 'function') {
      if (e.target.closest('input, textarea, select')) return;
    }
    if (e.key === 'Escape') {
      if (!dailyOverlay.hidden) { closeDaily(); return; }
      if (!$('#digOverlay').hidden) { closeDig(); return; }
      if (!aboutOverlay.hidden) { aboutOverlay.hidden = true; document.body.style.overflow = ''; return; }
      if (!$('#submitModal').hidden) { closeModal(); return; }
      if (!$('#reportModal').hidden) { closeReport(); return; }
      if (!$('#favModal').hidden) { closeFavs(); return; }
      return;
    }
    const modalOpen = !$('#submitModal').hidden || !$('#reportModal').hidden || !$('#favModal').hidden || !dailyOverlay.hidden || !aboutOverlay.hidden;
    if (modalOpen) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (e.shiftKey) {
        seekBy(10);
      } else {
        next();
      }
    }
    else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (e.shiftKey) {
        seekBy(-10);
      } else {
        prev();
      }
    }
    else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (!$('#unmute').hidden) { unmute(); return; }
      togglePlay();
    }
  });

  // Swipe navigation
  let touchStart = null;
  let touchStartTarget = null;
  document.addEventListener('touchstart', (e) => {
    if (!$('#submitModal').hidden || !$('#reportModal').hidden || !$('#favModal').hidden || !dailyOverlay.hidden || !aboutOverlay.hidden) return;
    touchStartTarget = e.target;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    if (touchStartTarget && touchStartTarget.closest('.regions, .eras, .balance, .order, input[type=range]')) {
      touchStart = null;
      touchStartTarget = null;
      return;
    }
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      dx < 0 ? next() : prev();
    }
    touchStart = null;
    touchStartTarget = null;
  }, { passive: true });



  // MPC Pad click listener
  const mpcPad = $('#mpcPad');
  if (mpcPad) {
    mpcPad.addEventListener('click', () => {
      // 1. 即座に発音と発光
      playVibeSE();
      triggerPadVisual();
      
      // 2. 現在の再生時間を取得してタップログをPOST
      if (state.player && state.ready) {
        const curTime = state.player.getCurrentTime() || 0;
        sendTapLog(curTime);
      }
    });
  }

  $('#promoBadge').addEventListener('click', onPromoBadgeClick);

  // Focus trap setup
  ['#submitModal', '#reportModal', '#favModal', '#aboutOverlay', '#digOverlay', '#dailyOverlay'].forEach((sel) => {
    const m = $(sel);
    if (m) trapFocus(m);
  });

  // Lang toggle
  $('#langBtn').addEventListener('click', () => {
    window.i18n.setLang(window.i18n.getLang() === 'en' ? 'ja' : 'en');
  });

  // Init favs and labels
  updateFavCount();

  // 字幕・文字起こし風の自動表示は廃止。過去設定もOFFへ戻す。
  state.commentMode = 0;
  localStorage.removeItem('slaps_comment_mode');
  


  // ダブルタップシークの有効化
  setupDoubleTapSeek();

  // スマホ版 DIG ボタンの波紋ガイド演出
  setupDigGuidePulse();
}

// ---- Vibe Session & プロモーション機能の追加ロジック ----

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

export async function fetchComments(youtubeId) {
  state.comments = [];
  state.triggeredComments.clear();
  
  renderCommentDots();
  if (state.commentMode === 0) return;
  
  try {
    const res = await fetch(`/api/comments?v=${youtubeId}`);
    if (res.ok) {
      const data = await res.json();
      state.comments = data.comments || [];
      renderCommentDots();
    }
  } catch (e) {
    console.warn('Failed to fetch vibe logs:', e);
  }
}

export function renderCommentDots() {
  const container = $('#progressDots');
  if (!container) return;
  container.innerHTML = '';
  if (!state.player || !state.ready || !state.comments.length) return;

  try {
    const dur = state.player.getDuration() || 1;
    state.comments.forEach((c) => {
      const dot = document.createElement('div');
      dot.className = 'progress__dot';
      dot.style.left = `${(c.time / dur) * 100}%`;
      dot.title = `VIBE: ${c.user_name || 'Anonymous'}`;
      container.appendChild(dot);
    });
  } catch (e) {
    console.warn('Failed to render vibe dots:', e);
  }
}

// 自動同期発光 ＆ 発音ロジック
export function checkComments(curTime) {
  if (!state.comments || !state.comments.length) return;
  if (state.commentMode !== 2) return; // VIBE が ON でない場合はスルー
  
  state.comments.forEach((c) => {
    // 再生時間がタップログのタイムスタンプに達した瞬間（0.25秒のウィンドウ内）にトリガー
    if (curTime >= c.time && curTime < c.time + 0.25) {
      if (!state.triggeredComments.has(c.id)) {
        state.triggeredComments.add(c.id);
        
        // Vibe音の再生とパッドの発光
        playVibeSE();
        triggerPadVisual();
      }
    }
  });
}

// パッドを視覚的に発光させる
export function triggerPadVisual() {
  const pad = $('#mpcPad');
  if (pad) {
    pad.classList.add('is-active');
    setTimeout(() => {
      pad.classList.remove('is-active');
    }, 100);
  }
}

// タップログをPOSTする
export async function sendTapLog(time) {
  const song = current();
  if (!song || !song.youtube_id) return;
  
  try {
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        youtube_id: song.youtube_id,
        time,
        text: '', // 空文字でタップログ扱い
        user_name: 'Anonymous'
      })
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'success') {
        // ローカル配列にも追加して、ドット等をリアルタイム更新
        state.comments.push(data.comment);
        state.comments.sort((a, b) => a.time - b.time);
        renderCommentDots();
      }
    }
  } catch (e) {
    console.warn('Failed to send vibe tap log:', e);
  }
}

let seekIndicatorTimeout = null;
export function showSeekIndicator(isForward) {
  const ind = $('#seekIndicator');
  if (!ind) return;
  
  ind.hidden = true;
  ind.classList.remove('is-left', 'is-right', 'is-active');
  ind.offsetHeight; // reflow
  
  const arrowEl = ind.querySelector('.seek-indicator__arrow');
  if (arrowEl) {
    arrowEl.textContent = isForward ? '▶▶' : '◀◀';
  }
  
  ind.classList.add(isForward ? 'is-right' : 'is-left');
  ind.hidden = false;
  ind.classList.add('is-active');
  
  clearTimeout(seekIndicatorTimeout);
  seekIndicatorTimeout = setTimeout(() => {
    ind.classList.remove('is-active');
    setTimeout(() => {
      if (!ind.classList.contains('is-active')) {
        ind.hidden = true;
      }
    }, 300);
  }, 600);
}

export function setupDoubleTapSeek() {
  const playerEl = $('#player');
  if (!playerEl) return;
  
  let lastTouchTime = 0;
  
  playerEl.addEventListener('touchstart', (e) => {
    if (!$('#submitModal').hidden || !$('#reportModal').hidden || !$('#favModal').hidden || !$('#aboutOverlay').hidden) return;
    if (e.target.closest('button, input, a, .dock, .regions, .eras, .balance, .top-right, .brand')) return;
    
    const now = Date.now();
    const touchX = e.touches[0].clientX;
    const screenWidth = window.innerWidth;
    const isForward = touchX > screenWidth / 2;
    
    if (now - lastTouchTime < 300) {
      seekBy(isForward ? 10 : -10);
      e.preventDefault();
      lastTouchTime = 0;
    } else {
      lastTouchTime = now;
    }
  }, { passive: false });
}

export function updatePromoBadge(song) {
  const badge = $('#promoBadge');
  if (!badge) return;
  badge.hidden = true; // プロモ一時無効化
}

export function onPromoBadgeClick() {
  const promos = state.all.filter((s) => s.promo === true && !state.broken.has(s.youtube_id));
  if (!promos.length) return;
  
  const cur = current();
  const available = promos.filter(p => p.youtube_id !== cur?.youtube_id);
  const target = available.length ? available[Math.floor(Math.random() * available.length)] : promos[0];
  
  state.queue.splice(state.index + 1, 0, target);
  next();
}

let airhornBuffer = null;
let isAirhornLoading = false;

async function loadAirhornBuffer(ctx) {
  if (airhornBuffer || isAirhornLoading) return;
  isAirhornLoading = true;
  try {
    const res = await fetch('./assets/se_1.mp3');
    if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
    const arrayBuffer = await res.arrayBuffer();
    ctx.decodeAudioData(
      arrayBuffer,
      (decoded) => {
        airhornBuffer = decoded;
        window.airhornBuffer = decoded; // デバッグ用にグローバル露出
        isAirhornLoading = false;
      },
      (err) => {
        console.error('Failed to decode airhorn MP3:', err);
        isAirhornLoading = false;
      }
    );
  } catch (err) {
    console.error('Failed to load airhorn buffer:', err);
    isAirhornLoading = false;
  }
}

let audioCtx = null;
export function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  loadAirhornBuffer(audioCtx);
  return audioCtx;
}

function playAirhornSound(ctx) {
  if (airhornBuffer) {
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = airhornBuffer;
    
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.08, now); // 音量を0.08に引き下げてBGMと調和
    
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    source.start(now);
  } else {
    // フォールバック再生（シンセサイズ音）は廃止し、プリロードのみリトライ
    loadAirhornBuffer(ctx);
  }
}

function playAirhornSynthesized(ctx) {
  const now = ctx.currentTime;
  
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const osc3 = ctx.createOscillator();
  
  const filter = ctx.createBiquadFilter();
  const gainNode = ctx.createGain();
  
  osc1.type = 'sawtooth';
  osc2.type = 'sawtooth';
  osc3.type = 'sawtooth';
  
  // レゲエ・エアホーンサウンドを特徴づけるピッチの重ね合わせ
  const baseFreq1 = 587.33; // D5
  const baseFreq2 = 783.99; // G5
  
  osc1.frequency.setValueAtTime(baseFreq1, now);
  osc2.frequency.setValueAtTime(baseFreq2, now);
  osc3.frequency.setValueAtTime(baseFreq1 * 1.5, now); // A5 (5度上)
  
  // デチューンを効かせて音に広がりと厚みを出す
  osc1.detune.setValueAtTime(-12, now);
  osc2.detune.setValueAtTime(0, now);
  osc3.detune.setValueAtTime(12, now);
  
  // アタックの「プ！」音：0.15秒でピッチを 0.8倍に降下させてホーン特有のピッチベンドを再現
  osc1.frequency.exponentialRampToValueAtTime(baseFreq1 * 0.8, now + 0.15);
  osc2.frequency.exponentialRampToValueAtTime(baseFreq2 * 0.8, now + 0.15);
  osc3.frequency.exponentialRampToValueAtTime((baseFreq1 * 1.5) * 0.8, now + 0.15);
  
  // メガホン／拡声器らしさを出すフィルタリング（1.2kHz付近をブーストして金属的に）
  filter.type = 'peaking';
  filter.frequency.setValueAtTime(1200, now);
  filter.Q.setValueAtTime(2.0, now);
  filter.gain.setValueAtTime(12, now);
  
  // 音量エンベロープ（超急激な立ち上がり ＆ なだらかなディケイ）
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.15, now + 0.015);
  gainNode.gain.setValueAtTime(0.15, now + 0.12);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
  
  osc1.connect(filter);
  osc2.connect(filter);
  osc3.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  osc1.start(now);
  osc2.start(now);
  osc3.start(now);
  
  osc1.stop(now + 0.6);
  osc2.stop(now + 0.6);
  osc3.stop(now + 0.6);
}

function playScratchSound(ctx) {
  const now = ctx.currentTime;
  
  // ホワイトノイズ生成
  const bufferSize = ctx.sampleRate * 0.3;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = buffer;
  
  // 低域〜中域のうねり（レコード盤のピッチ模倣）用の三角波オシレーター
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  
  const noiseFilter = ctx.createBiquadFilter();
  const oscFilter = ctx.createBiquadFilter();
  const mainGain = ctx.createGain();
  
  // 摩擦音（シュッ）を引き立たせるバンドパスフィルター
  noiseFilter.type = 'bandpass';
  noiseFilter.Q.setValueAtTime(4.0, now);
  
  // 三角波をマイルドにするためのローパスフィルター
  oscFilter.type = 'lowpass';
  oscFilter.frequency.setValueAtTime(800, now);
  
  // キュッ・キュッという擦りの往復運動（ダブルスクラッチ）
  // 往路の擦り
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(1000, now + 0.07);
  osc.frequency.exponentialRampToValueAtTime(250, now + 0.13);
  
  noiseFilter.frequency.setValueAtTime(500, now);
  noiseFilter.frequency.exponentialRampToValueAtTime(3200, now + 0.07);
  noiseFilter.frequency.exponentialRampToValueAtTime(800, now + 0.13);
  
  // 復路の擦り
  osc.frequency.setValueAtTime(250, now + 0.13);
  osc.frequency.exponentialRampToValueAtTime(1200, now + 0.19);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.27);
  
  noiseFilter.frequency.setValueAtTime(800, now + 0.13);
  noiseFilter.frequency.exponentialRampToValueAtTime(3600, now + 0.19);
  noiseFilter.frequency.exponentialRampToValueAtTime(300, now + 0.27);
  
  // ゲインエンベロープ（往復に合わせた山2つ）
  mainGain.gain.setValueAtTime(0, now);
  mainGain.gain.linearRampToValueAtTime(0.25, now + 0.04);
  mainGain.gain.linearRampToValueAtTime(0.08, now + 0.13);
  mainGain.gain.linearRampToValueAtTime(0.28, now + 0.18);
  mainGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
  
  noiseSource.connect(noiseFilter);
  noiseFilter.connect(mainGain);
  
  osc.connect(oscFilter);
  oscFilter.connect(mainGain);
  
  mainGain.connect(ctx.destination);
  
  noiseSource.start(now);
  osc.start(now);
  
  noiseSource.stop(now + 0.3);
  osc.stop(now + 0.3);
}

function playVibeSE() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    // すべてエアホーン音源（se_1.mp3）に統一して再生
    playAirhornSound(ctx);
  } catch (err) {
    console.error('Audio synthesis failed:', err);
  }
}

async function sendLike(commentId) {
  const song = current();
  if (!song || !song.youtube_id) return;
  
  try {
    const res = await fetch('/api/comments/like', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        youtube_id: song.youtube_id,
        comment_id: commentId
      })
    });
    if (!res.ok) {
      console.warn('Failed to persist like on server');
    }
  } catch (err) {
    console.error('Failed to send like API request:', err);
  }
}

export function renderRecommendations() {
  const container = $('#metaRecommendations');
  const list = $('#recommendList');
  const overlayList = $('#digOverlayList');
  const overlayTitle = $('#digOverlayTitle');
  if (!container || !list) return;

  const titleEl = $('#recommendTitle');
  const isJa = window.i18n.getLang() === 'ja';
  
  if (titleEl) {
    titleEl.textContent = isJa
      ? '🔍 DIG SLAPS (関連曲・未登録曲)'
      : '🔍 DIG SLAPS (Related & unregistered tracks)';
  }
  if (overlayTitle) {
    overlayTitle.textContent = 'DIG SLAPS';
  }
  const overlayLead = $('#digOverlayLead');
  if (overlayLead) overlayLead.textContent = isJa
    ? 'ジャケットを掘って、気になる1枚を選ぶ。'
    : 'Dig through the sleeves. Pick what hits.';

  const recs = state.recommendations || [];
  const digOpenBtn = $('#digOpen');
  const digCount = $('#digCount');
  if (recs.length === 0) {
    container.hidden = true;
    if ($('#digOverlayDetail')) $('#digOverlayDetail').hidden = true;
    if (overlayList) overlayList.innerHTML = '';
    if (digOpenBtn) {
      digOpenBtn.hidden = true;
      digOpenBtn.setAttribute('aria-expanded', 'false');
    }
    if (digCount) digCount.textContent = '';
    if (!$('#digOverlay').hidden) closeDig();
    return;
  }

  if (digOpenBtn) digOpenBtn.hidden = false;
  if (digCount) digCount.textContent = `${recs.length} CUTS`;
  requestAnimationFrame(positionDigSticker);

  // イベント委譲を維持するための非表示リスト
  list.innerHTML = recs.map(r => {
    const isRegistered = !!r.registered;
    const actionText = isRegistered 
      ? (isJa ? '▶ 再生' : '▶ PLAY') 
      : (isJa ? '＋ 登録' : '＋ ADD');
    const actionClass = isRegistered ? 'recommend-item__action-btn--play' : '';
    
    return `
      <div class="recommend-item" data-artist="${escapeHtml(r.artist)}" data-title="${escapeHtml(r.title)}" data-artwork="${escapeHtml(r.artwork || '')}" data-youtube-id="${r.youtube_id || ''}" data-registered="${isRegistered}" role="button" tabindex="0">
        <img class="recommend-item__artwork" src="${escapeHtml(r.artwork || './assets/logo.png')}" alt="" loading="lazy">
        <div class="recommend-item__info">
          <span class="recommend-item__name">${escapeHtml(r.title)}</span>
          <span class="recommend-item__artist">${escapeHtml(r.artist)}</span>
        </div>
        <span class="recommend-item__action-btn ${actionClass}">${actionText}</span>
      </div>
    `;
  }).join('');

  // 全画面DIGオーバーレイリスト描画
  if (overlayList) {
    overlayList.innerHTML = recs.map((r, index) => {
      const isRegistered = !!r.registered;
      return `
        <button type="button" class="dig-record${index === 0 ? ' is-active' : ''}" style="--dig-i:${index}" data-index="${index}" data-artist="${escapeHtml(r.artist)}" data-title="${escapeHtml(r.title)}" data-artwork="${escapeHtml(r.artwork || '')}" data-youtube-id="${r.youtube_id || ''}" data-registered="${isRegistered}" role="option" aria-selected="${index === 0}" aria-label="${escapeHtml(`${r.title} — ${r.artist}`)}" tabindex="${index === 0 ? '0' : '-1'}">
          <img class="dig-record__artwork" src="${escapeHtml(r.artwork || './assets/logo.png')}" alt="" loading="lazy">
          <span class="dig-record__shade" aria-hidden="true"></span>
          <span class="dig-record__title" aria-hidden="true">${escapeHtml(r.title)}</span>
          <span class="dig-record__number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
        </button>
      `;
    }).join('');
    setDigSelection(overlayList.querySelector('.dig-record'));
  }

  // 候補の有無で中央のdock高を変えない。
  container.hidden = true;
}

// Expose functions globally for i18n.js integration
window.openModal = openModal;
window.renderFavBtn = renderFavBtn;
window.updateTrackCount = updateTrackCount;
window.current = current;
window.playVibeSE = playVibeSE;
window.state = state;
window.renderRecommendations = renderRecommendations;

function setupDigGuidePulse() {
  const digBtn = $('#digOpen');
  if (!digBtn) return;

  let savedCountVal = 0;
  try {
    const savedCount = localStorage.getItem('slaps_visit_count');
    savedCountVal = savedCount ? parseInt(savedCount, 10) : 0;
    localStorage.setItem('slaps_visit_count', (savedCountVal + 1).toString());
  } catch (e) {
    console.warn('Failed to access localStorage for visit count:', e);
    return;
  }

  let digClicked = false;
  try {
    digClicked = !!localStorage.getItem('slaps_dig_clicked');
  } catch (e) {
    /* ignore */
  }

  // リリース後（本バージョン適用後）、2回目以上の訪問（前回の訪問カウントが1以上）かつ未クリックの場合
  if (savedCountVal >= 1 && !digClicked) {
    setTimeout(() => {
      digBtn.classList.add('guide-pulse');
      
      const clearPulse = () => {
        digBtn.classList.remove('guide-pulse');
        try {
          localStorage.setItem('slaps_dig_clicked', '1');
        } catch (e) { /* ignore */ }
        digBtn.removeEventListener('click', clearPulse);
      };
      digBtn.addEventListener('click', clearPulse);
    }, 3000);
  }
}
