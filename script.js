// ===== SLAPS — HIPHOP Jukebox =====
// アクセス＝即再生（ミュート自動再生→タップで音）。
// YouTube IFrame API でプレイリスト再生。

const $ = (sel) => document.querySelector(sel);

const REGION_LABELS = {
  us: '🇺🇸 US', jp: '🇯🇵 JP', uk: '🇬🇧 UK', fr: '🇫🇷 FR', kr: '🇰🇷 KR', other: '🌍', all: '🌐 ALL',
};

const state = {
  all: [],
  balance: 2.5,       // CONSCIOUS(0) ↔ TURNT(5)
  region: 'all',       // 地域フィルター
  era: 'all',          // 年代フィルター
  order: 'shuffle',
  favMode: false,
  queue: [],
  index: 0,
  player: null,
  ready: false,
  started: false,
  muted: true,
  paused: false,
  pinned: false,       // UI固定
  fill: true,         // 映像拡大（4:3対応）— デフォルトON
  broken: new Set(),
  played: new Set(),   // デッキシャッフル: 再生済みID
};

// ===== データ層 =====
const db = (() => {
  const cfg = window.SLAPS_CONFIG || {};
  const live = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const sb = live ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  if (live) console.log('[DB] Supabase connected.');
  else console.log('[DB] Mock mode (local JSON + localStorage). Set keys in config.js for live DB.');

  const lsGet = (k) => JSON.parse(localStorage.getItem(k) || '[]');
  const lsPush = (k, v) => { const a = lsGet(k); a.unshift(v); localStorage.setItem(k, JSON.stringify(a)); };

  return {
    live,
    async loadSongs() {
      if (live) {
        const query = sb
          .from('songs')
          .select('youtube_id,name,description,user_name,region,era,thumbnail,conscious_turnt,created_at,publish_at')
          .eq('status', 'published')
          .eq('unplayable', false)
          .limit(5000);
        const timeout = new Promise((res) => setTimeout(() => res({ data: null, error: { message: 'timeout' } }), 6000));
        const { data, error } = await Promise.race([query, timeout]);
        if (error) console.error('[DB] loadSongs failed, falling back to JSON:', error.message);
        else return data;
      }
      const songs = await fetch('./data/songs.json').then((r) => r.json());
      const mine = lsGet('slaps_submissions');
      const brokenIds = new Set(lsGet('slaps_broken').map((b) => b.youtube_id));
      return [...mine, ...songs].filter((s) => !brokenIds.has(s.youtube_id));
    },

    async submit(song) {
      if (live) {
        const { data, error } = await sb.rpc('submit_song', {
          p_youtube_id: song.youtube_id,
          p_name: song.name,
          p_region: song.region,
          p_era: song.era,
          p_user_name: song.user_name,
          p_description: song.description,
          p_thumbnail: song.thumbnail,
          p_conscious_turnt: song.conscious_turnt,
        });
        if (error) throw error;
        return data;
      }
      lsPush('slaps_submissions', song);
      return song;
    },

    async report(r) {
      if (live) {
        const { error } = await sb.rpc('report_song', {
          p_youtube_id: r.youtube_id,
          p_song_name: r.name,
          p_reason: r.reason,
          p_note: r.note,
        });
        if (error) throw error;
        return;
      }
      lsPush('slaps_reports', r);
    },

    async markBroken(id, code) {
      if (live) {
        const { error } = await sb.rpc('mark_broken', { p_youtube_id: id, p_code: code });
        if (error) console.error('[DB] mark_broken failed:', error.message);
        return;
      }
      const arr = lsGet('slaps_broken');
      arr.push({ youtube_id: id, code, at: new Date().toISOString() });
      localStorage.setItem('slaps_broken', JSON.stringify(arr));
    },
  };
})();

// ---- データ読み込み ----
async function loadData() {
  state.all = await db.loadSongs();
  updateTrackCount();
  tryStart();
}

function playableCount() {
  return getFilteredPool().length;
}

