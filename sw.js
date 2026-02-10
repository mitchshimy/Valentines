const PRECACHE = 'precache-v1';
const RUNTIME = 'runtime-v1';
const BG_CACHE = 'bgcache-v1';
const MUSIC_CACHE = 'music-v1';
let preferredMusicUrl = null;
// Background caching job control (so we can cancel/restart when user changes selection)
let bgCacheJobId = 0;
let bgCacheAbortController = null;
let lastBgAssets = null;

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
    // Respect user decision: stop any background caching to free bandwidth,
    // cache the selected track immediately, then (best-effort) resume using lastBgAssets.
    try { if (bgCacheAbortController) bgCacheAbortController.abort(); } catch (e) {}
    prefetchPreferredMusic(preferredMusicUrl);
    if (lastBgAssets && Array.isArray(lastBgAssets) && lastBgAssets.length) {
      // Restart pipeline with same assets; caches will short-circuit already cached items.
      cacheRestAssets(lastBgAssets);
    }
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
async function cacheWithRetry(cache, url, maxRetries = 2, signal = undefined) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (signal && signal.aborted) return false;
      // Check if already cached
      const existing = await cache.match(url);
      if (existing) return true;
      
      // Try to fetch and cache
      const response = await fetch(url, signal ? { signal } : undefined);
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
      // If aborted, stop immediately
      if (signal && signal.aborted) return false;
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
// PRIORITY: Images first (smaller, faster), then music in provided order
async function cacheRestAssets(assets) {
  // Validate input - player must provide asset list
  if (!Array.isArray(assets) || assets.length === 0) {
    notifyClients({ level: 'warn', msg: 'cacheRestAssets called without asset list' });
    return;
  }

  try {
    // Record the last requested assets so we can resume after user selection changes
    lastBgAssets = assets.slice();

    // Cancel any in-progress background caching so new request becomes source of truth
    bgCacheJobId += 1;
    const jobId = bgCacheJobId;
    try { if (bgCacheAbortController) bgCacheAbortController.abort(); } catch (e) {}
    bgCacheAbortController = new AbortController();
    const signal = bgCacheAbortController.signal;

    const bgCache = await caches.open(BG_CACHE);
    const musicCache = await caches.open(MUSIC_CACHE);
    
    // Separate images and music - images are smaller and should be cached first
    const imageAssets = assets.filter(a => !a.startsWith('assets/music/'));
    const musicAssets = assets.filter(a => a.startsWith('assets/music/'));

    // Prefetch "first song" immediately (in parallel with image caching).
    // Definition of first song:
    // - preferredMusicUrl if set by client (last playing / user choice)
    // - else the first music asset in the provided order
    const firstSongCandidates = [];
    if (preferredMusicUrl) {
      try {
        const u = new URL(preferredMusicUrl, self.location.origin);
        firstSongCandidates.push(u.pathname.replace(/^[\/]/, ''));
      } catch (e) {
        firstSongCandidates.push(preferredMusicUrl);
      }
    }
    if (musicAssets[0]) firstSongCandidates.push(musicAssets[0]);
    const firstSong = Array.from(new Set(firstSongCandidates)).find(Boolean);

    const firstSongPrefetchPromise = (async () => {
      if (!firstSong) return;
      try {
        // Only proceed if this job is still current
        if (jobId !== bgCacheJobId || (signal && signal.aborted)) return;
        const cached = await cacheWithRetry(musicCache, firstSong, 2, signal);
        if (cached) {
          notifyClients({ level: 'info', msg: 'Prefetched first song (parallel)', url: firstSong });
        }
      } catch (e) {
        // ignore
      }
    })();
    
    // STEP 1: Cache images first (smaller files, faster to complete)
    // Use higher concurrency for images since they're smaller
    const imageConcurrency = 4;
    let imageIdx = 0;
    async function imageWorker() {
      while (imageIdx < imageAssets.length) {
        if (jobId !== bgCacheJobId || (signal && signal.aborted)) return;
        const i = imageIdx++;
        const img = imageAssets[i];
        try {
          await cacheWithRetry(bgCache, img, 1, signal); // Single retry for images
          notifyClients({ level: 'info', msg: 'Cached image', url: img });
        } catch (e) {
          // ignore individual failures
        }
      }
    }
    // Cache images in parallel with higher concurrency
    await Promise.all(new Array(Math.min(imageConcurrency, imageAssets.length)).fill(0).map(() => imageWorker()));

    // If job changed while caching images, stop.
    if (jobId !== bgCacheJobId || (signal && signal.aborted)) return;
    
    // STEP 2: Cache music in the order provided (saved playlist order or default)
    // Requirement: after images are done, cache the FIRST 4 tracks immediately, then the rest.
    if (musicAssets.length > 0) {
      const firstFour = musicAssets.slice(0, 4);
      const rest = musicAssets.slice(4);

      // Cache first four with modest concurrency (avoid overwhelming slow networks)
      const firstFourConcurrency = 2;
      let firstIdx = 0;
      async function firstFourWorker() {
        while (firstIdx < firstFour.length) {
          if (jobId !== bgCacheJobId || (signal && signal.aborted)) return;
          const i = firstIdx++;
          const m = firstFour[i];
          try {
            const cached = await cacheWithRetry(musicCache, m, 2, signal);
            if (cached) {
              notifyClients({ level: 'info', msg: 'Cached priority track (top-4)', url: m });
            }
          } catch (e) {}
        }
      }
      await Promise.all(new Array(Math.min(firstFourConcurrency, firstFour.length)).fill(0).map(() => firstFourWorker()));

      if (jobId !== bgCacheJobId || (signal && signal.aborted)) return;

      // Then cache the rest
      const restConcurrency = 2;
      let restIdx = 0;
      async function restWorker() {
        while (restIdx < rest.length) {
          if (jobId !== bgCacheJobId || (signal && signal.aborted)) return;
          const i = restIdx++;
          const m = rest[i];
          try {
            const cached = await cacheWithRetry(musicCache, m, 2, signal);
            if (cached) {
              notifyClients({ level: 'info', msg: 'Cached music', url: m });
            }
          } catch (e) {}
        }
      }
      await Promise.all(new Array(Math.min(restConcurrency, rest.length)).fill(0).map(() => restWorker()));
    }

    // Best-effort: wait for the parallel first-song prefetch to settle
    try { await firstSongPrefetchPromise; } catch (e) {}

    // Notify clients that background caching is complete
    const allClients = await self.clients.matchAll();
    allClients.forEach(c => c.postMessage({ type: 'bg-cache-complete' }));
  } catch (e) {
    // swallow errors
  }
}