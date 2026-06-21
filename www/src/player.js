import { state, current, savePlayed, saveRecent } from './state.js';
import { db } from './db.js';
import {
  renderMeta,
  updateTrackCount,
  showToast,
  wake,
  resetProgress,
  startProgress,
  stopProgress,
  setBalance,
  showInfoGuide,
  fetchComments,
  showSeekIndicator,
  getAudioContext,
  renderRecommendations
} from './ui.js';

let consecutiveErrors = 0;

let promoTimer = null;
let promoFadeInterval = null;

export function createYTPlayer() {
  if (state.player || !(window.YT && window.YT.Player)) return;
  try {
    state.player = new YT.Player('yt', {
      playerVars: { autoplay: 1, mute: 1, rel: 0, controls: 0, disablekb: 1, modestbranding: 1, playsinline: 1 },
      events: {
        onReady: () => {
          state.ready = true;
          try { state.player.mute(); } catch (e) {}
          tryStart();
        },
        onStateChange: onPlayerStateChange,
        onError: onPlayerError,
      },
    });
  } catch (err) {
    console.warn('Failed to initialize YT.Player:', err);
  }
}

// Global exposure for iframe API
window.onYouTubeIframeAPIReady = createYTPlayer;

// Self-bootstrap if YT API is already loaded
if (window.YT && window.YT.Player) {
  createYTPlayer();
}

export function onPlayerStateChange(e) {
  if (e.data === YT.PlayerState.ENDED) {
    if (state.isPromo) clearPromoTimer();
    next();
    return;
  }
  if (e.data === YT.PlayerState.PLAYING) {
    startProgress();
    if (state.isPromo) {
      startPromoTimer();
    }
  } else {
    stopProgress();
    if (state.isPromo && e.data === YT.PlayerState.PAUSED) {
      clearPromoTimer();
    }
  }
  state.paused = (e.data === YT.PlayerState.PAUSED);
  const playBtn = document.querySelector('#playBtn');
  playBtn.classList.toggle('is-paused', state.paused);
  if (state.pinned) {
    playBtn.style.display = 'none';
  } else {
    playBtn.style.display = '';
  }
  if (!state.paused) wake();
}

export function togglePlay() {
  if (!state.player || !state.ready) return;
  const st = state.player.getPlayerState();
  if (st === YT.PlayerState.PLAYING || st === YT.PlayerState.BUFFERING) state.player.pauseVideo();
  else state.player.playVideo();
}

export function onPlayerError(e) {
  const song = current();
  if (song) markBroken(song.youtube_id, e.data);
  consecutiveErrors++;
  if (consecutiveErrors >= 3) {
    showToast(window.i18n.t('toastNetwork'));
  } else {
    showToast(window.i18n.t('toastSkip'));
  }
  next();
}

export function markBroken(id, code) {
  if (!id || state.broken.has(id)) return;
  state.broken.add(id);
  db.markBroken(id, code);
  updateTrackCount();
}

export function tryStart() {
  if (state.started || !state.ready || !state.all.length) return;
  state.started = true;
  const params = new URLSearchParams(window.location.search);
  const shareId = params.get('v');

  // プロモーションモード判定 (パスが /promo またはクエリに promo=1)
  if (window.location.pathname === '/promo' || params.get('promo') === '1') {
    state.isPromo = true;
    document.body.classList.add('is-promo-mode');
  }

  setBalance(2.5, { shareId });
  runIntro();
}

export function runIntro() {
  const intro = document.querySelector('#intro');
  // イントロの裏側で最初からボタンを表示状態にしておく
  document.querySelector('#unmute').hidden = false;

  const finishIntro = () => {
    if (intro) intro.remove();
    state.ready = true;

    // プロモモードの場合は自動起動（タップ待ちをスキップしミュート再生開始）
    if (state.isPromo) {
      document.body.classList.add('is-started');
      const unmuteBtn = document.querySelector('#unmute');
      if (unmuteBtn) unmuteBtn.hidden = true;
      state.muted = true; // 自動再生のためミュート必須
      if (state.player && typeof state.player.mute === 'function') {
        try {
          state.player.mute();
          state.player.playVideo();
        } catch (e) {
          console.warn('Auto-play playVideo trigger failed:', e);
        }
      }
      wake();
      showInfoGuide();
    }
  };

  if (state.isPromo) {
    // プロモモードの場合は即座にイントロを終了する
    if (intro) {
      intro.classList.add('is-out');
      setTimeout(finishIntro, 1000);
    } else {
      finishIntro();
    }
    return;
  }

  setTimeout(() => { if (intro) intro.classList.add('is-out'); }, 4800);
  setTimeout(finishIntro, 6000);
}

