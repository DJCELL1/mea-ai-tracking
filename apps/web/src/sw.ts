/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

// App shell: precached so the app opens offline
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

// Read-only API data: always try the network, fall back to the last copy when offline,
// so today's log (and recent days you've opened) can be viewed without signal.
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    /^\/api\/(log|auth\/me|recipes|foods\/mine)(\/|\?|$)/.test(url.pathname + url.search),
  new NetworkFirst({
    cacheName: 'api-data',
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 14 * 24 * 3600 })],
  }),
);

// Push notifications are added in phase 5.