function updateTrackCount() {
  const el = $('#trackCount');
  if (!el) return;
  const n = playableCount();
  const unit = i18n.t(n === 1 ? 'track' : 'tracks');
  el.innerHTML = `<b>${n.toLocaleString('en-US')}</b>&nbsp;${unit}`;
  // フィルター中はアクセントカラーで明示
  el.classList.toggle('is-filtered', state.region !== 'all' || state.era !== 'all');
}

// ---- 地域フィルター ----
function getFilteredPool() {
  let pool = state.all.filter((s) => !state.broken.has(s.youtube_id));
  if (state.region !== 'all') {
    pool = pool.filter((s) => s.region === state.region);
  }
  if (state.era !== 'all') {
    pool = pool.filter((s) => s.era === state.era);
  }
  return pool;
}

function setRegion(region) {
  state.region = region;
  document.querySelectorAll('.region__btn').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.region === region));
  state.favMode = false;
  $('#favOpen').classList.remove('is-active');
  setBalance(state.balance, { keep: true });
  updateTrackCount();
  showFilterFeedback();
}

// ---- 年代フィルター ----
function setEra(era) {
  state.era = era;
  document.querySelectorAll('.era__btn').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.era === era));
  state.favMode = false;
  $('#favOpen').classList.remove('is-active');
  setBalance(state.balance, { keep: true });
  updateTrackCount();
  showFilterFeedback();
}

let filterFeedbackTimer = null;
function showFilterFeedback() {
  clearTimeout(filterFeedbackTimer);
  filterFeedbackTimer = setTimeout(() => {
    const n = playableCount();
    if (n === 0) {
      showToast(i18n.t('noMatch'));
    } else if (state.region !== 'all' || state.era !== 'all') {
      showToast(i18n.t('filterApplied'));
    }
  }, 400);
}

// ---- CONSCIOUS↔TURNT バランス ----
const CT = (s) => (s.conscious_turnt == null ? 2.5 : Number(s.conscious_turnt));
function zoneLabel(v) { if (v <= 1.5) return 'CONSCIOUS'; if (v >= 3.5) return 'TURNT'; return 'ALL'; }

function eligibleByBalance(p) {
  const live = getFilteredPool();
  let pool;
  if (p > 2.4 && p < 2.6) {
    pool = live;
  } else if (p < 2.5) {
    const ceil = 1.5 + 1.4 * p;
    pool = live.filter((s) => CT(s) <= ceil);
  } else {
    const floor = 1.4 * p - 3.5;
    pool = live.filter((s) => CT(s) >= floor);
  }
  if (!pool.length && live.length) {
    pool = live.slice().sort((a, b) => Math.abs(CT(a) - p) - Math.abs(CT(b) - p)).slice(0, 20);
  }
  return pool;
}

function setBalance(p, opts = {}) {
  state.balance = p;
  const cur = current();
  state.queue = eligibleByBalance(p);
  applyOrder(state.queue);
  if (opts.keep && cur) {
    // フィルター内に現在曲があればそのまま維持
    const keepIdx = state.queue.findIndex((s) => s.youtube_id === cur.youtube_id);
    if (keepIdx >= 0) { state.index = keepIdx; return; }
    // フィルター外でも再生中なら先頭に一時挿入して維持
    state.queue.unshift(cur);
    state.index = 0;
    return;
  }
  state.index = (cur && state.queue.length > 1 && state.queue[0].youtube_id === cur.youtube_id) ? 1 : 0;
  if (state.ready && state.queue.length) loadCurrent();
}

function updateBalanceLabel(p) { $('#balanceZone').textContent = zoneLabel(p); }

// Fisher–Yates
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// デッキシャッフル: 未再生曲を優先
function deckShuffle(arr) {
  const unplayed = arr.filter((s) => !state.played.has(s.youtube_id));
  if (unplayed.length === 0) { state.played.clear(); shuffle(arr); return; }
  const played = arr.filter((s) => state.played.has(s.youtube_id));
  shuffle(unplayed); shuffle(played);
  arr.length = 0; arr.push(...unplayed, ...played);
}

