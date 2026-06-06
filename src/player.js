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
  getAudioContext
} from './ui.js';

let consecutiveErrors = 0;

export function createYTPlayer() {
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

// Global exposure for iframe API
window.onYouTubeIframeAPIReady = createYTPlayer;

// Self-bootstrap if YT API is already loaded
if (window.YT && window.YT.Player) {
  createYTPlayer();
}

export function onPlayerStateChange(e) {
  if (e.data === YT.PlayerState.ENDED) { next(); return; }
  if (e.data === YT.PlayerState.PLAYING) startProgress();
  else stopProgress();
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
  setBalance(2.5, { shareId });
  runIntro();
}

export function runIntro() {
  const intro = document.querySelector('#intro');
  // イントロの裏側で最初からボタンを表示状態にしておく
  document.querySelector('#unmute').hidden = false;
  setTimeout(() => { intro.classList.add('is-out'); }, 4800);
  setTimeout(() => {
    intro.remove();
  }, 6000);
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
  if (state.muted) state.player.mute();
  renderMeta(song);
  resetProgress();

  // コメントの取得
  fetchComments(song.youtube_id);

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
  if (state.player) { state.player.unMute(); state.player.setVolume(100); state.player.playVideo(); }
  document.querySelector('#unmute').hidden = true;
  document.body.classList.add('is-started');
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