export function loadCurrent() {
  const song = current();
  if (!song) return;
  state.played.add(song.youtube_id);
  savePlayed();

  // Update recent playback history
  state.recent = state.recent.filter((id) => id !== song.youtube_id);
  state.recent.push(song.youtube_id);
  if (state.recent.length > 10) {
    state.recent.shift();
  }
  saveRecent();

  consecutiveErrors = 0;
  if (state.pinned) document.querySelector('#playBtn').style.display = 'none';
  state.player.loadVideoById(song.youtube_id);
  if (state.muted) {
    state.player.mute();
  } else {
    state.player.unMute();
    state.player.setVolume(state.volume);
  }
  renderMeta(song);
  resetProgress();

  // コメントの取得
  fetchComments(song.youtube_id);

  // 推薦曲の取得
  const artist = getArtistNameFromSong(song);

  if (artist) {
    fetchRecommendations(artist);
  } else {
    // アーティスト名が抽出できない場合、曲名単体で iTunes API 逆引きを試みる
    fetchArtistAndRecommendationsBySongName(song);
  }

  // OGP 画像の事前生成をバックグラウンドでトリガー（プリウォーム）
  fetch(`/api/og-image?v=${song.youtube_id}`).catch(() => {});
}

// アーティスト名を柔軟に抽出するヘルパー
export function getArtistNameFromSong(song) {
  if (!song || !song.name) return '';
  
  let artist = '';

  const dashSeparators = [
    ' - ', ' -', '- ', 
    ' – ', ' –', '– ', '–', // ENダッシュ (\u2013)
    ' — ', ' —', '— ', '—', // EMダッシュ (\u2014)
    ' 〜 ', '〜', ' ~ ', '~' // 波ダッシュ等
  ];
  
  let foundSep = false;
  for (const sep of dashSeparators) {
    if (song.name.includes(sep)) {
      artist = song.name.split(sep)[0];
      foundSep = true;
      break;
    }
  }

  if (!foundSep) {
    if (song.name.includes(' / ')) {
      artist = song.name.split(' / ')[0];
    } else if (song.name.includes(' ／ ')) {
      artist = song.name.split(' ／ ')[0];
    } else if (song.name.includes('／')) {
      artist = song.name.split('／')[0];
    } else if (song.name.includes('「')) {
      artist = song.name.split('「')[0];
    } else if (song.name.includes('『')) {
      artist = song.name.split('『')[0];
    }
    // 引用符による曲名の囲みがある場合（例: H//PE Princess (하입프린세스) 'Stolen' MV）
    else if (song.name.includes("'")) {
      artist = song.name.split("'")[0];
    } else if (song.name.includes('"')) {
      artist = song.name.split('"')[0];
    }
  }

  // セパレーターがなくアーティスト名が空の場合、feat./ft./featuring の記述から抽出を試みる
  if (!artist) {
    const featRegex = /(?:feat\.?|ft\.?|featuring)\s+([^()\[\]\-_~—–]+)/i;
    const match = song.name.match(featRegex);
    if (match && match[1]) {
      artist = match[1].trim();
    }
  }

  if (!artist) return '';

  artist = artist.trim();

  // 誤って曲名囲み記号が残ってしまっている場合のさらなる分離救済
  if (artist.includes('『')) artist = artist.split('『')[0];
  if (artist.includes('「')) artist = artist.split('「')[0];

  // 括弧内のサブテキスト・翻訳表記を除去（例: "H//PE Princess (하입프린세스)" -> "H//PE Princess"）
  artist = artist.replace(/\(.*?\)/g, '').replace(/（.*?）/g, '').trim();

  return artist;
}

