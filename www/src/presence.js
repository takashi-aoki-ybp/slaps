import { state, current } from './state.js';
import { loadCurrent } from './player.js';

let presenceInterval = null;
let currentClientId = null;

function hidePresence() {
  const badge = document.getElementById('onlineBadge');
  if (badge) badge.hidden = true;
}

// 簡単なUUID生成
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 初期化
export function initPresence() {
  currentClientId = localStorage.getItem('slaps_client_id');
  if (!currentClientId) {
    currentClientId = generateUUID();
    localStorage.setItem('slaps_client_id', currentClientId);
  }

  // 初回実行
  updatePresence();

  // 10秒ごとにポーリング
  presenceInterval = setInterval(updatePresence, 10000);
}

// APIへ状態を送信し、他ユーザーの状態を取得
async function updatePresence() {
  const curSong = current();
  const currentVideoId = curSong ? curSong.youtube_id : null;
  
  try {
    const res = await fetch('/api/presence', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: currentClientId,
        youtubeId: currentVideoId
      }),
    });

    if (!res.ok) {
      hidePresence();
      return;
    }

    const data = await res.json();
    
    // オンライン人数の更新
    if (Number.isInteger(data.onlineCount) && data.onlineCount >= 0) {
      const badge = document.getElementById('onlineBadge');
      if (badge) {
        badge.innerHTML = `<span class="online-dot"></span> ${data.onlineCount} online`;
        badge.hidden = false;
      }
    } else {
      hidePresence();
    }

    // 他人が聴いている曲の通知 (トースト/ティッカー)
    if (data.someoneListeningTo) {
      showVibeTicker(data.someoneListeningTo);
    }
    
  } catch (err) {
    // サイレントエラー (機能しなくてもメインに影響させない)
    hidePresence();
    console.debug('Presence update failed', err);
  }
}

// Vibeティッカーを表示する
let tickerTimeout = null;
function showVibeTicker(song) {
  const ticker = document.getElementById('vibeTicker');
  if (!ticker) return;
  if (!state.started) return;
  if (document.querySelector('.modal:not([hidden]), .about-ov:not([hidden])')) return;

  const title = String(song?.title || song?.name || '').trim();
  const youtubeId = String(song?.youtube_id || '').trim();
  if (!title || !youtubeId) return;

  // すでに表示中ならスキップ (頻繁に出すぎないように)
  if (!ticker.hidden) return;

  const icon = document.createElement('span');
  icon.className = 'vibe-ticker__icon';
  icon.textContent = '🎵';
  const text = document.createElement('span');
  text.className = 'vibe-ticker__text';
  text.append('Someone is vibing to ');
  const strong = document.createElement('strong');
  strong.textContent = title;
  text.append(strong);
  ticker.replaceChildren(icon, text);
  ticker.hidden = false;
  
  // クリック時のアクション (曲へジャンプ)
  ticker.onclick = () => {
    ticker.hidden = true;
    const targetSong = state.all.find(s => s.youtube_id === youtubeId);
    if (targetSong) {
      // 現在のキューの先頭（現在再生中）の次、または先頭に割り込ませる
      state.queue = state.queue.filter(s => s.youtube_id !== youtubeId);
      state.queue.unshift(targetSong);
      state.index = 0;
      loadCurrent();
    }
  };

  // 5秒で消す
  clearTimeout(tickerTimeout);
  tickerTimeout = setTimeout(() => {
    ticker.hidden = true;
  }, 5000);
}
