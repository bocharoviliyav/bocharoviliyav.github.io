importScripts('/assets/js/workbox-sw.js');

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
