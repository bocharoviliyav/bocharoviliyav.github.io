importScripts('/assets/js/workbox-sw.js');

self.addEventListener('fetch', (event) => {
    if (event.request.url.endsWith('.webp') || event.request.url.endsWith('.css') || event.request.url.endsWith('.webm')) {
        const cacheFirst = new workbox.strategies.CacheFirst()
        cacheFirst.cacheName = 'media-and-css'
        event.respondWith(cacheFirst.handle({request: event.request}))
    }
});