function songTime(s) {
  const t = s.publish_at || s.created_at;
  const n = t ? Date.parse(t) : NaN;
  return Number.isNaN(n) ? 0 : n;
}

function applyOrder(arr) {
  if (state.order === 'newest') arr.sort((a, b) => songTime(b) - songTime(a));
  else deckShuffle(arr);
}

function setOrder(order) {
  if (order === state.order) return;
  state.order = order;
  document.querySelectorAll('.order__btn').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.order === order));
  if (state.favMode) {
    const cur = current();
    applyOrder(state.queue);
    if (state.order === 'shuffle') state.index = 0;
    else state.index = (cur && state.queue[0] && state.queue[0].youtube_id === cur.youtube_id && state.queue.length > 1) ? 1 : 0;
    if (state.ready) loadCurrent();
  } else {
    setBalance(state.balance);
  }
}

// ---- YouTube Player ----
function createYTPlayer() {
  if (state.player || !(window.YT && window.YT.Player)) return;
  state.player = new YT.Player('yt', {
    playerVars: { autoplay: 1, mute: 1, rel: 0, controls: 0, disablekb: 1, modestbranding: 1, playsinline: 1 },
    events: {
      onReady: () => { state.ready = true; state.player.mute(); tryStart(); },
      onStateChange: onPlayerStateChange,
      onError: onPlayerError,
    },
  });
}
window.onYouTubeIframeAPIReady = createYTPlayer;
createYTPlayer();
(function watchdog(n) {
  if (state.player || n > 30) return;
  createYTPlayer();
  if (!state.player) setTimeout(() => watchdog(n + 1), 300);
})(0);
// YouTube API 10s timeout
setTimeout(() => {
  if (!state.ready) showToast(i18n.t('toastYtFail'));
}, 10000);

function onPlayerStateChange(e) {
  if (e.data === YT.PlayerState.ENDED) { next(); return; }
  if (e.data === YT.PlayerState.PLAYING) startProgress();
  else stopProgress();
  state.paused = (e.data === YT.PlayerState.PAUSED);
  const playBtn = $('#playBtn');
  playBtn.classList.toggle('is-paused', state.paused);
  // ピンON時は playBtn を絶対に表示しない（CSS display:none に加えてJS側でも強制）
  if (state.pinned) {
    playBtn.style.display = 'none';
  } else {
    playBtn.style.display = '';
  }
  if (!state.paused) wake();
}

function togglePlay() {
  if (!state.player || !state.ready) return;
  const st = state.player.getPlayerState();
  if (st === YT.PlayerState.PLAYING || st === YT.PlayerState.BUFFERING) state.player.pauseVideo();
  else state.player.playVideo();
}

let consecutiveErrors = 0;
function onPlayerError(e) {
  const song = current();
  if (song) markBroken(song.youtube_id, e.data);
  consecutiveErrors++;
  if (consecutiveErrors >= 3) {
    showToast(i18n.t('toastNetwork'));
  } else {
    showToast(i18n.t('toastSkip'));
  }
  next();
}

function markBroken(id, code) {
  if (!id || state.broken.has(id)) return;
  state.broken.add(id);
  db.markBroken(id, code);
  updateTrackCount();
}

function current() { return state.queue[state.index]; }

function tryStart() {
  if (state.started || !state.ready || !state.all.length) return;
  state.started = true;
  setBalance(2.5);
  runIntro();
}

function runIntro() {
  const intro = $('#intro');
  setTimeout(() => { intro.classList.add('is-out'); }, 4800);
  setTimeout(() => {
    intro.remove();
    document.body.classList.add('is-live');
    $('#unmute').hidden = false;
    showCoachMarks();
    wake();
  }, 6000);
}

function loadCurrent() {
  const song = current();
  if (!song) return;
  state.played.add(song.youtube_id);
  consecutiveErrors = 0;
  // ピンON時は曲切替でもplayBtnを絶対に表示しない
  if (state.pinned) $('#playBtn').style.display = 'none';
  state.player.loadVideoById(song.youtube_id);
  if (state.muted) state.player.mute();
  renderMeta(song);
  resetProgress();
}

