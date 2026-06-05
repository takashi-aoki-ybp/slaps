import { state, REGION_LABELS, CT, current, getFilteredPool, playableCount, eligibleByBalance, applyOrder } from './state.js';
import { db } from './db.js';
import { togglePlay, next, prev, loadCurrent, unmute, createYTPlayer } from './player.js';

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
    if ($('#submitModal').hidden && $('#reportModal').hidden && $('#favModal').hidden && aboutOverlay.hidden && !state.paused) {
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
  el.classList.toggle('is-filtered', state.region !== 'all' || state.era !== 'all');
}

// ---- Vibeネオンカラー更新 ----
export function updateVibeColor(p, element = balanceRange) {
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
  $('#balanceZone').textContent = zoneLabel(p);
}

// ---- バランス（Conscious/Turnt）設定 ----
export function setBalance(p, opts = {}) {
  state.balance = p;
  const cur = current();
  state.queue = eligibleByBalance(p);
  applyOrder(state.queue);
  updateVibeColor(p);
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
  state.region = region;
  document.querySelectorAll('.region__btn').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.region === region));
  state.favMode = false;
  $('#favOpen').classList.remove('is-active');
  setBalance(state.balance, { keep: true });
  updateTrackCount();
  showFilterFeedback();
}

export function setEra(era) {
  state.era = era;
  document.querySelectorAll('.era__btn').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.era === era));
  state.favMode = false;
  $('#favOpen').classList.remove('is-active');
  setBalance(state.balance, { keep: true });
  updateTrackCount();
  showFilterFeedback();
}

