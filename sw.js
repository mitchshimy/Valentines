const PRECACHE = 'precache-v1';
const RUNTIME = 'runtime-v1';
const BG_CACHE = 'bgcache-v1';
const MUSIC_CACHE = 'music-v1';
let preferredMusicUrl = null;

// Debug flag — set to false to silence runtime messages
const SW_DEBUG = true;

async function notifyClients(payload) {
  if (!SW_DEBUG) return;
  try {
    const all = await self.clients.matchAll();
    for (const c of all) {
      try { c.postMessage(Object.assign({ type: 'sw-debug' }, payload)); } catch (e) {}
    }
  } catch (e) {}
}

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
  'assets/images/landscape.jpg'

];

self.addEventListener('install', event => {
  self.skipWaiting();
  // Add precache items individually so a single failing large asset doesn't block install
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    await Promise.all(PRECACHE_URLS.map(async url => {
      try {
        await cache.add(url);
      } catch (e) {
        // ignore individual failures (network issues, large files)
      }
    }));
  })());
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
        if (resp && (resp.status === 200 || resp.status === 206)) {
          try {
            try {
              const putUrl = new URL(preferredMusicUrl, self.location.origin);
              if ((putUrl.protocol === 'http:' || putUrl.protocol === 'https:') && putUrl.origin === self.location.origin) {
                  await cache.put(preferredMusicUrl, resp.clone());
                } else {
                  notifyClients({ level: 'warn', msg: 'Skipped caching preferredMusic (origin/scheme)', url: preferredMusicUrl });
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
            } else {
              notifyClients({ level: 'info', msg: 'Skipped runtime caching (non-same-origin or unsupported scheme)', url: event.request.url });
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
    if (response && (response.status === 200 || response.status === 206)) {
      try {
        const musicCache = await caches.open(MUSIC_CACHE);
        try {
          const reqUrl = new URL(request.url);
          if ((reqUrl.protocol === 'http:' || reqUrl.protocol === 'https:') && reqUrl.origin === self.location.origin) {
            await musicCache.put(request, response.clone());
          } else {
            notifyClients({ level: 'warn', msg: 'Skipped MUSIC_CACHE.put (non-same-origin or unsupported scheme)', url: request.url });
          }
        } catch (e) {
          // skip caching if request URL is not acceptable
        }
      } catch (e) { /* ignore */ }
    } else {
      notifyClients({ level: 'warn', msg: 'Fetch returned non-cacheable status for musicFirst', url: request.url, status: response && response.status });
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
    if (resp && (resp.status === 200 || resp.status === 206)) {
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
    else {
      notifyClients({ level: 'warn', msg: 'Prefetch returned non-cacheable status', url });
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
    'assets/images/background.png',

    // music (exclude already precached first track)
    'assets/music/chikwere.mp3',
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
    // Immediately prefetch preferred music and a small priority music set
    const musicAssets = assets.filter(a => a.startsWith('assets/music/'));
    const priority = [];
    if (preferredMusicUrl) {
      // normalize stored URL to relative path if possible
      try {
        const u = new URL(preferredMusicUrl, self.location.origin);
        priority.push(u.pathname.replace(/^[\/]/, ''));
      } catch (e) {
        if (preferredMusicUrl) priority.push(preferredMusicUrl);
      }
    }
    for (let i = 0; i < Math.min(2, musicAssets.length); i++) priority.push(musicAssets[i]);

    const dedupPriority = Array.from(new Set(priority)).filter(Boolean);

    // Prefetch priority music without stagger (in parallel)
    await Promise.all(dedupPriority.map(async m => {
      try {
        await musicCache.add(m);
        notifyClients({ level: 'info', msg: 'Prefetched priority music', url: m });
      } catch (e) {
        notifyClients({ level: 'warn', msg: 'Priority music prefetch failed', url: m });
      }
    }));

    // For the remaining music assets, run a small concurrency pool so music caching proceeds faster
    const remainingMusic = musicAssets.filter(a => !dedupPriority.includes(a));
    const concurrency = 3; // number of parallel music fetches
    let idx = 0;
    async function worker() {
      while (idx < remainingMusic.length) {
        const i = idx++;
        const m = remainingMusic[i];
        try {
          await musicCache.add(m);
          notifyClients({ level: 'info', msg: 'Cached music', url: m });
        } catch (e) {
          notifyClients({ level: 'warn', msg: 'Music cache failed', url: m });
        }
      }
    }
    await Promise.all(new Array(Math.min(concurrency, remainingMusic.length)).fill(0).map(() => worker()));

    // Then continue with background caching (staggered) for non-music assets
    for (const asset of assets) {
      if (asset.startsWith('assets/music/')) continue; // already handled
      try {
        // Slight stagger to avoid network burst for images/videos
        await new Promise(r => setTimeout(r, 150));
        try { await bgCache.add(asset); } catch (e) { /* ignore individual failures */ }
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