// ---- プログレスバー ----
let progressRAF = null;
function startProgress() {
  stopProgress();
  (function tick() {
    if (!state.player || !state.ready) return;
    const dur = state.player.getDuration() || 1;
    const cur = state.player.getCurrentTime() || 0;
    $('#progressBar').style.width = `${(cur / dur) * 100}%`;
    progressRAF = requestAnimationFrame(tick);
  })();
}
function stopProgress() { if (progressRAF) { cancelAnimationFrame(progressRAF); progressRAF = null; } }
function resetProgress() { $('#progressBar').style.width = '0%'; }

function renderMeta(song) {
  const meta = $('#meta');
  renderFavBtn();
  meta.classList.remove('is-show');
  setTimeout(() => {
    $('#metaTitle').textContent = song.name;
    // description: string or {en, ja} object
    const descEl = $('#metaDesc');
    let desc = '';
    if (song.description) {
      if (typeof song.description === 'string') {
        desc = song.description;
      } else {
        const lang = i18n.getLang();
        desc = song.description[lang] || song.description.en || song.description.ja || '';
      }
    }
    descEl.textContent = desc;
    descEl.hidden = !desc;
    $('#metaUser').textContent = song.user_name ? `${i18n.t('postedBy')} ${song.user_name}` : '';
    $('#metaRegion').textContent = REGION_LABELS[song.region] || '';
    meta.classList.add('is-show');
  }, 250);
}

function step(dir) {
  const n = state.queue.length;
  if (!n) return;
  for (let i = 0; i < n; i++) {
    state.index = (state.index + dir + n) % n;
    if (!state.broken.has(current().youtube_id)) { loadCurrent(); return; }
  }
}
function next() { step(1); }
function prev() { step(-1); }

function unmute() {
  state.muted = false;
  if (state.player) { state.player.unMute(); state.player.setVolume(100); state.player.playVideo(); }
  $('#unmute').hidden = true;
}

// ---- CONSCIOUS↔TURNT スライダー ----
const balanceRange = $('#balanceRange');
balanceRange.addEventListener('input', () => updateBalanceLabel(Number(balanceRange.value)));
balanceRange.addEventListener('change', () => {
  state.favMode = false;
  $('#favOpen').classList.remove('is-active');
  setBalance(Number(balanceRange.value));
});
['touchstart', 'touchend'].forEach((ev) =>
  balanceRange.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));

// ---- 再生順トグル ----
$('#order').addEventListener('click', (e) => {
  const btn = e.target.closest('.order__btn');
  if (btn) setOrder(btn.dataset.order);
});

