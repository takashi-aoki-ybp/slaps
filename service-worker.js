const CACHE_NAME = 'slaps-v3.49';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=3.49',
  './script.js?v=3.49',
  './i18n.js?v=3.49',
  './src/state.js?v=3.49',
  './src/db.js?v=3.49',
  './src/player.js?v=3.49',
  './src/ui.js?v=3.49',
  './src/analytics.js?v=3.49',
  './src/sharing.js?v=3.49',
  './src/daily.js?v=3.49',
  './src/presence.js?v=3.49',
  './src/tv-navigation.js?v=3.49',
  './manifest.json',
  './data/songs.json',
  './assets/logo.png',
  './assets/apple-touch-icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/favicon-32x32.png',
  './assets/favicon.svg',
  './assets/se_1.mp3'
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

  // コアアセット（HTML, JS, CSS, JSONデータ）は Network First (即時反映・オフライン対応)
  const isCoreAsset = 
    url.pathname === '/' || 
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.includes('/data/songs.json') ||
    url.pathname.includes('/config.js');

  if (isCoreAsset) {
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

  // その他画像などの静的アセットはキャッシュ優先（Stale-While-Revalidate）
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
