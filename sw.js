// Service Worker for 外気温モニター PWA
// Version 4 - Push Notification Support
const CACHE_NAME = 'temp-monitor-v4';
const urlsToCache = [
    './',
    './index.html'
];

// Install: cache files
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

// Fetch: network first, fallback to cache
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

// =====================================================
// PUSH NOTIFICATION HANDLERS
// =====================================================

// Receive push notification
self.addEventListener('push', event => {
    console.log('[SW] Push received:', event);

    let data = {
        title: '外気温モニター',
        body: '新しい通知があります',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌡️</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌡️</text></svg>',
        tag: 'weather-notification',
        requireInteraction: false,
        data: { url: './' }
    };

    // Parse push data if available
    if (event.data) {
        try {
            const pushData = event.data.json();
            data = { ...data, ...pushData };
        } catch (e) {
            data.body = event.data.text();
        }
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon,
            badge: data.badge,
            tag: data.tag,
            requireInteraction: data.requireInteraction,
            vibrate: [100, 50, 100],
            data: data.data,
            actions: data.actions || []
        })
    );
});

// Handle notification click
self.addEventListener('notificationclick', event => {
    console.log('[SW] Notification clicked:', event);
    event.notification.close();

    const urlToOpen = event.notification.data?.url || './';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(windowClients => {
                // Check if app is already open
                for (const client of windowClients) {
                    if (client.url.includes('index.html') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Open new window
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// Handle notification close
self.addEventListener('notificationclose', event => {
    console.log('[SW] Notification closed:', event);
});
