workbox.core.setCacheNameDetails({
    prefix: 'YAFDB',
    suffix: 'v1.0.0',
    precache: 'precache',
    runtime: 'runtime-cache'
});

workbox.core.skipWaiting();
workbox.core.clientsClaim();

workbox.precaching.precacheAndRoute(self.__precacheManifest);

workbox.routing.registerRoute(
    /\.html$/,
    new workbox.strategies.NetworkFirst()
);

workbox.routing.registerRoute(
    /\.(?:js|css)$/,
    new workbox.strategies.NetworkFirst()
);


workbox.routing.registerRoute(
    /assets\/(img|icons)/,
    new workbox.strategies.CacheFirst()
);

