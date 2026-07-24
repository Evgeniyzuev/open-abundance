const CACHE_PREFIX = "open-abundance-";
const CACHE_NAME = "open-abundance-v8";
const ROOT_SHELL_KEY = "/";
const STATIC_APP_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon2.svg",
  "/icons/twenty-levels-app-icon-192.png",
  "/icons/twenty-levels-app-icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(STATIC_APP_ASSETS);
    await refreshShell(cache);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin && url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  if (request.mode === "navigate") {
    if (sameOrigin && url.pathname === "/") {
      const refreshPromise = refreshCachedShell();
      event.waitUntil(refreshPromise.catch(() => undefined));
      event.respondWith(handleRootNavigation(refreshPromise));
    } else {
      event.respondWith(fetch(request, { cache: "no-store" }));
    }
    return;
  }

  if (sameOrigin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstStaticAsset(request));
    return;
  }

  if (sameOrigin && isRuntimeAppAsset(url.pathname)) {
    const updatePromise = fetchAndCache(request);
    event.waitUntil(updatePromise.catch(() => undefined));
    event.respondWith(cachedAssetOrNetwork(request, updatePromise));
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

async function handleRootNavigation(refreshPromise) {
  const cache = await caches.open(CACHE_NAME);
  const cachedShell = await cache.match(ROOT_SHELL_KEY);
  if (cachedShell) return cachedShell;

  try {
    return await refreshPromise;
  } catch {
    return missingShellResponse();
  }
}

async function refreshCachedShell() {
  const cache = await caches.open(CACHE_NAME);
  return refreshShell(cache);
}

async function refreshShell(cache) {
  const shellUrl = new URL(ROOT_SHELL_KEY, self.location.origin).href;
  const shellResponse = await fetch(new Request(shellUrl, {
    cache: "no-store",
    credentials: "same-origin"
  }));
  if (!shellResponse.ok) throw new Error(`App shell request failed with ${shellResponse.status}.`);

  const html = await shellResponse.clone().text();
  const assetUrls = extractNextStaticUrls(html);
  const assetResponses = await Promise.all(assetUrls.map(async (assetUrl) => {
    const response = await fetch(new Request(assetUrl, {
      cache: "reload",
      credentials: "same-origin"
    }));
    if (!response.ok) throw new Error(`Static asset request failed with ${response.status}.`);
    return [assetUrl, response];
  }));

  for (const [assetUrl, response] of assetResponses) {
    await cache.put(assetUrl, response);
  }
  await cache.put(ROOT_SHELL_KEY, shellResponse.clone());
  return shellResponse;
}

function extractNextStaticUrls(html) {
  const urls = new Set();
  const attributePattern = /(?:src|href)=["']([^"']+)["']/g;
  let match;

  while ((match = attributePattern.exec(html)) !== null) {
    try {
      const url = new URL(match[1], self.location.origin);
      if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
        urls.add(url.href);
      }
    } catch {
      // Ignore malformed, non-navigation asset references.
    }
  }

  return [...urls];
}

async function cacheFirstStaticAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  return fetchAndCache(request);
}

async function cachedAssetOrNetwork(request, updatePromise) {
  const cached = await caches.match(request);
  return cached ?? updatePromise;
}

async function fetchAndCache(request) {
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

function isRuntimeAppAsset(pathname) {
  return pathname === "/manifest.webmanifest"
    || pathname.startsWith("/icons/")
    || pathname.startsWith("/onboarding/")
    || pathname === "/_next/image";
}

function missingShellResponse() {
  return new Response(`<!doctype html>
<html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open Abundance</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f2f2f7;font:16px system-ui;color:#232323">
<main style="max-width:360px;padding:24px;text-align:center"><strong>Open Abundance</strong><p>The local app shell is being restored. Reconnect and try again.</p><a href="/">Try again</a></main>
</body></html>`, {
    status: 503,
    statusText: "App shell unavailable",
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8"
    }
  });
}
