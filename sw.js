const PRECACHE = 'precache-v1';
const RUNTIME = 'runtime-v1';
const BG_CACHE = 'bgcache-v1';

const PRECACHE_URLS = [
  '/',
  'index.html',
  'player.html',
  'styles.css',
  'letter-styles.css',
  'letter.js',
  'player.js',
  // Critical assets - load really first
  'assets/images/background.png',
  'assets/images/landscape.jpg',
  'assets/music/chikwere.mp3',
  'assets/images/4.jpg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PRECACHE).then(cache => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== PRECACHE && key !== RUNTIME && key !== BG_CACHE) {
          return caches.delete(key);
        }
        return Promise.resolve();
      })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // Try cache first, then network, and cache runtime responses
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Only cache same-origin GET requests
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const responseClone = response.clone();
        caches.open(RUNTIME).then(cache => cache.put(event.request, responseClone));
        return response;
      }).catch(() => cached);
    })
  );
});

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'cache-rest') {
    cacheRestAssets();
  }
});

async function cacheRestAssets() {
  const assets = [
    // images (exclude already precached background files)
    'assets/images/1.jpg',
    'assets/images/2.jpg',
    'assets/images/3.jpg',
    'assets/images/4.jpg',
    'assets/images/5.jpg',
    'assets/images/6.jpg',
    'assets/images/7.jpg',
    'assets/images/8.jpg',
    'assets/images/9.jpg',
    'assets/images/16400503_v722-aum-36b.jpg',
    'assets/images/2151930103.jpg',
    'assets/images/kakashi.jpeg',
    'assets/images/landscape.jpg',
    'assets/images/landscape1.jpg',
    'assets/images/background-dark.mp4',

    // music (exclude already precached first track)
    'assets/music/noonelikeyou.mp3',
    'assets/music/itsyou.mp3',
    'assets/music/happyyouremine.mp3',
    'assets/music/withyou.mp3',
    'assets/music/feelmylove.mp3',
    'assets/music/littlethings.mp3',
    'assets/music/feelthelove.mp3',
    'assets/music/residuals.mp3'
  ];

  try {
    const cache = await caches.open(BG_CACHE);
    for (const asset of assets) {
      try {
        // Slight stagger to avoid network burst
        await new Promise(r => setTimeout(r, 150));
        await cache.add(asset);
      } catch (e) {
        // ignore individual failures
      }
    }

    // Notify clients that background caching is complete
    const allClients = await self.clients.matchAll();
    allClients.forEach(c => c.postMessage({ type: 'bg-cache-complete' }));
  } catch (e) {
    // swallow errors
  }
}
