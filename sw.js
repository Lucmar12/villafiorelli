/* ============================================================
   Domus Fiorelli — Service Worker v2
   Strategy: network-first for HTML (always fresh),
             cache-first for static assets (fast).
   ============================================================ */

const CACHE_VERSION = 'df-v2';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

/* ── Assets to pre-cache on install (images/icons only) ─── */
const PRECACHE_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/logo.png',
  '/alessandro.jpg',
  '/marshall.jpg',
  '/wifi-domusfiorelli.jpg',
];

/* ── Install: pre-cache static assets ───────────────────── */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_ASSETS))
  );
});

/* ── Activate: remove ALL old df-* caches ───────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('df-') && k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch ───────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  /* Google Fonts: cache-first (rarely change) */
  if (url.origin === 'https://fonts.googleapis.com' ||
      url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
    return;
  }

  /* Same origin: HTML → network-first; assets → cache-first */
  if (url.origin === self.location.origin) {
    const isHTML = request.mode === 'navigate' ||
                   request.destination === 'document' ||
                   url.pathname === '/' ||
                   url.pathname.endsWith('.html');

    if (isHTML) {
      event.respondWith(networkFirst(request, STATIC_CACHE));
    } else {
      event.respondWith(cacheFirst(request, STATIC_CACHE));
    }
    return;
  }

  /* External (Maps, WA links, etc.): network-only */
  event.respondWith(fetch(request).catch(() =>
    new Response('Offline', { status: 503 })
  ));
});

/* ── Strategies ─────────────────────────────────────────── */

/* Network-first: try network, update cache, fall back to cache offline */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match('/index.html');
    return new Response('Offline', { status: 503 });
  }
}

/* Cache-first: return cached immediately, refresh in background */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    /* Background refresh so next visit is up-to-date */
    fetch(request).then(response => {
      if (response.ok) {
        caches.open(cacheName).then(cache => cache.put(request, response));
      }
    }).catch(() => {});
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

/* ============================================================
   PUSH NOTIFICATION INFRASTRUCTURE (ready for Firebase/OneSignal)
   — not active yet, architecture in place for future activation
   ============================================================

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title   = data.title || 'Domus Fiorelli';
  const options = {
    body: data.body || 'Benvenuto a Domus Fiorelli.',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

============================================================ */
