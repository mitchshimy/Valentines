const PRECACHE = 'precache-v1';
const RUNTIME = 'runtime-v1';
const BG_CACHE = 'bgcache-v1';
const MUSIC_CACHE = 'music-v1';
let preferredMusicUrl = null;

// Simple IndexedDB helpers for storing small key/value pairs
function openIDB() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open('player-store', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

function idbGet(key) {
  return openIDB().then(db => new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('kv', 'readonly');
      const store = tx.objectStore('kv');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch (e) { resolve(undefined); }
  }));
}

function idbSet(key, value) {
  return openIDB().then(db => new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      const req = store.put(value, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) { resolve(false); }
  }));
}

function idbDelete(key) {
  return openIDB().then(db => new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) { resolve(false); }
  }));
}

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
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => {
      if (key !== PRECACHE && key !== RUNTIME && key !== BG_CACHE && key !== MUSIC_CACHE) {
        return caches.delete(key);
      }
      return Promise.resolve();
    }));

    // Load preferred music from IDB (if present) so SW can prefetch it
    try {
      const stored = await idbGet('preferredMusicUrl');
      if (stored) {
        preferredMusicUrl = stored;
        // fire-and-forget prefetch
        prefetchPreferredMusic(preferredMusicUrl);
      }
    } catch (e) {
      // ignore
    }
  })());
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Prioritize music files: try MUSIC_CACHE first, then network, then runtime cache
  if (url.pathname.startsWith('/assets/music/')) {
    event.respondWith(musicFirst(event.request));
    return;
  }

  // If the page requests a virtual 'current-music' path, return the preferred track if available
  if (url.pathname === '/current-music' && preferredMusicUrl) {
    event.respondWith((async () => {
      const cache = await caches.open(MUSIC_CACHE);
      const cached = await cache.match(preferredMusicUrl);
      if (cached) return cached;
      try {
        const resp = await fetch(preferredMusicUrl);
        if (resp && resp.status === 200) {
          try {
            try {
              const putUrl = new URL(preferredMusicUrl, self.location.origin);
              if ((putUrl.protocol === 'http:' || putUrl.protocol === 'https:') && putUrl.origin === self.location.origin) {
                await cache.put(preferredMusicUrl, resp.clone());
              }
            } catch (e) {
              // skip caching for unsupported/invalid URLs
            }
          } catch (e) {}
        }
        return resp;
      } catch (e) {
        return caches.match(preferredMusicUrl) || new Response('', { status: 503 });
      }
    })());
    return;
  }

  // Default: cache-first then network, cache runtime responses
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        // Don't cache opaque responses (cross-origin) into runtime
        try {
          const responseClone = response.clone();
          try {
            const reqUrl = new URL(event.request.url);
            if ((reqUrl.protocol === 'http:' || reqUrl.protocol === 'https:') && reqUrl.origin === self.location.origin) {
              caches.open(RUNTIME).then(cache => cache.put(event.request, responseClone));
            }
          } catch (e) {
            // skip caching for unsupported schemes (e.g., chrome-extension://)
          }
        } catch (e) {
          // ignore
        }
        return response;
      }).catch(() => cached);
    })
  );
});

async function musicFirst(request) {
  try {
    // Try any cache (precache, bg, music, runtime)
    const cached = await caches.match(request);
    if (cached) return cached;
    // Otherwise fetch from network and store into MUSIC_CACHE for priority
    const response = await fetch(request);
    if (response && response.status === 200) {
      try {
        const musicCache = await caches.open(MUSIC_CACHE);
        try {
          const reqUrl = new URL(request.url);
          if ((reqUrl.protocol === 'http:' || reqUrl.protocol === 'https:') && reqUrl.origin === self.location.origin) {
            await musicCache.put(request, response.clone());
          }
        } catch (e) {
          // skip caching if request URL is not acceptable
        }
      } catch (e) { /* ignore */ }
    }
    return response;
  } catch (e) {
    // On error, fall back to runtime or precache
    const fallback = await caches.match(request);
    return fallback || new Response('', { status: 503, statusText: 'Service Unavailable' });
  }
}

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'cache-rest') {
    cacheRestAssets();
    return;
  }

  // Allow clients to tell the SW which music file should be prioritized
  if (event.data.type === 'set-preferred-music' && event.data.url) {
    preferredMusicUrl = event.data.url;
    // prefetch and cache it into MUSIC_CACHE for immediate availability
    // persist to IndexedDB so setting survives SW restarts
    try { idbSet('preferredMusicUrl', preferredMusicUrl); } catch (e) {}
    prefetchPreferredMusic(preferredMusicUrl);
    return;
  }

  if (event.data.type === 'clear-preferred-music') {
    preferredMusicUrl = null;
    try { idbDelete('preferredMusicUrl'); } catch (e) {}
    return;
  }
});

async function prefetchPreferredMusic(url) {
  try {
    const cache = await caches.open(MUSIC_CACHE);
    // Already cached?
    const existing = await cache.match(url);
    if (existing) return;
    const resp = await fetch(url);
    if (resp && resp.status === 200) {
      try {
        try {
          const putUrl = new URL(url, self.location.origin);
          if ((putUrl.protocol === 'http:' || putUrl.protocol === 'https:') && putUrl.origin === self.location.origin) {
            await cache.put(url, resp.clone());
          }
        } catch (e) {
          // skip caching for unsupported/invalid URLs
        }
      } catch (e) { }
    }
  } catch (e) {
    // ignore failures
  }
}

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
    'assets/images/landscape.jpg',
    'assets/images/background-dark.mp4',

    // music (exclude already precached first track)
    'assets/music/noonelikeyou.mp3',
    'assets/music/itsyou.mp3',
    'assets/music/happyyouremine.mp3',
    'assets/music/feelmylove.mp3',
    'assets/music/littlethings.mp3',
    'assets/music/feelthelove.mp3',
    'assets/music/residuals.mp3',
    'assets/music/najuta.mp3'
  ];

  try {
    const bgCache = await caches.open(BG_CACHE);
    const musicCache = await caches.open(MUSIC_CACHE);
    for (const asset of assets) {
      try {
        // Slight stagger to avoid network burst
        await new Promise(r => setTimeout(r, 150));
        if (asset.startsWith('assets/music/')) {
          // store music into MUSIC_CACHE (priority)
          try { await musicCache.add(asset); } catch (e) { /* ignore individual music failures */ }
        } else {
          try { await bgCache.add(asset); } catch (e) { /* ignore individual failures */ }
        }
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
