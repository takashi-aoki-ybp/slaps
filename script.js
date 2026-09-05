import { state } from './src/state.js';
import { db } from './src/db.js';
import { tryStart, createYTPlayer, runIntro } from './src/player.js';
import { setupUIListeners, updateTrackCount, updateFavCount, showToast } from './src/ui.js';
import { initPresence } from './src/presence.js';
import { initAnalytics } from './src/analytics.js';
import { initDaily } from './src/ui.js';

// ---- データ読み込み ----
async function loadData() {
  try {
    state.all = await db.loadSongs();
  } catch {
    state.all = [];
  }
  if (state.crateMode) {
    const existingIds = new Set(state.all.map((song) => song.youtube_id));
    state.crateIds = state.crateIds.filter((id) => existingIds.has(id));
    if (!state.crateIds.length) {
      state.crateMode = false;
    } else {
      showToast(window.i18n.t('crateLoaded').replace('{count}', state.crateIds.length));
    }
  }
  updateTrackCount();
  updateFavCount();
  initDaily();
  if (!state.all.length) showToast(window.i18n.t('toastCatalogFail'));
  tryStart();
}
window.retrySLAPS = loadData;

// 起動処理
document.addEventListener('DOMContentLoaded', () => {
  window.__state = state;
  window.i18n.applyAll();
  initAnalytics();
  setupUIListeners();
  runIntro();
  loadData();
  initPresence();
  
  // Watchdog for YT player
  createYTPlayer();
  (function watchdog(n) {
    if (state.player || n > 30) return;
    createYTPlayer();
    if (!state.player) setTimeout(() => watchdog(n + 1), 300);
  })(0);

  // YouTube API 10s timeout
  setTimeout(() => {
    if (!state.ready) {
      import('./src/ui.js').then((ui) => {
        ui.showToast(window.i18n.t('toastYtFail'));
      });
      // Only onReady may mark the actual player ready. A late API callback
      // can still start muted playback; START can retry without a reload.
      createYTPlayer();
    }
  }, 10000);
  
  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js')
      .then((registration) => registration.update())
      .catch(() => {});
  }
});
