const CACHE_NAME = 'slaps-v2.9';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=2.9',
  './script.js?v=2.9',
  './i18n.js?v=2.9',
  './src/state.js?v=2.9',
  './src/db.js?v=2.9',
  './src/player.js?v=2.9',
  './src/ui.js?v=2.9',
  './manifest.json',
  './data/songs.json',
  './assets/logo.png',
  './assets/apple-touch-icon.png',
  './assets/favicon-32x32.png',
  './assets/favicon.svg'
];

// インストール時に静的アセットをキャッシュ
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// フェッチ制御
self.addEventListener('fetch', (e) => {
  // GET以外のリクエストはキャッシュしない (POSTのAPI送信など)
  if (e.request.method !== 'GET') {
    return;
  }

  // YouTube API 等の外部リクエストはキャッシュしない
  if (!e.request.url.startsWith(self.location.origin)) {
    return;
  }

  const url = new URL(e.request.url);

  // /api/ へのリクエストはキャッシュせずパススルー
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 動的アセット（songs.json, config.js）は Network First（即時反映）
  if (url.pathname.includes('/data/songs.json') || url.pathname.includes('/config.js')) {
    e.respondWith(
      fetch(e.request).then((networkResponse) => {
        if (networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, clone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // オフラインフォールバック: キャッシュがあれば返す
        return caches.match(e.request);
      })
    );
    return;
  }

  // 静的アセットはキャッシュ優先（Stale-While-Revalidate）
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(e.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, networkResponse.clone());
            });
          }
        }).catch(() => { /* ignore offline fetch errors */ });
        
        return cachedResponse;
      }
      return fetch(e.request);
    })
  );
});
