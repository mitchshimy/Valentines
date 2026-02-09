const PRECACHE = 'precache-v1';
const RUNTIME = 'runtime-v1';
const BG_CACHE = 'bgcache-v1';
const MUSIC_CACHE = 'music-v1';
let preferredMusicUrl = null;

// Debug flag — set to false to silence runtime messages
const SW_DEBUG = false;

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
    // Try any cache (precache, bg, music, runtime) first
    const cached = await caches.match(request);
    if (cached) return cached;
    
    // If not cached, fetch from network - this ensures playback never fails
    // even if caching fails, the network response is returned
    try {
      const response = await fetch(request);
      
      // Always return the network response for playback, even if caching fails
      // This ensures graceful fallback when cache is unavailable
      if (response && (response.status === 200 || response.status === 206)) {
        // Try to cache in background (fire-and-forget) - don't block playback
        (async () => {
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
          } catch (e) {
            // Caching failed, but that's OK - we still return the network response
          }
        })();
      }
      
      // Return network response regardless of caching success
      return response;
    } catch (networkError) {
      // Network fetch failed - try to return any cached version as fallback
      const fallback = await caches.match(request);
      if (fallback) return fallback;
      
      // Last resort: return error response (but this should rarely happen)
      return new Response('', { status: 503, statusText: 'Service Unavailable' });
    }
  } catch (e) {
    // Final fallback: try any cache
    const fallback = await caches.match(request);
    return fallback || new Response('', { status: 503, statusText: 'Service Unavailable' });
  }
}

self.addEventListener('message', event => {
  if (!event.data) return;
  
  // Cache assets - player sends the list of assets to cache
  // Run immediately and don't block - critical for mobile
  if (event.data.type === 'cache-rest' && Array.isArray(event.data.assets)) {
    cacheRestAssets(event.data.assets);
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
    // Use retry logic for reliability (especially important on mobile)
    await cacheWithRetry(cache, url, 2);
  } catch (e) {
    // ignore failures
  }
}

// Retry helper for cache operations (important for mobile reliability)
async function cacheWithRetry(cache, url, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Check if already cached
      const existing = await cache.match(url);
      if (existing) return true;
      
      // Try to fetch and cache
      const response = await fetch(url);
      if (response && (response.status === 200 || response.status === 206)) {
        try {
          const reqUrl = new URL(url, self.location.origin);
          if ((reqUrl.protocol === 'http:' || reqUrl.protocol === 'https:') && reqUrl.origin === self.location.origin) {
            await cache.put(url, response);
            return true;
          }
        } catch (e) {
          // URL validation failed, skip
        }
      }
      // If we got here, the response wasn't cacheable, but don't retry
      return false;
    } catch (e) {
      // On last attempt, give up
      if (attempt === maxRetries) {
        notifyClients({ level: 'warn', msg: 'Cache retry exhausted', url, attempts: attempt + 1 });
        return false;
      }
      // Wait before retry (exponential backoff)
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return false;
}

// Cache assets provided by the player - SW doesn't know what assets exist
async function cacheRestAssets(assets) {
  // Validate input - player must provide asset list
  if (!Array.isArray(assets) || assets.length === 0) {
    notifyClients({ level: 'warn', msg: 'cacheRestAssets called without asset list' });
    return;
  }

  // Run caching in background - don't block, especially important on mobile
  (async () => {
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

      // Prefetch priority music without stagger (in parallel) with retry
      // Do this immediately and don't wait - music is critical
      Promise.all(dedupPriority.map(async m => {
        const cached = await cacheWithRetry(musicCache, m, 2);
        if (cached) {
          notifyClients({ level: 'info', msg: 'Prefetched priority music', url: m });
        }
      })).catch(() => {}); // Don't block on priority music

      // For the remaining music assets, use higher concurrency to cache faster
      // Music files are critical - cache them aggressively even on mobile
      const remainingMusic = musicAssets.filter(a => !dedupPriority.includes(a));
      // Use higher concurrency (5) to cache music faster - music files are the priority
      const concurrency = 5;
      let idx = 0;
      async function worker() {
        while (idx < remainingMusic.length) {
          const i = idx++;
          const m = remainingMusic[i];
          const cached = await cacheWithRetry(musicCache, m, 2);
          if (cached) {
            notifyClients({ level: 'info', msg: 'Cached music', url: m });
          }
        }
      }
      // Don't await - let it run in background
      Promise.all(new Array(Math.min(concurrency, remainingMusic.length)).fill(0).map(() => worker())).catch(() => {});

      // Then continue with background caching (staggered) for non-music assets
      // Also non-blocking
      (async () => {
        for (const asset of assets) {
          if (asset.startsWith('assets/music/')) continue; // already handled
          try {
            // Slight stagger to avoid network burst for images/videos
            await new Promise(r => setTimeout(r, 100));
            await cacheWithRetry(bgCache, asset, 1); // Single retry for images
          } catch (e) {
            // ignore individual failures
          }
        }

        // Notify clients that background caching is complete
        try {
          const allClients = await self.clients.matchAll();
          allClients.forEach(c => c.postMessage({ type: 'bg-cache-complete' }));
        } catch (e) {}
      })().catch(() => {});
    } catch (e) {
      // swallow errors
    }
  })().catch(() => {});
}