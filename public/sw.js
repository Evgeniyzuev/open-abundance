const CACHE_PREFIX = "open-abundance-";
const CACHE_NAME = "open-abundance-v7";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon2.svg",
  "/icons/twenty-levels-app-icon-192.png",
  "/icons/twenty-levels-app-icon-512.png"
];
const NAVIGATION_NETWORK_TIMEOUT_MS = 5_000;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isRuntimeStaticAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  event.waitUntil(self.registration.showNotification(payload.title || "Open Abundance", {
    body: payload.body || "Open the app to see the details.",
    icon: "/icons/twenty-levels-app-icon-192.png",
    badge: "/icons/twenty-levels-app-icon-192.png",
    tag: payload.tag || "open-abundance-reminder",
    data: { deepLink: payload.deepLink || "/" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const deepLink = event.notification.data && event.notification.data.deepLink
    ? event.notification.data.deepLink
    : "/";
  const targetUrl = new URL(deepLink, self.location.origin).href;

  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    for (const client of clients) {
      if ("navigate" in client) await client.navigate(targetUrl);
      if ("focus" in client) return client.focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
  }));
});

async function handleNavigation(request) {
  const networkRequest = fetch(request, { cache: "no-store" });

  if (self.navigator && self.navigator.onLine === false) {
    return offlinePage();
  }

  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve(null), NAVIGATION_NETWORK_TIMEOUT_MS);
  });
  const response = await Promise.race([networkRequest.catch(() => null), timeout]);
  return response || offlinePage();
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone()).catch(() => undefined);
  }
  return response;
}

async function staleWhileRevalidate(request, event) {
  const cached = await caches.match(request);
  const networkRequest = fetch(request).then(async (response) => {
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone()).catch(() => undefined);
    }
    return response;
  });

  if (cached) {
    event.waitUntil(networkRequest.catch(() => undefined));
    return cached;
  }

  return networkRequest;
}

function isRuntimeStaticAsset(pathname) {
  return pathname === "/manifest.webmanifest"
    || pathname.startsWith("/icons/")
    || pathname.startsWith("/onboarding/");
}

async function offlinePage() {
  const cached = await caches.match(OFFLINE_URL);
  return cached || new Response("Offline", {
    status: 503,
    statusText: "Offline",
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}
