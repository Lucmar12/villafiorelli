/* ============================================================
   Domus Fiorelli — Service Worker
   PWA offline caching + future push notification ready
   ============================================================ */

const CACHE_VERSION = 'df-v1';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

/* ── Assets to pre-cache on install ─────────────────────── */
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/logo.png',
  '/alessandro.jpg',
  '/marshall.jpg',
  /* Google Fonts — cached on first fetch via dynamic cache */
];

/* ── Install: pre-cache static shell ────────────────────── */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_ASSETS))
  );
});

/* ── Activate: remove old caches ────────────────────────── */
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

/* ── Fetch: cache-first for static, network-first for API ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Skip non-GET and cross-origin requests (except fonts) */
  if (request.method !== 'GET') return;

  /* Google Fonts: cache-first */
  if (url.origin === 'https://fonts.googleapis.com' ||
      url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
    return;
  }

  /* Same origin: cache-first with network fallback */
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  /* External (Maps links, Spotify embeds etc.): network-first */
  event.respondWith(networkFirst(request));
});

/* ── Strategies ─────────────────────────────────────────── */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    /* Offline fallback — return cached index for navigation */
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
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
    // Notification types for future use:
    // tag: 'checkin-reminder' | 'welcome' | 'checkout-reminder' | 'review-reminder'
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
