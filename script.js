import { state } from './src/state.js';
import { db } from './src/db.js';
import { tryStart, createYTPlayer } from './src/player.js';
import { setupUIListeners, updateTrackCount } from './src/ui.js';

// ---- データ読み込み ----
async function loadData() {
  try {
    state.all = await db.loadSongs();
  } catch {
    state.all = [];
  }
  updateTrackCount();
  tryStart();
}

// 起動処理
document.addEventListener('DOMContentLoaded', () => {
  setupUIListeners();
  loadData();
  
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
    }
  }, 10000);
  
  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js')
      .then(() => {})
      .catch(() => {});
  }
});
