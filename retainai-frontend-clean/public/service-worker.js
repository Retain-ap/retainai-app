// public/service-worker.js

const CACHE = "retainai-v2";
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
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return; // ignore chrome-extension:// etc
  } catch { return; }

  if (url.pathname.startsWith("/api/")) return; // never cache API
  if (req.headers.get("range")) { event.respondWith(fetch(req)); return; } // avoid 206

  // SPA navigation fallback
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try { return await fetch(req); }
      catch {
        const cache = await caches.open(CACHE);
        return (await cache.match("/index.html")) || Response.error();
      }
    })());
    return;
  }

  // Stale-while-revalidate for static assets
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const net = fetch(req).then(res => {
      if (res && res.ok && res.status === 200 && res.type !== "opaque") {
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    }).catch(() => cached);
    return cached || net;
  })());
});

// Push notifications
self.addEventListener("push", (event) => {
  const payload = (() => { try { return event.data ? event.data.json() : {}; } catch { return {}; } })();
  const title = payload.title || "Reminder";
  const url   = payload.url   || "/app/dashboard";
  const options = {
    body: payload.body || "⏰ Follow up with your lead!",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag:  payload.tag || "retainai-reminder",
    renotify: false,
    data: { url },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const urlToOpen = new URL(event.notification?.data?.url || "/", self.location.origin).href;
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of windows) {
      if (c.url === urlToOpen || c.url.startsWith(urlToOpen)) return c.focus();
    }
    if (windows[0]) {
      try { await windows[0].navigate(urlToOpen); return windows[0].focus(); } catch {}
    }
    return clients.openWindow(urlToOpen);
  })());
});
