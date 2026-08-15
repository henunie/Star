/* sw.js — Service Worker（离线缓存） */
const CACHE_VERSION = 'leer-star-v11';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/store.js',
  './js/utils.js',
  './js/app.js',
  './js/components/checkin.js',
  './js/components/tasks.js',
  './js/components/shop.js',
  './js/components/profile.js',
  './vendor/vue.global.prod.js',
  './assets/icon.svg'
];

// 安装：预缓存 App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // 用 addAll 但忽略单个失败，保证安装成功
      return Promise.all(
        ASSETS.map((url) =>
          cache.add(url).catch((e) => console.warn('缓存失败:', url, e))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// 请求拦截：缓存优先，失败回退网络，网络成功则更新缓存
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // 仅处理同源请求
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // 后台更新缓存（stale-while-revalidate）
        fetch(event.request).then((resp) => {
          if (resp && resp.status === 200) {
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(event.request, resp.clone());
            });
          }
        }).catch(() => {});
        return cached;
      }
      // 无缓存：网络请求
      return fetch(event.request).then((resp) => {
        if (!resp || resp.status !== 200 || resp.type !== 'basic') return resp;
        const clone = resp.clone();
        caches.open(CACHE_VERSION).then((cache) => {
          cache.put(event.request, clone);
        });
        return resp;
      }).catch(() => {
        // 离线回退到首页
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
