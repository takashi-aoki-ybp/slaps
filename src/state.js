export const REGION_LABELS = {
  us: '🇺🇸 US', jp: '🇯🇵 JP', uk: '🇬🇧 UK', fr: '🇫🇷 FR', kr: '🇰🇷 KR', other: '🌍', all: '🌐 ALL',
};

const PLAYED_KEY = 'slaps_played';
const loadPlayed = () => {
  try {
    const arr = JSON.parse(localStorage.getItem(PLAYED_KEY) || '[]');
    return new Set(arr);
  } catch {
    return new Set();
  }
};

export function savePlayed() {
  try {
    localStorage.setItem(PLAYED_KEY, JSON.stringify([...state.played]));
  } catch {
    // quota exceeded — silently drop
  }
}

const RECENT_KEY = 'slaps_recent';
const loadRecent = () => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
};

export function saveRecent() {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(state.recent));
  } catch {
    // quota exceeded — silently drop
  }
}

export const state = {
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
  played: loadPlayed(),   // デッキシャッフル: 再生済みID
  recent: loadRecent(),   // 直近再生曲のガード（最大10曲の配列）
  comments: [],           // コメントデータ
  ttsEnabled: false,      // 音声読み上げON/OFF
  triggeredComments: new Set(), // すでにトリガーしたコメントID
};

export const CT = (s) => (s.conscious_turnt == null ? 2.5 : Number(s.conscious_turnt));

export function current() {
  return state.queue[state.index];
}

export function getFilteredPool() {
  let pool = state.all.filter((s) => !state.broken.has(s.youtube_id));
  if (state.region !== 'all') {
    pool = pool.filter((s) => s.region === state.region);
  }
  if (state.era !== 'all') {
    pool = pool.filter((s) => s.era === state.era);
  }
  return pool;
}

export function playableCount() {
  return getFilteredPool().length;
}

export function eligibleByBalance(p) {
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

// Fisher–Yates
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// デッキシャッフル: 未再生曲を優先し、かつ直近N曲（recent）を最後方に配置
export function deckShuffle(arr) {
  let recentSet = new Set(state.recent);
  
  // 未再生で、かつ直近N曲に含まれない曲
  const unplayedNotRecent = arr.filter((s) => !state.played.has(s.youtube_id) && !recentSet.has(s.youtube_id));
  
  // もし unplayedNotRecent が空の場合、再生完了（または recent ばかり）とみなし、このプール内の曲を履歴から部分クリアする
  if (unplayedNotRecent.length === 0 && arr.length > 0) {
    // プール内の曲のみを played と recent から削除
    for (const song of arr) {
      state.played.delete(song.youtube_id);
    }
    state.recent = state.recent.filter((id) => !arr.some((s) => s.youtube_id === id));
    savePlayed();
    saveRecent();
    // Update local recentSet to reflect deletion
    recentSet = new Set(state.recent);
  }

  // 状態分けしてシャッフル
  // A: 未再生かつ直近でない曲
  const poolA = arr.filter((s) => !state.played.has(s.youtube_id) && !recentSet.has(s.youtube_id));
  // B: 直近再生された曲
  const poolB = arr.filter((s) => recentSet.has(s.youtube_id));
  // C: すでに再生済みで、かつ直近でない曲
  const poolC = arr.filter((s) => state.played.has(s.youtube_id) && !recentSet.has(s.youtube_id));

  shuffle(poolA);
  shuffle(poolB);
  shuffle(poolC);

  arr.length = 0;
  // 並び順：[未再生かつ直近でない] -> [再生済みかつ直近でない] -> [直近再生曲（最後方）]
  arr.push(...poolA, ...poolC, ...poolB);
}

export function songTime(s) {
  const t = s.publish_at || s.created_at;
  const n = t ? Date.parse(t) : NaN;
  return Number.isNaN(n) ? 0 : n;
}

export function injectPromoSongs(arr) {
  const promos = arr.filter((s) => s.promo === true);
  if (!promos.length) return;

  const normals = arr.filter((s) => s.promo !== true);
  shuffle(promos);

  const result = [];
  let promoIdx = 0;
  let normalIdx = 0;

  // 1曲目は必ずプロモーション曲（あれば）
  if (promoIdx < promos.length) {
    result.push(promos[promoIdx++]);
  }

  // 2曲目以降、5曲おきにプロモーション曲を挿入
  let countSinceLastPromo = 0;
  while (normalIdx < normals.length || promoIdx < promos.length) {
    if (promoIdx < promos.length && countSinceLastPromo >= 4) {
      result.push(promos[promoIdx++]);
      countSinceLastPromo = 0;
    } else if (normalIdx < normals.length) {
      result.push(normals[normalIdx++]);
      countSinceLastPromo++;
    } else {
      result.push(promos[promoIdx++]);
    }
  }

  arr.length = 0;
  arr.push(...result);
}

export function applyOrder(arr) {
  if (state.order === 'newest') arr.sort((a, b) => songTime(b) - songTime(a));
  else deckShuffle(arr);
  injectPromoSongs(arr);
}
