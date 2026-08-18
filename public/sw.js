const CACHE_VERSION = 'v2';
const STATIC_CACHE = `attendance-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `attendance-dynamic-${CACHE_VERSION}`;
const API_CACHE = `attendance-api-${CACHE_VERSION}`;

// All app pages to pre-cache for offline access
const APP_PAGES = [
  '/',
  '/scan',
  '/terms',
  '/offline',
  '/s/SHB-001',
  '/s/SMPN-01',
  '/s/SMA-INS',
];

// Static assets to pre-cache
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.svg',
  '/offline.html',
];

// API endpoints to cache (GET only)
const CACHEABLE_APIS = [
  '/api/school-config',
  '/api/schools/public',
  '/api/scan-session',
  '/api/terms',
];

// Install - pre-cache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
      caches.open(DYNAMIC_CACHE).then((cache) => cache.addAll(APP_PAGES)),
    ])
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !key.includes(CACHE_VERSION))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET for caching
  if (request.method !== 'GET') return;

  // Skip socket.io and HMR
  if (url.pathname.includes('/socket.io/') || url.pathname.includes('/_next/')) return;

  // API requests - network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request, API_CACHE));
    return;
  }

  // Navigation requests - cache first for offline
  if (request.mode === 'navigate') {
    event.respondWith(cacheFirstStrategy(request, DYNAMIC_CACHE));
    return;
  }

  // Static assets - cache first
  event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
});

// Cache-first strategy (for offline support)
async function cacheFirstStrategy(request, cacheName) {
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
    return caches.match('/offline');
  }
}

// Network-first strategy (for fresh data)
async function networkFirstStrategy(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Background sync for offline attendance submissions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-attendance') {
    event.waitUntil(syncPendingActions());
  }
});

async function syncPendingActions() {
  const cache = await caches.open('attendance-queue');
  const requests = await cache.keys();

  for (const request of requests) {
    try {
      const response = await cache.match(request);
      const data = await response.json();

      await fetch(request, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      await cache.delete(request);
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }
}

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {
    title: 'Attendance App',
    body: 'New notification',
  };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      vibrate: [100, 50, 100],
      data: data.url || '/',
    })
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(event.notification.data || '/');
    })
  );
});
