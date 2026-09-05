export const REGION_LABELS = {
  us: '🇺🇸 US', jp: '🇯🇵 JP', uk: '🇬🇧 UK', fr: '🇫🇷 FR', kr: '🇰🇷 KR', other: '🌍', all: '🌐 ALL',
};

const loadVolume = () => {
  try {
    const v = localStorage.getItem('slaps_volume');
    const parsed = Number.parseInt(v, 10);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 100;
  } catch {
    return 100;
  }
};

const loadCrateIds = () => {
  try {
    const raw = new URLSearchParams(window.location.search).get('crate') || '';
    return [...new Set(raw.split('.').filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id)))].slice(0, 50);
  } catch {
    return [];
  }
};

const initialCrateIds = loadCrateIds();
const initialDailyDate = (() => {
  try {
    const value = new URLSearchParams(window.location.search).get('daily') || '';
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  } catch { return ''; }
})();

export const state = {
  all: [],
  balance: 2.5,       // CONSCIOUS(0) ↔ TURNT(5)
  region: 'all',       // 地域フィルター
  era: 'all',          // 年代フィルター
  order: 'shuffle',
  favMode: false,
  crateMode: initialCrateIds.length > 0,
  crateIds: initialCrateIds,
  dailyMode: false,
  dailyDate: initialDailyDate,
  dailyIds: [],
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
  volume: loadVolume(),   // 曲自体の音量（0 - 100）
  preMuteVolume: loadVolume() || 100, // ミュート解除時の復帰用音量
  comments: [],           // コメントデータ
  commentMode: 0,         // 字幕・文字起こし風の自動表示は常にOFF
  triggeredComments: new Set(), // すでにトリガーしたコメントID
  isPromo: false,         // プロモーション動画制作モード
  promoFinished: false,   // プロモ動画終了フラグ
  recommendations: [],    // 未登録曲の推薦候補
  fromDig: false,         // DIG（自動推薦）経由での追加フラグ
  digArtwork: null,       // DIG経由で追加される曲のアルバムアートURL
  digVideoId: null,       // DIG経由で取得されたYouTubeの動画ID
};

export const CT = (s) => (s.conscious_turnt == null ? 2.5 : Number(s.conscious_turnt));

export function current() {
  return state.queue[state.index];
}

export function getFilteredPool() {
  let pool = state.all.filter((s) => !state.broken.has(s.youtube_id));
  if (state.crateMode) {
    const byId = new Map(pool.map((song) => [song.youtube_id, song]));
    return state.crateIds.map((id) => byId.get(id)).filter(Boolean);
  }
  if (state.dailyMode) {
    const byId = new Map(pool.map((song) => [song.youtube_id, song]));
    return state.dailyIds.map((id) => byId.get(id)).filter(Boolean);
  }
  if (state.region !== 'all') {
    pool = pool.filter((s) => s.region === state.region);
  }
  if (state.era !== 'all') {
    pool = pool.filter((s) => s.era === state.era);
  }
  return pool;
}

export function playableCount() {
  if (state.favMode) return state.queue.filter(s => !state.broken.has(s.youtube_id)).length;
  return getFilteredPool().length;
}

export function eligibleByBalance(p) {
  const live = getFilteredPool();
  if (state.crateMode || state.dailyMode) return live;
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

// Every eligible track has equal priority. Only prevent an immediate repeat
// when explicitly reshuffling or moving into a new cycle.
export function shuffleQueue(arr, avoidId) {
  shuffle(arr);
  if (arr.length > 1 && avoidId && arr[0].youtube_id === avoidId) {
    const j = 1 + Math.floor(Math.random() * (arr.length - 1));
    [arr[0], arr[j]] = [arr[j], arr[0]];
  }
}

export function songTime(s) {
  const t = s.created_at || s.publish_at;
  const n = t ? Date.parse(t) : NaN;
  return Number.isNaN(n) ? 0 : n;
}

// Retain only the latest cycle boundary so PREV / NEXT across it are reversible.
// This is in-memory navigation state, never an input to track weighting.
let shuffleBoundary = null;
let backwardWrapQueue = null;

export function applyOrder(arr, avoidId) {
  shuffleBoundary = null;
  backwardWrapQueue = null;
  if (state.crateMode || state.dailyMode) return;
  if (state.order === 'newest') arr.sort((a, b) => songTime(b) - songTime(a));
  else shuffleQueue(arr, avoidId);
}

export function advanceQueue(dir) {
  const n = state.queue.length;
  if (!n) return;
  const randomMode = state.order === 'shuffle' && !state.crateMode && !state.dailyMode;
  if (randomMode && dir > 0 && state.index === n - 1 && n > 1) {
    if (backwardWrapQueue === state.queue) {
      // PREV from the initial track wraps backwards; NEXT should undo it,
      // not mistake it for completing a listening cycle.
      backwardWrapQueue = null;
    } else if (shuffleBoundary?.before === state.queue) {
      state.queue = shuffleBoundary.after;
    } else {
      const before = state.queue;
      const after = before.slice();
      shuffleQueue(after, current()?.youtube_id);
      shuffleBoundary = { before, after };
      state.queue = after;
    }
    state.index = 0;
  } else if (randomMode && dir < 0 && state.index === 0 && shuffleBoundary?.after === state.queue) {
    state.queue = shuffleBoundary.before;
    state.index = state.queue.length - 1;
  } else {
    if (randomMode && dir < 0 && state.index === 0) backwardWrapQueue = state.queue;
    state.index = (state.index + dir + n) % n;
  }
}