// 元の曲名と逆引き結果のタイトルが一致または類似しているか検証するヘルパー (アーティスト一致は客演部分一致を防ぐため廃止)
function isTitleArtistMatch(originalName, reversedArtist, reversedTitle) {
  const clean = (str) => {
    if (!str) return '';
    return str.toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      // 英数字と日本語のみを残し、特殊文字を削除
      .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/gi, '')
      .trim();
  };

  const origClean = clean(originalName);
  const revTitleClean = clean(reversedTitle);

  if (!origClean || !revTitleClean) return false;

  // 1. 逆引きタイトルが元の曲名に含まれているか、またはその逆
  if (origClean.includes(revTitleClean) || revTitleClean.includes(origClean)) {
    return true;
  }

  // 2. 元の曲名に含まれる主要単語（英単語等）が逆引きタイトルに含まれているか
  const origWords = originalName.toLowerCase().split(/[^a-z0-9]+/i).filter(w => w.length > 2);
  const revTitleLower = reversedTitle.toLowerCase();
  for (const word of origWords) {
    if (['official', 'video', 'audio', 'music', 'feat', 'featuring', 'remix', 'version'].includes(word)) {
      continue;
    }
    if (revTitleLower.includes(word)) {
      return true;
    }
  }

  return false;
}

// すでにステーションに登録されている同アーティストの曲を探すヘルパー
function getRegisteredRecommendations(artist, currentSong) {
  const splitArtists = (name) => {
    return name
      .split(/,|\s+&\s+|&|\s+and\s+|\s+feat\.?\s+|\s+featuring\s+|\s+ft\.?\s+|\/|／|\s+vs\.?\s+|\s+x\s+|\s+×\s+|と|・|\+/gi)
      .map(a => a.trim().toLowerCase())
      .filter(Boolean);
  };
  const searchArtists = splitArtists(artist);

  const registered = [];
  for (const song of state.all) {
    if (song.youtube_id === currentSong.youtube_id) {
      continue;
    }

    const dashSeparators = [' - ', ' -', '- ', ' – ', ' –', '– ', '–', ' — ', ' —', '— ', '—', ' 〜 ', '〜', ' ~ ', '~'];
    let songArtist = '';
    for (const sep of dashSeparators) {
      if (song.name.includes(sep)) {
        songArtist = song.name.split(sep)[0];
        break;
      }
    }
    if (!songArtist) {
      if (song.name.includes(' / ')) songArtist = song.name.split(' / ')[0];
      else if (song.name.includes(' ／ ')) songArtist = song.name.split(' ／ ')[0];
      else if (song.name.includes('／')) songArtist = song.name.split('／')[0];
    }
    
    if (!songArtist) {
      const featRegex = /(?:feat\.?|ft\.?|featuring)\s+([^()\[\]\-_~—–]+)/i;
      const match = song.name.match(featRegex);
      if (match && match[1]) {
        songArtist = match[1].trim();
      }
    }

    if (!songArtist) continue;

    const trackArtists = splitArtists(songArtist);
    
    // 一致判定
    const isMatch = trackArtists.some(ta => searchArtists.includes(ta)) || 
                    searchArtists.some(sa => trackArtists.includes(sa));

    if (isMatch) {
      const parts = song.name.split(/ - | – | — /);
      const title = parts[1] || song.name;
      const artistName = parts[0] || songArtist;

      registered.push({
        artist: artistName.trim(),
        title: title.trim(),
        artwork: song.thumbnail || './assets/logo.png',
        youtube_id: song.youtube_id,
        registered: true
      });
      if (registered.length >= 3) {
        break;
      }
    }
  }
  return registered;
}