// ---- 地域フィルター ----
$('#regions').addEventListener('click', (e) => {
  const btn = e.target.closest('.region__btn');
  if (btn) setRegion(btn.dataset.region);
});
$('#regions').addEventListener('scroll', () => {
  const el = $('#regions');
  el.classList.toggle('is-end', el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
}, { passive: true });

// ---- 年代フィルター ----
$('#eras').addEventListener('click', (e) => {
  const btn = e.target.closest('.era__btn');
  if (btn) setEra(btn.dataset.era);
});

// ---- ピン留め ----
function togglePin() {
  state.pinned = !state.pinned;
  document.body.classList.toggle('is-pinned', state.pinned);
  $('#pinBtn').classList.toggle('is-pinned', state.pinned);
  $('#pinBtn').setAttribute('aria-pressed', state.pinned ? 'true' : 'false');
  // playBtn の表示をJS側でも完全制御
  $('#playBtn').style.display = state.pinned ? 'none' : '';
}
$('#pinBtn').addEventListener('click', togglePin);
// PC: ピンONで曲追加を促す / SP: ピンOFFでMV優先
if (window.innerWidth >= 768) {
  state.pinned = true;
  document.body.classList.add('is-pinned');
  $('#pinBtn').classList.add('is-pinned');
  $('#pinBtn').setAttribute('aria-pressed', 'true');
  $('#playBtn').style.display = 'none';
}

// ---- Fill mode（映像拡大） ----
function toggleFill() {
  state.fill = !state.fill;
  document.body.classList.toggle('is-fill', state.fill);
  $('#fillBtn').classList.toggle('is-fill', state.fill);
  $('#fillBtn').setAttribute('aria-pressed', state.fill ? 'true' : 'false');
}
$('#fillBtn').addEventListener('click', toggleFill);
// デフォルトでfill mode ON
document.body.classList.add('is-fill');
$('#fillBtn').classList.add('is-fill');
$('#fillBtn').setAttribute('aria-pressed', 'true');

// ---- 投稿 ----
const YT_ID_RE = /(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/;
function parseYouTubeId(url) {
  const m = url.match(YT_ID_RE);
  return m ? m[1] : null;
}

async function onUrlInput() {
  const id = parseYouTubeId($('#ytUrl').value.trim());
  const preview = $('#preview');
  if (!id) { preview.hidden = true; $('#submitDo').disabled = true; return; }
  $('#previewThumb').src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
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
}

let ytCtTouched = false;
const ytCt = $('#ytConsTurnt');
ytCt.addEventListener('input', () => {
  ytCtTouched = true;
  const v = Number(ytCt.value);
  $('#ytConsTurntVal').textContent = `${v.toFixed(1)} ${zoneLabel(v)}`;
});

async function doSubmit() {
  const id = parseYouTubeId($('#ytUrl').value.trim());
  if (!id) return;
  // 重複チェック
  if (state.all.some((s) => s.youtube_id === id)) {
    showToast(i18n.t('toastDuplicate'));
    return;
  }
  const song = {
    youtube_id: id,
    name: $('#previewTitle').dataset.title || 'Untitled',
    description: $('#ytComment').value.trim(),
    user_name: $('#ytName').value.trim() || i18n.t('anon'),
    thumbnail: `https://i.ytimg.com/vi/${id}/0.jpg`,
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
    closeModal();
    showToast(db.live ? i18n.t('toastAdded') : i18n.t('toastAddedLocal'));
  } catch (e) {
    console.error('[SUBMIT] Failed:', e);
    showToast(i18n.t('toastAddFail'));
  } finally {
    btn.disabled = false;
  }
}

function openModal() { $('#submitModal').hidden = false; }
function closeModal() {
  $('#submitModal').hidden = true;
  $('#ytUrl').value = ''; $('#ytComment').value = ''; $('#ytName').value = '';
  $('#ytRegion').value = ''; $('#ytEra').value = '';
  $('#preview').hidden = true; $('#submitDo').disabled = true;
  ytCtTouched = false; ytCt.value = '2.5'; $('#ytConsTurntVal').textContent = i18n.t('vibeNotSet');
}

// ---- 報告 ----
function openReport() {
  const song = current();
  if (!song) return;
  $('#reportTarget').textContent = `${i18n.t('reportingPrefix')} "${song.name}"`;
  $('#reportNote').value = '';
  $('#reportModal').hidden = false;
}
function closeReport() { $('#reportModal').hidden = true; }
async function doReport() {
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
    closeReport();
    showToast(i18n.t('toastReported'));
  } catch (e) {
    showToast(i18n.t('toastReportFail'));
  } finally {
    btn.disabled = false;
  }
}

// ===== お気に入り =====
const FAV_KEY = 'slaps_favorites';
function favGet() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } }
function favSave(arr) { localStorage.setItem(FAV_KEY, JSON.stringify(arr)); }
function isFav(id) { return favGet().some((f) => f.youtube_id === id); }

