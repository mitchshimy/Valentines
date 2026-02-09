const PRECACHE = 'precache-v1';
const RUNTIME = 'runtime-v1';
const BG_CACHE = 'bgcache-v1';
const MUSIC_CACHE = 'music-v1';

const SW_DEBUG = true;

async function notifyClients(payload) {
  if (!SW_DEBUG) return;
  try {
    const all = await self.clients.matchAll();
    for (const c of all) {
      try { c.postMessage(Object.assign({ type: 'sw-debug' }, payload)); } catch (_) {}
    }
  } catch (_) {}
}

// --- INSTALL / PRECACHE ---
const PRECACHE_URLS = [
  '/', 'index.html', 'player.html',
  'styles.css', 'letter-styles.css', 'letter.js', 'player.js',
  'assets/images/landscape.jpg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    await Promise.all(PRECACHE_URLS.map(async url => {
      try { await cache.add(url); } catch (_) {}
    }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => {
      if (![PRECACHE, RUNTIME, BG_CACHE, MUSIC_CACHE].includes(key)) {
        return caches.delete(key);
      }
      return Promise.resolve();
    }));
  })());
  self.clients.claim();
});

// --- FETCH ---
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // MUSIC: try cache first, then network, then runtime
  if (url.pathname.startsWith('/assets/music/')) {
    event.respondWith(musicFirst(event.request));
    return;
  }

  // DEFAULT: cache-first then network
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(resp => {
      if (!resp || resp.status !== 200) return resp;
      try {
        const reqUrl = new URL(event.request.url);
        if ((reqUrl.protocol === 'http:' || reqUrl.protocol === 'https:') && reqUrl.origin === self.location.origin) {
          caches.open(RUNTIME).then(cache => cache.put(event.request, resp.clone()));
        }
      } catch (_) {}
      return resp;
    }).catch(() => cached))
  );
});

// --- MUSIC CACHE LOGIC ---
// --- MUSIC CACHE LOGIC ---
async function musicFirst(request) {
  try {
    const musicCache = await caches.open(MUSIC_CACHE);
    const cached = await musicCache.match(request);
    if (cached) {
      if (SW_DEBUG) notifyClients({ level:'info', msg:'Serving music from cache', url:request.url });
      return cached; // immediate playback from cache
    }

    const response = await fetch(request);
    if (response && (response.status === 200 || response.status === 206)) {
      try {
        const reqUrl = new URL(request.url);
        if ((reqUrl.protocol === 'http:' || reqUrl.protocol === 'https:') && reqUrl.origin === self.location.origin) {
          await musicCache.put(request, response.clone());
          if (SW_DEBUG) notifyClients({ level:'info', msg:'Music cached', url:request.url });
        }
      } catch (_) {}
    }
    return response;
  } catch (_) {
    const fallback = await caches.match(request);
    return fallback || new Response('', { status: 503 });
  }
}

// --- MESSAGE HANDLER ---
self.addEventListener('message', event => {
  if (!event.data) return;

  switch(event.data.type) {
    case 'prefetch':
      cacheAssets(event.data.assets || []);
      break;
      
    case 'play-music': // NEW: optional, can prefetch next track based on user behavior
      if (event.data.url) {
        caches.open(MUSIC_CACHE).then(cache => {
          fetch(event.data.url)
            .then(resp => { if (resp.ok) cache.put(event.data.url, resp.clone()); })
            .catch(() => {});
        });
      }
      break;
  }
});


// --- PREFETCH PRIORITY ---
async function cacheAssets(assets) {
  if (!assets || !assets.length) return;

  // Separate music vs other assets
  const musicAssets = assets.filter(a => a.startsWith('assets/music/'));
  const otherAssets = assets.filter(a => !a.startsWith('assets/music/'));

  // Cache music first
  try {
    const musicCache = await caches.open(MUSIC_CACHE);
    await Promise.all(musicAssets.map(async m => {
      try { await musicCache.add(m); notifyClients({ level:'info', msg:'Music prefetched', url:m }); }
      catch (e) { notifyClients({ level:'warn', msg:'Music cache failed', url:m }); }
    }));
  } catch (_) {}

  // Cache other assets in background
  try {
    const bgCache = await caches.open(BG_CACHE);
    for (const asset of otherAssets) {
      try {
        await new Promise(r => setTimeout(r, 150)); // small stagger
        await bgCache.add(asset);
      } catch (_) {}
    }
    // Notify clients that background caching is complete
    const clients = await self.clients.matchAll();
    clients.forEach(c => c.postMessage({ type: 'bg-cache-complete' }));
  } catch (_) {}
}
