// ----- PWA bootstrap (install/activate + tiny cache) -----
const CACHE = "retainai-v1";
const PRECACHE = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
    } catch {}
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchP = fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone));
          return res;
        })
        .catch(() => cached);
      return cached || fetchP;
    })
  );
});

// ----- Push notifications -----
self.addEventListener("push", (event) => {
  const payload = (() => {
    try { return event.data ? event.data.json() : {}; } catch { return {}; }
  })();

  const title = payload.title || "Reminder";
  const url = payload.url || "/app/dashboard"; // sensible default for your app
  const options = {
    body: payload.body || "⏰ Follow up with your lead!",
    // Use your manifest icon path (you used /icons in the manifest)
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || "retainai-reminder",   // collapses duplicates
    renotify: false,
    data: { url },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Focus an existing tab on the right route if possible, otherwise open a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil((async () => {
    const urlToOpen = new URL(event.notification?.data?.url || "/", self.location.origin).href;

    // Look for an open client from our origin.
    const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });

    // If we already have a tab, reuse it.
    for (const client of windowClients) {
      // If it's already on the right page, just focus it.
      if (client.url === urlToOpen || client.url.startsWith(urlToOpen)) {
        return client.focus();
      }
    }
    // Otherwise, prefer navigating an existing client (SPA-friendly), then focus.
    if (windowClients.length > 0) {
      try {
        const client = windowClients[0];
        await client.navigate(urlToOpen); // same-origin only
        return client.focus();
      } catch {
        // Fall through to openWindow if navigate fails
      }
    }
    // No existing window or couldn't navigate → open a new one.
    return clients.openWindow(urlToOpen);
  })());
});

// (Optional) handy for analytics/debugging
self.addEventListener("notificationclose", (event) => {
  // console.log("Notification dismissed:", event.notification?.tag);
});