function toggleFav() {
  const song = current();
  if (!song) return;
  let favs = favGet();
  if (favs.some((f) => f.youtube_id === song.youtube_id)) {
    favs = favs.filter((f) => f.youtube_id !== song.youtube_id);
  } else {
    favs.unshift({
      youtube_id: song.youtube_id, name: song.name, description: song.description || '',
      user_name: song.user_name || '', thumbnail: song.thumbnail || `https://i.ytimg.com/vi/${song.youtube_id}/0.jpg`,
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
function showFavToast() {
  if (localStorage.getItem(FAV_NOTICE_OFF)) return;
  const t = $('#favToast');
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('is-show'));
  clearTimeout(favToastTimer);
  favToastTimer = setTimeout(hideFavToast, 4500);
}
function hideFavToast() {
  const t = $('#favToast');
  t.classList.remove('is-show');
  setTimeout(() => { t.hidden = true; }, 300);
}
$('#favToast').addEventListener('click', (e) => { if (e.target === $('#favToast')) hideFavToast(); });
$('#favToastDismiss').addEventListener('change', (e) => {
  if (e.target.checked) { localStorage.setItem(FAV_NOTICE_OFF, '1'); hideFavToast(); }
  else localStorage.removeItem(FAV_NOTICE_OFF);
});

function renderFavBtn() {
  const song = current();
  const btn = $('#favBtn');
  const on = song ? isFav(song.youtube_id) : false;
  btn.textContent = on ? i18n.t('saved') : i18n.t('save');
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.classList.toggle('is-fav', on);
}
function updateFavCount() { $('#favCount').textContent = favGet().length; }

function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function openFavs() {
  const favs = favGet();
  const list = $('#favList');
  $('#favEmpty').hidden = favs.length > 0;
  $('#favPlayAll').hidden = favs.length === 0;
  list.innerHTML = favs.map((f) => `
    <div class="fav-item" data-yt="${f.youtube_id}">
      <img class="fav-item__thumb" loading="lazy" src="${f.thumbnail}" alt="">
      <div class="fav-item__body">
        <span class="fav-item__title">${escapeHtml(f.name)}</span>
        <span class="fav-item__sub">${escapeHtml(f.user_name || i18n.t('anon'))} · ${REGION_LABELS[f.region] || ''} · ${zoneLabel(Number(f.conscious_turnt))}</span>
      </div>
      <button class="fav-item__btn" data-fav-play aria-label="Play">▶</button>
      <button class="fav-item__btn fav-item__del" data-fav-del aria-label="Remove">×</button>
    </div>`).join('');
  $('#favModal').hidden = false;
}
function closeFavs() { $('#favModal').hidden = true; }

function playFavorites(fromId) {
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

// ---- イベントリスナー ----
$('#nextBtn').addEventListener('click', next);
$('#prevBtn').addEventListener('click', prev);
$('#playBtn').addEventListener('click', togglePlay);

// ピンON時: 動画エリアをクリック/タップで一時停止（playBtnが非表示のため）
$('#player').addEventListener('click', (e) => {
  if (!state.pinned) return;
  if (e.target.closest('button, a, input, select, .brand, .dock, .top-right, .regions, .eras, .balance, .order')) return;
  // togglePlay前のstateを取得（再生中→今からpauseする = pauseアイコン表示）
  const wasPlaying = state.player && state.player.getPlayerState() === YT.PlayerState.PLAYING;
  togglePlay();
  // フィードバック: ⏸/▶ を一瞬表示
  const ind = $('#tapIndicator');
  ind.hidden = false;
  ind.classList.toggle('is-paused', wasPlaying); // 再生中だった→pause表示
  ind.style.animation = 'none';
  ind.offsetHeight; // reflow
  ind.style.animation = '';
  setTimeout(() => { ind.hidden = true; }, 650);
});
$('#submitOpen').addEventListener('click', openModal);
$('#submitClose').addEventListener('click', closeModal);
$('#submitDo').addEventListener('click', doSubmit);
$('#ytUrl').addEventListener('input', onUrlInput);
$('#unmute').addEventListener('click', unmute);
$('#reportBtn').addEventListener('click', openReport);
$('#reportClose').addEventListener('click', closeReport);
$('#reportDo').addEventListener('click', doReport);
$('#submitDo').disabled = true;

$('#favBtn').addEventListener('click', toggleFav);
$('#favOpen').addEventListener('click', openFavs);
$('#favClose').addEventListener('click', closeFavs);
$('#favPlayAll').addEventListener('click', () => playFavorites());

// モーダル背面クリックで閉じる
$('#submitModal').addEventListener('click', (e) => { if (e.target === $('#submitModal')) closeModal(); });
$('#reportModal').addEventListener('click', (e) => { if (e.target === $('#reportModal')) closeReport(); });
$('#favModal').addEventListener('click', (e) => { if (e.target === $('#favModal')) closeFavs(); });

// About overlay
const aboutOverlay = $('#aboutOverlay');
$('#infoLink').addEventListener('click', (e) => { e.preventDefault(); aboutOverlay.hidden = false; });
$('#aboutClose').addEventListener('click', () => { aboutOverlay.hidden = true; });

$('#favList').addEventListener('click', (e) => {
  const item = e.target.closest('.fav-item');
  if (!item) return;
  const id = item.dataset.yt;
  if (e.target.closest('[data-fav-del]')) {
    favSave(favGet().filter((f) => f.youtube_id !== id));
    updateFavCount();
    openFavs();
    renderFavBtn();
  } else {
    playFavorites(id);
  }
});
updateFavCount();

// ===== アイドル時UIを隠す =====
let idleTimer = null;
const IDLE_MS = 3500;
function wake() {
  document.body.classList.remove('is-idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if ($('#submitModal').hidden && $('#reportModal').hidden && $('#favModal').hidden && aboutOverlay.hidden && !state.paused) {
      document.body.classList.add('is-idle');
    }
  }, IDLE_MS);
}
['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'].forEach((ev) =>
  document.addEventListener(ev, wake, { passive: true })
);

// キーボード操作
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  if (e.key === 'Escape') {
    if (!aboutOverlay.hidden) { aboutOverlay.hidden = true; return; }
    if (!$('#submitModal').hidden) { closeModal(); return; }
    if (!$('#reportModal').hidden) { closeReport(); return; }
    if (!$('#favModal').hidden) { closeFavs(); return; }
    return;
  }
  if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  else if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    // STARTボタンが表示中ならunmuteを優先
    if (!$('#unmute').hidden) { unmute(); return; }
    togglePlay();
  }
});

