importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.0.2/workbox-sw.js');

self.addEventListener('fetch', (event) => {
    if (event.request.url.endsWith('.webp')) {
        const cacheFirst = new workbox.strategies.CacheFirst();
        event.respondWith(cacheFirst.handle({request: event.request}));
    }
});

self.addEventListener('fetch', (event) => {
    if (event.request.url.endsWith('.webm')) {
        const cacheFirst = new workbox.strategies.CacheFirst();
        event.respondWith(cacheFirst.handle({request: event.request}));
    }
});

self.addEventListener('fetch', (event) => {
    if (event.request.url.endsWith('.js')) {
        const cacheFirst = new workbox.strategies.CacheFirst();
        event.respondWith(cacheFirst.handle({request: event.request}));
    }
});


