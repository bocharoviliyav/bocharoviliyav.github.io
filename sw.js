workbox.core.setCacheNameDetails({
    prefix: 'YAFDB',
    suffix: 'v1.0.0',
    precache: 'precache',
    runtime: 'runtime-cache'
});

workbox.googleAnalytics.initialize();

workbox.core.skipWaiting();
workbox.core.clientsClaim();

workbo.google

workbox.precaching.precacheAndRoute(self.__precacheManifest);

workbox.routing.setDefaultHandler(workbox.strategies.networkFirst());

workbox.routing.registerRoute(
    /\.html$/,
    new workbox.strategies.StaleWhileRevalidate()
);

workbox.routing.registerRoute(
    /\.(?:js|css)$/,
    new workbox.strategies.NetworkFirst()
);

workbox.routing.registerRoute(
    /assets\/(img|icons)/,
    new workbox.strategies.CacheFirst()
);

workbox.routing.registerRoute(
    /^https?:\/\/fonts\.googleapis\.com/,
    workbox.strategies.staleWhileRevalidate()
);