export async function setOrder(order) {
  if (order === state.order && order !== 'newest') return;
  state.order = order;
  document.querySelectorAll('.order__btn').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.order === order));

  // 1. Immediately apply order to the queue based on current memory
  if (state.favMode) {
    const cur = current();
    applyOrder(state.queue);
    if (state.order === 'shuffle') state.index = 0;
    else state.index = (cur && state.queue[0] && state.queue[0].youtube_id === cur.youtube_id && state.queue.length > 1) ? 1 : 0;
    if (state.ready) loadCurrent();
  } else {
    // If LATEST (newest) is clicked, we want to play the newest song (index 0) immediately.
    // Otherwise (e.g. SHUFFLE), we keep the current playing song seamless.
    const isNewestClick = (order === 'newest');
    setBalance(state.balance, { keep: !isNewestClick });
  }

  // 2. Fetch latest database songs in the background if LATEST is selected
  if (order === 'newest') {
    const btn = document.querySelector('[data-order="newest"]');
    const originalHTML = btn ? btn.innerHTML : '';
    // Avoid backing up the loading "..." HTML on rapid double-clicks
    const fixedOriginalHTML = (originalHTML && originalHTML.includes('...')) ? 'LATEST' : originalHTML;
    if (btn) btn.innerHTML = '<span style="opacity: 0.5;">...</span>';
    try {
      const res = await fetch(`/api/songs?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        // Check if the user hasn't switched away from LATEST while waiting
        if (Array.isArray(data) && state.order === 'newest') {
          state.all = data;
          updateTrackCount();
          if (!state.favMode) {
            // Once background fetch completes, always keep current song to prevent sudden audio resets
            setBalance(state.balance, { keep: true });
          }
        }
      }
    } catch (e) {
      console.warn('Failed to refresh songs on LATEST click:', e);
    } finally {
      if (btn) btn.innerHTML = fixedOriginalHTML;
    }
  }
}

// ---- 曲情報メタ描画 ----
export function renderMeta(song) {
  const meta = $('#meta');
  renderFavBtn();
  meta.classList.remove('is-show');
  setTimeout(() => {
    $('#metaTitle').textContent = song.name;
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
    $('#previewThumb').src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
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
    thumbnail: `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
    region: $('#ytRegion').value || null,
    era: $('#ytEra').value || null,
    conscious_turnt: ytCtTouched ? Number($('#ytConsTurnt').value) : null,
    status: 'published',
  };
  const btn = $('#submitDo');
  btn.disabled = true;
  try {
    const saved = await db.submit(song);
    const entry = saved || song;
    if (!entry.created_at && !entry.publish_at) entry.created_at = new Date().toISOString();
    if (!state.all.some((s) => s.youtube_id === entry.youtube_id)) state.all.unshift(entry);
    updateTrackCount();
    lastSubmitTime = Date.now();
    closeModal();
    showToast(db.live ? window.i18n.t('toastAdded') : window.i18n.t('toastAddedLocal'));
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
    btn.disabled = false;
  }
}

export function openModal() { $('#submitModal').hidden = false; }
export function closeModal() {
  $('#submitModal').hidden = true;
  $('#ytUrl').value = ''; $('#ytComment').value = ''; $('#ytName').value = '';
  $('#ytRegion').value = ''; $('#ytEra').value = '';
  $('#preview').hidden = true; $('#submitDo').disabled = true;
  ytCtTouched = false; $('#ytConsTurnt').value = '2.5'; $('#ytConsTurntVal').textContent = window.i18n.t('vibeNotSet');
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
  if (favs.some((f) => f.youtube_id === song.youtube_id)) {
    favs = favs.filter((f) => f.youtube_id !== song.youtube_id);
  } else {
    favs.unshift({
      youtube_id: song.youtube_id, name: song.name, description: song.description || '',
      user_name: song.user_name || '', thumbnail: song.thumbnail || `https://img.youtube.com/vi/${song.youtube_id}/mqdefault.jpg`,
      region: song.region || null, era: song.era || null, conscious_turnt: CT(song),
    });
    showFavToast();
  }
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
export function updateFavCount() { $('#favCount').textContent = favGet().length; }

function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export function openFavs() {
  const favs = favGet();
  const list = $('#favList');
  $('#favEmpty').hidden = favs.length > 0;
  $('#favPlayAll').hidden = favs.length === 0;
  list.innerHTML = favs.map((f) => `
    <div class="fav-item" data-yt="${escapeHtml(f.youtube_id)}" role="button" tabindex="0">
      <img class="fav-item__thumb" loading="lazy" src="${escapeHtml(f.thumbnail)}" alt="">
      <div class="fav-item__body">
        <span class="fav-item__title">${escapeHtml(f.name)}</span>
        <span class="fav-item__sub">${escapeHtml(f.user_name || window.i18n.t('anon'))} · ${REGION_LABELS[f.region] || ''} · ${zoneLabel(Number(f.conscious_turnt))}</span>
      </div>
      <button type="button" class="fav-item__btn" data-fav-play aria-label="Play" tabindex="-1">▶</button>
      <button type="button" class="fav-item__btn fav-item__del" data-fav-del aria-label="Remove" tabindex="-1">×</button>
    </div>`).join('');
  $('#favModal').hidden = false;
}
export function closeFavs() { $('#favModal').hidden = true; }

export function playFavorites(fromId) {
  const favs = favGet();
  if (!favs.length) return;
  state.favMode = true;
  state.queue = favs.map((f) => ({ ...f }));
  if (fromId) {
    state.index = Math.max(0, state.queue.findIndex((s) => s.youtube_id === fromId));
  } else {
    applyOrder(state.queue);
    state.index = 0;
  }
  $('#favOpen').classList.add('is-active');
  if (state.ready) loadCurrent();
  closeFavs();
}

export async function doShare() {
  const song = current();
  if (!song) return;
  const shareUrl = `${window.location.origin}/?v=${song.youtube_id}`;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile && navigator.share) {
    try {
      let desc = '';
      if (song.description) {
        if (typeof song.description === 'string') {
          desc = song.description;
        } else {
          desc = song.description[window.i18n.getLang()] || song.description.en || song.description.ja || '';
        }
      }
      await navigator.share({
        title: song.name,
        text: desc,
        url: shareUrl
      });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(shareUrl);
    showToast(window.i18n.t('shareCopied'));
  } catch (_) {
    const input = document.createElement('input');
    input.value = shareUrl;
    input.style.position = 'absolute';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand('copy');
      showToast(window.i18n.t('shareCopied'));
    } catch (__ون) {}
    document.body.removeChild(input);
  }
}

export function trapFocus(modal) {
  const focusable = modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  modal.addEventListener('keydown', (e) => {
    if (modal.hidden || e.key !== 'Tab') return;
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

  // Form Vibe slider
  const ytCt = $('#ytConsTurnt');
  ytCt.addEventListener('input', () => {
    ytCtTouched = true;
    const v = Number(ytCt.value);
    $('#ytConsTurntVal').textContent = `${v.toFixed(1)} ${zoneLabel(v)}`;
    updateVibeColor(v, ytCt);
  });

  // Vibe slider
  balanceRange.addEventListener('input', () => {
    const v = Number(balanceRange.value);
    updateBalanceLabel(v);
    updateVibeColor(v);
  });
  balanceRange.addEventListener('change', () => {
    state.favMode = false;
    $('#favOpen').classList.remove('is-active');
    setBalance(Number(balanceRange.value));
  });
  ['touchstart', 'touchend'].forEach((ev) =>
    balanceRange.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));

  // Playback order
  $('#order').addEventListener('click', (e) => {
    const btn = e.target.closest('.order__btn');
    if (btn) setOrder(btn.dataset.order);
  });

  // Regions
  function updateRegionsMask() {
    const el = $('#regions');
    if (!el) return;
    const isScrollable = el.scrollWidth > el.clientWidth;
    const isEnd = !isScrollable || (el.scrollLeft + el.clientWidth >= el.scrollWidth - 10);
    el.classList.toggle('is-end', isEnd);
  }
  $('#regions').addEventListener('click', (e) => {
    const btn = e.target.closest('.region__btn');
    if (btn) setRegion(btn.dataset.region);
  });
  $('#regions').addEventListener('scroll', updateRegionsMask, { passive: true });
  window.addEventListener('resize', updateRegionsMask, { passive: true });
  window.addEventListener('load', updateRegionsMask);
  updateRegionsMask();

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
  $('#favOpen').addEventListener('click', openFavs);
  $('#favClose').addEventListener('click', closeFavs);
  $('#favPlayAll').addEventListener('click', () => playFavorites());

  // Modal backdrops
  $('#submitModal').addEventListener('click', (e) => { if (e.target === $('#submitModal')) closeModal(); });
  $('#reportModal').addEventListener('click', (e) => { if (e.target === $('#reportModal')) closeReport(); });
  $('#favModal').addEventListener('click', (e) => { if (e.target === $('#favModal')) closeFavs(); });

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
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'Escape') {
      if (!aboutOverlay.hidden) { aboutOverlay.hidden = true; document.body.style.overflow = ''; return; }
      if (!$('#submitModal').hidden) { closeModal(); return; }
      if (!$('#reportModal').hidden) { closeReport(); return; }
      if (!$('#favModal').hidden) { closeFavs(); return; }
      return;
    }
    const modalOpen = !$('#submitModal').hidden || !$('#reportModal').hidden || !$('#favModal').hidden || !aboutOverlay.hidden;
    if (modalOpen) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
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
    if (!$('#submitModal').hidden || !$('#reportModal').hidden || !$('#favModal').hidden || !aboutOverlay.hidden) return;
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

  // Focus trap setup
  ['#submitModal', '#reportModal', '#favModal', '#aboutOverlay'].forEach((sel) => {
    const m = $(sel);
    if (m) trapFocus(m);
  });

  // Lang toggle
  $('#langBtn').addEventListener('click', () => {
    window.i18n.setLang(window.i18n.getLang() === 'en' ? 'ja' : 'en');
  });

  // Init favs and labels
  updateFavCount();
}

// Expose functions globally for i18n.js integration
window.renderFavBtn = renderFavBtn;
window.updateTrackCount = updateTrackCount;
window.current = current;
