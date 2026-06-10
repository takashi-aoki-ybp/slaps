import { state, REGION_LABELS, CT, current, getFilteredPool, playableCount, eligibleByBalance, applyOrder } from './state.js';
import { db } from './db.js';
import { togglePlay, next, prev, loadCurrent, unmute, createYTPlayer, seekBy, setVolume } from './player.js';

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
  updateFavCount();
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
  updateFavCount();
  setBalance(state.balance, { keep: true });
  updateTrackCount();
  showFilterFeedback();
}

export async function setOrder(order) {
  if (order === state.order && order !== 'newest' && order !== 'vibes' && order !== 'shuffle') return;
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
    // If LATEST (newest), VIBES (vibes), or SHUFFLE is clicked, we want to play the new song (index 0) immediately.
    const shouldCutPlay = (order === 'newest' || order === 'vibes' || order === 'shuffle');
    setBalance(state.balance, { keep: !shouldCutPlay });
  }

  // 2. Fetch latest database songs in the background if LATEST or VIBES is selected
  if (order === 'newest' || order === 'vibes') {
    const btn = document.querySelector(`[data-order="${order}"]`);
    const originalHTML = btn ? btn.innerHTML : '';
    const labelText = order === 'newest' ? 'LATEST' : 'VIBES';
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
          updateTrackCount();
          if (!state.favMode) {
            // Once background fetch completes, always keep current song to prevent sudden audio resets
            setBalance(state.balance, { keep: true });
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
    const saved = await db.submit(song);
    const entry = saved || song;
    if (!entry.created_at && !entry.publish_at) entry.created_at = new Date().toISOString();
    if (!state.all.some((s) => s.youtube_id === entry.youtube_id)) state.all.unshift(entry);
    updateTrackCount();
    lastSubmitTime = Date.now();
    closeModal();
    showToast(db.live ? window.i18n.t('toastAdded') : window.i18n.t('toastAddedLocal'));
    
    // 即時割り込み再生：現在のキューの直後に挿入し、1.5秒後に自動で次曲へ遷移
    state.queue.splice(state.index + 1, 0, entry);
    setTimeout(() => {
      next();
    }, 1500);
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

export function openDig() { $('#digOverlay').hidden = false; document.body.style.overflow = 'hidden'; }
export function closeDig() { $('#digOverlay').hidden = true; document.body.style.overflow = ''; }

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
export function updateFavCount() {
  const count = favGet().length;
  const labelKey = state.favMode ? 'favOpenActive' : 'favOpen';
  const label = window.i18n.t(labelKey);
  const icon = state.favMode ? '◀' : '♡';
  $('#favOpen').innerHTML = `${icon} ${label} (<span id="favCount">${count}</span>)`;
}
window.updateFavCount = updateFavCount;

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
      <button type="button" class="fav-item__btn fav-item__del" data-fav-del aria-label="Remove" tabindex="0">×</button>
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
  updateFavCount();
  if (state.ready) loadCurrent();
  closeFavs();
}

export async function doShare() {
  const song = current();
  if (!song) return;
  const shareUrl = `${window.location.origin}/?v=${song.youtube_id}`;

  // OGP 画像の事前生成をバックグラウンドでトリガー（プリウォーム）
  fetch(`/api/og-image?v=${song.youtube_id}`).catch(() => {});

  const shareText = `Play on SLAPS | ${song.name}`;
  const fullCopyText = `${shareText}\n${shareUrl}`;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile && navigator.share) {
    try {
      await navigator.share({
        text: fullCopyText
      });
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
    updateFavCount();
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
    if (state.favMode) {
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

    const artist = item.dataset.artist;
    const title = item.dataset.title;

    item.classList.add('is-loading');
    try {
      // 1. バックエンドの検索プロキシを叩いて YouTube ID を取得
      const searchQ = `${artist} - ${title}`;
      const res = await fetch(`/api/youtube-search?q=${encodeURIComponent(searchQ)}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      
      if (!data.videoId) throw new Error('No video found');

      // スマホ用のオーバーレイを閉じる
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
      showToast(window.i18n.t('toastAddFail') || 'Failed to fetch YouTube link.');
    } finally {
      item.classList.remove('is-loading');
    }
  };

  if ($('#recommendList')) $('#recommendList').addEventListener('click', handleRecommendClick);
  if ($('#digOverlayList')) $('#digOverlayList').addEventListener('click', handleRecommendClick);

  // DIG SLAPS スマホ用透過オーバーレイ開閉
  const digOverlay = $('#digOverlay');
  if ($('#digOpen')) $('#digOpen').addEventListener('click', openDig);
  if ($('#digClose')) $('#digClose').addEventListener('click', closeDig);
  if (digOverlay) {
    digOverlay.addEventListener('click', (e) => { if (e.target === digOverlay) closeDig(); });
  }

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
    if (e.target && typeof e.target.closest === 'function') {
      if (e.target.closest('input, textarea, select')) return;
    }
    if (e.key === 'Escape') {
      if (!aboutOverlay.hidden) { aboutOverlay.hidden = true; document.body.style.overflow = ''; return; }
      if (!$('#submitModal').hidden) { closeModal(); return; }
      if (!$('#reportModal').hidden) { closeReport(); return; }
      if (!$('#favModal').hidden) { closeFavs(); return; }
      return;
    }
    const modalOpen = !$('#submitModal').hidden || !$('#reportModal').hidden || !$('#favModal').hidden || !aboutOverlay.hidden;
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

  // Vibe Toggle (Vibe同期 ON/OFF)
  const vibeToggle = $('#vibeToggle');
  if (vibeToggle) {
    vibeToggle.addEventListener('click', () => {
      const isCurrentlyOn = state.commentMode === 2;
      const nextMode = isCurrentlyOn ? 0 : 2;
      state.commentMode = nextMode;
      localStorage.setItem('slaps_comment_mode', nextMode.toString());
      
      vibeToggle.textContent = nextMode === 2 ? '📢 VIBE: ON' : '📢 VIBE: OFF';
      vibeToggle.classList.toggle('is-active', nextMode === 2);
      showToast(nextMode === 2 ? 'VIBE SESSION: ON' : 'VIBE SESSION: OFF');
    });
  }

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

  // Vibeモードの復元と初期設定
  let savedMode = localStorage.getItem('slaps_comment_mode');
  if (savedMode === null) {
    savedMode = '0'; // デフォルトは OFF (0)
  }
  let parsedMode = parseInt(savedMode, 10);
  if (parsedMode === 1) parsedMode = 2; // 古い「字幕のみ」は「ON」に丸める
  state.commentMode = parsedMode === 2 ? 2 : 0;
  
  if (vibeToggle) {
    vibeToggle.textContent = state.commentMode === 2 ? '📢 VIBE: ON' : '📢 VIBE: OFF';
    vibeToggle.classList.toggle('is-active', state.commentMode === 2);
  }

  // ダブルタップシークの有効化
  setupDoubleTapSeek();
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
      if (data.status === 'success' || data.status === 'mock_success') {
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

  const recs = state.recommendations || [];
  if (recs.length === 0) {
    container.hidden = true;
    list.innerHTML = '';
    if (overlayList) overlayList.innerHTML = '';
    return;
  }

  const titleEl = $('#recommendTitle');
  const isJa = window.i18n.getLang() === 'ja';
  
  if (titleEl) {
    titleEl.textContent = isJa
      ? '🔍 DIG SLAPS (未登録曲の推薦)'
      : '🔍 DIG SLAPS (Unregistered recommendations)';
  }
  if (overlayTitle) {
    overlayTitle.textContent = isJa
      ? '💡 このアーティストの未登録曲 (DIG)'
      : '💡 Unregistered tracks by this artist (DIG)';
  }

  // PC版リスト描画 (ホバー対応)
  list.innerHTML = recs.map(r => `
    <div class="recommend-item" data-artist="${escapeHtml(r.artist)}" data-title="${escapeHtml(r.title)}" role="button" tabindex="0">
      <img class="recommend-item__artwork" src="${escapeHtml(r.artwork || './assets/logo.png')}" alt="" loading="lazy">
      <div class="recommend-item__info">
        <span class="recommend-item__plus">＋</span>
        <span class="recommend-item__name">${escapeHtml(r.title)}</span>
      </div>
    </div>
  `).join('');

  // スマホ版オーバーレイリスト描画
  if (overlayList) {
    overlayList.innerHTML = recs.map(r => `
      <div class="recommend-item dig-overlay-item" data-artist="${escapeHtml(r.artist)}" data-title="${escapeHtml(r.title)}" role="button" tabindex="0">
        <img class="dig-overlay-item__artwork" src="${escapeHtml(r.artwork || './assets/logo.png')}" alt="" loading="lazy">
        <div class="dig-overlay-item__info">
          <span class="dig-overlay-item__name">${escapeHtml(r.title)}</span>
          <span class="dig-overlay-item__artist">${escapeHtml(r.artist)}</span>
        </div>
        <button type="button" class="dig-overlay-item__add-btn">＋ ADD</button>
      </div>
    `).join('');
  }

  container.hidden = false;
}

// Expose functions globally for i18n.js integration
window.renderFavBtn = renderFavBtn;
window.updateTrackCount = updateTrackCount;
window.current = current;
window.playVibeSE = playVibeSE;
window.state = state;
window.renderRecommendations = renderRecommendations;