// スワイプ（document レベルでキャプチャ — player の pointer-events:none を回避）
let touchStart = null;
document.addEventListener('touchstart', (e) => {
  // モーダル / About 表示中は無視
  if (!$('#submitModal').hidden || !$('#reportModal').hidden || !$('#favModal').hidden || !aboutOverlay.hidden) return;
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
document.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    dx < 0 ? next() : prev();
  }
  touchStart = null;
}, { passive: true });

// ===== トースト通知 =====
let toastTimer = null;
function showToast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-show'), 3500);
}

// ===== モーダル フォーカストラップ =====
function trapFocus(modal) {
  const focusable = modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
    else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
  });
}
['#submitModal', '#reportModal', '#favModal'].forEach((sel) => {
  const m = $(sel);
  if (m) trapFocus(m);
});

// ===== アイコンボタン コーチマーク（初回のみ） =====
const COACH_KEY = 'slaps_coach_done';
function showCoachMarks() {
  if (sessionStorage.getItem(COACH_KEY)) return;
  const tips = [
    { el: '#fillBtn', text: i18n.t('coachFill') },
    { el: '#pinBtn', text: i18n.t('coachPin') },
    { el: '#infoLink', text: i18n.t('coachAbout') },
  ];
  tips.forEach(({ el, text }) => {
    const btn = $(el);
    if (!btn) return;
    const tip = document.createElement('span');
    tip.className = 'coach-tip';
    tip.textContent = text;
    btn.style.position = 'relative';
    btn.appendChild(tip);
  });
  sessionStorage.setItem(COACH_KEY, '1');
  setTimeout(() => {
    document.querySelectorAll('.coach-tip').forEach((t) => {
      t.classList.add('is-out');
      setTimeout(() => t.remove(), 600);
    });
  }, 4000);
}

// ===== 言語切り替え =====
$('#langBtn').addEventListener('click', () => {
  i18n.setLang(i18n.getLang() === 'en' ? 'ja' : 'en');
});
i18n.applyAll();

// ===== 起動 =====
loadData();
