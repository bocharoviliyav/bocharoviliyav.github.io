importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.0.2/workbox-sw.js');

self.addEventListener('fetch', (event) => {
    if (event.request.url.endsWith('.webp') || event.request.url.endsWith('.css') || event.request.url.endsWith('.webm')) {
        const cacheFirst = new workbox.strategies.CacheFirst({
            cacheName: 'image-cache',
            plugins: [
                new workbox.expiration.ExpirationPlugin({
                    maxAgeSeconds: 24 * 60 * 60,
                }),
            ],
        });
        event.respondWith(cacheFirst.handle({request: event.request}));
    }
});
