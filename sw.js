// オフラインでも開けるようにする。常にネットの最新を優先し、つながらない時だけ保存済みの控えを使う。
const CACHE = 'kmg-v10';
const CORE = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/app/main.js', './js/app/data.js', './js/app/exercises.js', './js/app/store.js', './js/app/logo.js', './js/app/cloud.js', './js/app/config.js',
  './js/art/character.js', './js/art/hair.js', './js/art/palette.js', './js/art/raster.js',
  './assets/gym-bg.webp', './assets/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  // フォントと Supabase のライブラリ（cdn.jsdelivr.net）は控えを持つ。Supabase の通信そのものは控えない
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'cdn.jsdelivr.net';
  if (!sameOrigin && !font) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
