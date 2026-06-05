const CACHE_NAME = 'slaps-v1.1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './i18n.js',
  './config.js',
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

// キャッシュ優先（アセット）またはネットワークフェッチ
self.addEventListener('fetch', (e) => {
  // YouTube API 等の外部リクエストはキャッシュしない
  if (!e.request.url.startsWith(self.location.origin)) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // バックグラウンドでアセットを更新する stale-while-revalidate 的な動き
        fetch(e.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, networkResponse);
            });
          }
        }).catch(() => { /* ignore offline fetch errors */ });
        
        return cachedResponse;
      }
      return fetch(e.request);
    })
  );
});
