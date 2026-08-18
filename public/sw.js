const CACHE_NAME = 'attendance-v1';
const STATIC_CACHE = 'attendance-static-v1';
const DYNAMIC_CACHE = 'attendance-dynamic-v1';

// Assets to pre-cache
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Install event - pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip API calls (always go to network)
  if (url.pathname.startsWith('/api/')) return;

  // Skip socket.io
  if (url.pathname.includes('/socket.io/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Clone the response before caching
        const responseClone = response.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => {
          cache.put(request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(request).then((cached) => {
          if (cached) return cached;

          // Return offline page for navigation requests
          if (request.mode === 'navigate') {
            return caches.match('/offline');
          }

          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// Background sync for offline attendance submissions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-attendance') {
    event.waitUntil(syncAttendance());
  }
});

async function syncAttendance() {
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

// Push notification handler
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {
    title: 'Attendance App',
    body: 'New notification',
    icon: '/icon-192.png',
  };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [100, 50, 100],
      data: data.url || '/',
      actions: [
        { action: 'open', title: 'Open', icon: '/icon-192.png' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      return clients.openWindow(event.notification.data || '/');
    })
  );
});
