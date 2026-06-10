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
  if (song.name && song.name.includes(' - ')) {
    const parts = song.name.split(' - ');
    const artist = parts[0].trim();
    fetchRecommendations(artist);
  } else {
    state.recommendations = [];
    renderRecommendations();
  }

  // OGP 画像の事前生成をバックグラウンドでトリガー（プリウォーム）
  fetch(`/api/og-image?v=${song.youtube_id}`).catch(() => {});
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
  wake();
  showInfoGuide();

  // ミュート解除に伴う音量コントロールUIの同期
  const volumeSlider = document.querySelector('#volumeSlider');
  const volumeValue = document.querySelector('#volumeValue');
  const volumeIcon = document.querySelector('#volumeIcon');
  if (volumeSlider && volumeValue && volumeIcon) {
    volumeSlider.value = state.volume;
    volumeValue.textContent = `${state.volume}%`;
    volumeIcon.textContent = state.volume === 0 ? '🔇' : '🔊';
  }
  
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

// iTunes Search API から未登録推薦曲を取得する
export async function fetchRecommendations(artist) {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=song&limit=25`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('iTunes API error');
    const data = await res.json();
    
    if (!data.results || data.results.length === 0) {
      state.recommendations = [];
      renderRecommendations();
      return;
    }

    // すでに登録済みの曲リスト（小文字の曲名Set）
    const registeredTitles = new Set(
      state.all.map(s => {
        if (!s.name) return '';
        const parts = s.name.split(' - ');
        return (parts[1] || s.name).trim().toLowerCase();
      }).filter(Boolean)
    );

    const unexpressed = [];
    const seenTitles = new Set();
    
    for (const track of data.results) {
      const trackName = track.trackName;
      if (!trackName) continue;
      const lowerName = trackName.trim().toLowerCase();
      
      if (seenTitles.has(lowerName) || registeredTitles.has(lowerName)) {
        continue;
      }
      
      // 除外キーワード
      if (lowerName.includes('remix') || lowerName.includes('instrumental') || lowerName.includes('live') || lowerName.includes('version') || lowerName.includes('edited') || lowerName.includes('karaoke') || lowerName.includes('cover')) {
        continue;
      }

      seenTitles.add(lowerName);
      unexpressed.push({
        artist: track.artistName || artist,
        title: trackName,
        artwork: track.artworkUrl100 || ''
      });

      if (unexpressed.length >= 3) break;
    }

    state.recommendations = unexpressed;
  } catch (err) {
    console.warn('Failed to fetch recommendations:', err);
    state.recommendations = [];
  }

  renderRecommendations();
}