// アーティスト名が抽出できなかった場合、曲名単体で iTunes API からアーティスト名を逆引きして推薦を取得する
export async function fetchArtistAndRecommendationsBySongName(song) {
  try {
    // 不要な動画関連のワードをクリーンアップして iTunes API のヒット率を向上させる
    const query = song.name
      .replace(/\(official.*?\)/gi, '')
      .replace(/\[official.*?\]/gi, '')
      .replace(/mv/gi, '')
      .replace(/video/gi, '')
      .replace(/audio/gi, '')
      .replace(/music video/gi, '')
      .trim();

    const isJpRegion = song && (song.region === 'jp');
    const country = isJpRegion ? 'JP' : 'US';
    const langParam = isJpRegion ? '&lang=ja_jp' : '';

    const term = encodeURIComponent(query);
    const url = `https://itunes.apple.com/search?term=${term}&entity=song&limit=5&country=${country}${langParam}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('iTunes API error');
    const data = await res.json();
    
    if (data.results && data.results.length > 0) {
      const track = data.results[0];
      const reversedArtist = track.artistName;
      const reversedTitle = track.trackName;
      if (reversedArtist && reversedTitle) {
        // 逆引きした結果が元の曲情報とマッチするか検証（誤書き換え防止）
        if (!isTitleArtistMatch(song.name, reversedArtist, reversedTitle)) {
          console.log(`Ignoring mismatching reverse-lookup result: "${reversedArtist} - ${reversedTitle}" for original: "${song.name}"`);
          if (current() && current().youtube_id === song.youtube_id) {
            state.recommendations = [];
            renderRecommendations();
          }
          return;
        }

        // 非同期競合チェック（現在再生中の動画IDが元の曲と同じか）
        if (current() && current().youtube_id === song.youtube_id) {
          console.log(`Reversed artist name for "${song.name}": "${reversedArtist} - ${reversedTitle}"`);
          
          // 曲名はDBの正式データを維持（iTunes逆引き結果で上書きしない）
          
          await fetchRecommendations(reversedArtist, true);
          return;
        }
      }
    }
  } catch (err) {
    console.warn('Failed to reverse-lookup artist name:', err);
  }

  // 逆引きに失敗した場合、または結果がない場合は空で表示
  if (current() && current().youtube_id === song.youtube_id) {
    state.recommendations = [];
    renderRecommendations();
  }
}




export function step(dir) {
  const n = state.queue.length;
  if (!n) return;
  for (let i = 0; i < n; i++) {
    state.index = (state.index + dir + n) % n;
    if (!state.broken.has(current().youtube_id)) {
      slideTransition(dir);
      return;
    }
  }
}

let isTransitioning = false;
let slideTransitionTimeout = null;
let activeSlideOutEndListener = null;

export function slideTransition(dir) {
  const vb = document.querySelector('.video-bg');
  
  if (activeSlideOutEndListener) {
    vb.removeEventListener('transitionend', activeSlideOutEndListener);
    activeSlideOutEndListener = null;
  }
  if (slideTransitionTimeout) {
    clearTimeout(slideTransitionTimeout);
    slideTransitionTimeout = null;
  }

  isTransitioning = true;
  let loadCalled = false;

  const outClass = dir > 0 ? 'slide-out-left' : 'slide-out-right';
  const inClass  = dir > 0 ? 'slide-in-left'  : 'slide-in-right';

  vb.classList.remove('slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right');
  vb.classList.add(outClass);

  const onSlideOutEnd = (e) => {
    if (e.target !== vb) return;
    vb.removeEventListener('transitionend', onSlideOutEnd);
    activeSlideOutEndListener = null;
    
    if (slideTransitionTimeout) {
      clearTimeout(slideTransitionTimeout);
      slideTransitionTimeout = null;
    }

    if (!loadCalled) { loadCalled = true; loadCurrent(); }
    vb.classList.remove(outClass);
    vb.classList.add(inClass);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        vb.classList.remove(inClass);
        isTransitioning = false;
      });
    });
  };

  activeSlideOutEndListener = onSlideOutEnd;
  vb.addEventListener('transitionend', onSlideOutEnd);

  slideTransitionTimeout = setTimeout(() => {
    slideTransitionTimeout = null;
    if (activeSlideOutEndListener) {
      vb.removeEventListener('transitionend', activeSlideOutEndListener);
      activeSlideOutEndListener = null;
    }
    vb.classList.remove('slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right');
    if (!loadCalled) { loadCalled = true; loadCurrent(); }
    isTransitioning = false;
  }, 500);
}

export function next() { step(1); }
export function prev() { step(-1); }

export function unmute() {
  state.muted = false;
  if (state.player) { 
    state.player.unMute(); 
    state.player.setVolume(state.volume); // ハードコード 100 から state.volume へ変更
    state.player.playVideo(); 
  }
  document.querySelector('#unmute').hidden = true;
  document.body.classList.add('is-started');
  
  // ミュート解除時にUI側の音量表示とスライダーをstate.volume同期させる
  const volumeSlider = document.querySelector('#volumeSlider');
  const volumeValue = document.querySelector('#volumeValue');
  const volumeIcon = document.querySelector('#volumeIcon');
  if (volumeSlider && volumeValue && volumeIcon) {
    volumeSlider.value = state.volume;
    volumeValue.textContent = `${state.volume}%`;
    volumeIcon.textContent = state.volume === 0 ? '🔇' : '🔊';
  }

  wake();
  showInfoGuide();
  
  // ユーザーの最初のアクションでAudioContextを有効化し、即座に効果音MP3のロード＆デコードを開始
  try {
    getAudioContext();
  } catch (audioErr) {
    console.warn('Failed to pre-initialize AudioContext during unmute:', audioErr);
  }
}

export function seekBy(seconds) {
  if (!state.player || !state.ready) return;
  try {
    const cur = state.player.getCurrentTime();
    const dur = state.player.getDuration();
    if (cur == null || dur == null) return;
    let target = cur + seconds;
    if (target < 0) target = 0;
    if (target > dur) target = dur;
    state.player.seekTo(target, true);
    
    // UI側のシークインジケーター表示を呼び出す
    const isForward = seconds > 0;
    showSeekIndicator(isForward);
  } catch (e) {
    console.warn('Seek failed:', e);
  }
}

// 音量コントロール用API (HOTFIX)
export function setVolume(vol) {
  state.volume = vol;
  if (state.player && typeof state.player.setVolume === 'function') {
    state.player.setVolume(vol);
    if (vol > 0) {
      state.muted = false;
      try { state.player.unMute(); } catch (e) {}
    } else {
      state.muted = true;
      try { state.player.mute(); } catch (e) {}
    }
  }
  try {
    localStorage.setItem('slaps_volume', vol);
  } catch (e) {}
}

// プロモ用タイマーとフェードアウトの実装
function startPromoTimer() {
  state.promoFinished = false; // 再生開始時にフラグをリセット
  clearPromoTimer();

  // 音量を初期設定値に戻す
  if (state.player && typeof state.player.setVolume === 'function') {
    state.player.setVolume(state.volume);
  }

  const totalDuration = 20000; // 合計動画時間: 20秒
  const fadeDuration = 3000;   // フェードアウトとロゴ表示の時間: 3秒
  const playDuration = totalDuration - fadeDuration; // 通常再生時間: 17秒

  promoTimer = setTimeout(() => {
    // 1. エンディングロゴ画面の表示
    const outro = document.querySelector('#promoOutro');
    if (outro) {
      outro.hidden = false;
      requestAnimationFrame(() => {
        outro.classList.add('is-active');
      });
    }

    // 2. 音楽のフェードアウト
    const startVolume = state.volume;
    const fadeInterval = 50; // 50msごとに音量を下げる
    let elapsed = 0;

    promoFadeInterval = setInterval(() => {
      elapsed += fadeInterval;
      const progress = Math.min(elapsed / fadeDuration, 1);
      const currentVolume = startVolume * (1 - progress);

      if (state.player && typeof state.player.setVolume === 'function') {
        state.player.setVolume(currentVolume);
      }

      if (progress >= 1) {
        clearInterval(promoFadeInterval);
        promoFadeInterval = null;
        
        state.promoFinished = true; // 完走フラグをセット
        
        if (state.player && typeof state.player.pauseVideo === 'function') {
          state.player.pauseVideo();
        }
        // 次回再生のために音量を元に戻しておく
        if (state.player && typeof state.player.setVolume === 'function') {
          state.player.setVolume(startVolume);
        }
      }
    }, fadeInterval);

  }, playDuration);
}

function clearPromoTimer() {
  if (promoTimer) {
    clearTimeout(promoTimer);
    promoTimer = null;
  }
  if (promoFadeInterval) {
    clearInterval(promoFadeInterval);
    promoFadeInterval = null;
  }
  
  // 完走している場合は、ロゴ画面を非表示に戻さない
  if (state.promoFinished) {
    return;
  }

  // ロゴ画面を非表示に戻す
  const outro = document.querySelector('#promoOutro');
  if (outro) {
    outro.classList.remove('is-active');
    outro.hidden = true;
  }
}

// アーティスト名と一致する楽曲を検証しフィルタするヘルパー
function filterTracksByArtist(results, artist, registeredTitles, cleanTitle) {
  const unexpressed = [];
  const seenTitles = new Set();
  
  const searchArtist = artist.trim().toLowerCase();
  
  const splitArtists = (name) => {
    return name
      .split(/,|\s+&\s+|&|\s+and\s+|\s+feat\.?\s+|\s+featuring\s+|\s+ft\.?\s+|\/|／|\s+vs\.?\s+|\s+x\s+|\s+×\s+|と|×|・|\+/gi)
      .map(a => a.trim().toLowerCase())
      .filter(Boolean);
  };
  const searchArtists = splitArtists(searchArtist);

  for (const track of results) {
    const trackName = track.trackName;
    if (!trackName) continue;
    
    // アーティスト名の一致チェック (メイン名でのチェック)
    const trackArtist = (track.artistName || '').trim().toLowerCase();
    const trackArtists = splitArtists(trackArtist);
    
    // 曲名（trackName）の中の客演アーティスト（feat/ft/withなど）もチェック対象にする
    const trackNameLower = trackName.toLowerCase();
    const isFeatured = searchArtists.some(sa => {
      if (trackNameLower.includes(sa)) {
        return trackNameLower.includes(`feat. ${sa}`) || 
               trackNameLower.includes(`feat.${sa}`) || 
               trackNameLower.includes(`ft. ${sa}`) || 
               trackNameLower.includes(`ft.${sa}`) || 
               trackNameLower.includes(`featuring ${sa}`) || 
               trackNameLower.includes(`with ${sa}`) || 
               trackNameLower.includes(`& ${sa}`) || 
               trackNameLower.includes(`and ${sa}`);
      }
      return false;
    });
    
    const isArtistMatch = trackArtists.some(ta => searchArtists.includes(ta)) || 
                          searchArtists.some(sa => trackArtists.includes(sa)) ||
                          isFeatured;
                          
    if (!isArtistMatch) {
      continue;
    }
    
    const cleanTrackName = cleanTitle(trackName);
    if (!cleanTrackName) continue;
    
    // 重複チェック (登録済みリストのいずれかとクリーン化タイトルが完全一致するか)
    const isDuplicate = registeredTitles.some(reg => cleanTrackName === reg);
    if (seenTitles.has(cleanTrackName) || isDuplicate) {
      continue;
    }
    
    // 除外キーワード
    const lowerName = trackName.trim().toLowerCase();
    if (lowerName.includes('remix') || lowerName.includes('instrumental') || lowerName.includes('live') || lowerName.includes('version') || lowerName.includes('edited') || lowerName.includes('karaoke') || lowerName.includes('cover')) {
      continue;
    }

    seenTitles.add(cleanTrackName);
    unexpressed.push({
      artist: track.artistName || artist,
      title: trackName,
      // 解像度を 100x100 から 400x400 に上げる
      artwork: (track.artworkUrl100 || '').replace('100x100bb.jpg', '400x400bb.jpg')
    });

    if (unexpressed.length >= 3) break;
  }
  return unexpressed;
}

// iTunes Search API から未登録推薦曲を取得する
export async function fetchRecommendations(artist, isFallback = false) {
  try {
    // すでに登録済みの曲リスト（小文字の曲名配列、かつfeatや括弧を削除したクリーンなタイトル）
    const cleanTitle = (str) => {
      if (!str) return '';
      return str.toLowerCase()
        .replace(/\(feat\..*?\)/g, '')
        .replace(/feat\..*/g, '')
        .replace(/\(featuring.*?\)/g, '')
        .replace(/featuring.*/g, '')
        .replace(/\(ft\..*?\)/g, '')
        .replace(/ft\..*/g, '')
        .replace(/[\(\)\[\]]/g, '')
        .trim();
    };

    const registeredTitles = state.all.map(s => {
      if (!s.name) return '';
      const parts = s.name.split(' - ');
      return cleanTitle(parts[1] || s.name);
    }).filter(Boolean);

    const song = current();
    
    // 1. まずはすでに登録済みの曲（映像あり）を最優先で取得
    let registeredRecs = [];
    if (song) {
      registeredRecs = getRegisteredRecommendations(artist, song);
    }
    
    let filtered = [...registeredRecs];

    // もし登録曲が3曲未満なら、残りの枠を iTunes API の未登録曲で補完する
    if (filtered.length < 3) {
      // 検索用のクエリキーとして、最初のアーティスト名（メイン）を抽出
      const splitArtistsForQuery = (name) => {
        return name
          .split(/,|\s+&\s+|&|\s+and\s+|\s+feat\.?\s+|\s+featuring\s+|\s+ft\.?\s+|\/|／|\s+vs\.?\s+|\s+x\s+|\s+×\s+|と|・|\+/gi)
          .map(a => a.trim())
          .filter(Boolean);
      };
      const artistParts = splitArtistsForQuery(artist);
      const searchKey = artistParts[0] || artist;

      const isJpRegion = song && (song.region === 'jp');
      let itunesRecs = [];

      if (isJpRegion) {
        const urlJp = `https://itunes.apple.com/search?term=${encodeURIComponent(searchKey)}&entity=song&limit=25&country=JP&lang=ja_jp`;
        const resJp = await fetch(urlJp);
        if (resJp.ok) {
          const dataJp = await resJp.json();
          if (dataJp.results && dataJp.results.length > 0) {
            itunesRecs = filterTracksByArtist(dataJp.results, artist, registeredTitles, cleanTitle);
          }
        }

        if (itunesRecs.length === 0) {
          const urlGlobal = `https://itunes.apple.com/search?term=${encodeURIComponent(searchKey)}+hiphop&entity=song&limit=25&country=US`;
          const resGlobal = await fetch(urlGlobal);
          if (resGlobal.ok) {
            const dataGlobal = await resGlobal.json();
            if (dataGlobal.results && dataGlobal.results.length > 0) {
              itunesRecs = filterTracksByArtist(dataGlobal.results, artist, registeredTitles, cleanTitle);
            }
          }
        }
      } else {
        const urlGlobal = `https://itunes.apple.com/search?term=${encodeURIComponent(searchKey)}+hiphop&entity=song&limit=25&country=US`;
        const resGlobal = await fetch(urlGlobal);
        if (resGlobal.ok) {
          const dataGlobal = await resGlobal.json();
          if (dataGlobal.results && dataGlobal.results.length > 0) {
            itunesRecs = filterTracksByArtist(dataGlobal.results, artist, registeredTitles, cleanTitle);
          }
        }

        if (itunesRecs.length === 0) {
          const urlJp = `https://itunes.apple.com/search?term=${encodeURIComponent(searchKey)}&entity=song&limit=25&country=JP&lang=ja_jp`;
          const resJp = await fetch(urlJp);
          if (resJp.ok) {
            const dataJp = await resJp.json();
            if (dataJp.results && dataJp.results.length > 0) {
              itunesRecs = filterTracksByArtist(dataJp.results, artist, registeredTitles, cleanTitle);
            }
          }
        }
      }

      // iTunes の結果を、現在 filtered に入っている（登録済み関連曲）タイトルと重複しないように追加
      for (const ir of itunesRecs) {
        if (filtered.length >= 3) break;
        const cleanIrTitle = cleanTitle(ir.title);
        const isDuplicate = filtered.some(f => cleanTitle(f.title) === cleanIrTitle);
        if (!isDuplicate) {
          filtered.push({
            ...ir,
            registered: false
          });
        }
      }
    }

    // 推薦が0件だった場合、かつまだ逆引きを実行していないなら、曲名全体での逆引きフォールバックを試みる
    if (filtered.length === 0 && !isFallback) {
      if (song) {
        console.log(`No recommendations found for "${artist}". Attempting reverse lookup fallback...`);
        await fetchArtistAndRecommendationsBySongName(song);
        return;
      }
    }

    state.recommendations = filtered.slice(0, 3);
  } catch (err) {
    console.warn('Failed to fetch recommendations:', err);
    state.recommendations = [];
  }

  renderRecommendations();
}
