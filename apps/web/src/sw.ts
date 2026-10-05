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
    /^\/api\/(log|auth\/me|recipes|foods\/mine|fasting|history)(\/|\?|$)/.test(url.pathname + url.search),
  new NetworkFirst({
    cacheName: 'api-data',
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 14 * 24 * 3600 })],
  }),
);

// ---------- Push notifications ----------
interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

self.addEventListener('push', (event) => {
  let data: PushPayload = { title: 'Mea', body: '' };
  try {
    data = { ...data, ...(event.data?.json() as PushPayload) };
  } catch {
    data.body = event.data?.text() ?? '';
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data?.url as string) ?? '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = wins.find((w) => w.url.startsWith(self.location.origin));
      if (existing) {
        await existing.focus();
        if ('navigate' in existing) await existing.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
