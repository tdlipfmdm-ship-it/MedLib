const VERSION = "20260612-backend-status-v1";
const SHELL_CACHE = "medlib-shell-" + VERSION;
const RUNTIME_CACHE = "medlib-runtime-" + VERSION;
const KNOWN_CACHES = [SHELL_CACHE, RUNTIME_CACHE];

const SHELL_FILES = [
  "./",
  "./index.html",
  "./books.html",
  "./categories.html",
  "./languages.html",
  "./book.html",
  "./help.html",
  "./login.html",
  "./register.html",
  "./account.html",
  "./reader.html",
  "./assets/style.css",
  "./assets/reader.css",
  "./assets/site-config.js",
  "./assets/i18n.js",
  "./assets/app.js",
  "./assets/catalog.js",
  "./assets/catalog-filter-worker.js",
  "./assets/data/home.index.json",
  "./assets/data/library.index.json",
  "./assets/icons/medlib-app.svg",
  "./manifest.webmanifest",
];

const CACHEABLE_FILE_RE = /\.(?:html|css|js|mjs|json|webmanifest|svg|webp|png|jpe?g|ico|woff2?|ttf)$/i;
const STATIC_ASSET_RE = /\.(?:css|js|mjs|json|webmanifest|svg|webp|png|jpe?g|ico|woff2?|ttf)$/i;
const DOWNLOAD_RE = /\.(?:pdf|apk|zip|exe|msi|docx?|xlsx?|pptx?)$/i;

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isApiPath(pathname) {
  return pathname.startsWith("/api/");
}

function isPdfPath(pathname) {
  return pathname.toLowerCase().endsWith(".pdf");
}

function isNavigationRequest(request, url) {
  return request.mode === "navigate" || url.pathname === "/" || /\.html$/i.test(url.pathname);
}

function isCacheableRequest(request, url) {
  if (request.method !== "GET") return false;
  if (!isSameOrigin(url)) return false;
  if (request.headers.has("range")) return false;
  if (isApiPath(url.pathname) || isPdfPath(url.pathname)) return false;
  if (DOWNLOAD_RE.test(url.pathname)) return false;
  return url.pathname === "/" || CACHEABLE_FILE_RE.test(url.pathname);
}

function isStaticAsset(url) {
  return STATIC_ASSET_RE.test(url.pathname);
}

function isGoodResponse(response) {
  return response && response.ok && (response.type === "basic" || response.type === "default");
}

function shouldIgnoreSearch(url) {
  return url.pathname === "/" || /\.html$/i.test(url.pathname) || isStaticAsset(url);
}

function matchCached(request, url) {
  return caches.match(request, { ignoreSearch: shouldIgnoreSearch(url) });
}

async function putCached(cacheName, request, response) {
  if (!isGoodResponse(response)) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
}

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(
    SHELL_FILES.map(async (file) => {
      try {
        const request = new Request(file, { cache: "reload" });
        const response = await fetch(request);
        if (isGoodResponse(response)) {
          await cache.put(file, response);
        }
      } catch (_err) {
        // A missing optional asset must not block service worker installation.
      }
    })
  );
}

async function networkFirst(request, url) {
  try {
    const response = await fetch(request);
    await putCached(RUNTIME_CACHE, request, response).catch(() => null);
    return response;
  } catch (_err) {
    const cached = await matchCached(request, url);
    if (cached) return cached;
    const fallback = await caches.match("./index.html");
    return fallback || Response.error();
  }
}

function staleWhileRevalidate(request, url) {
  return matchCached(request, url).then((cached) => {
    const refreshed = fetch(request)
      .then((response) => {
        if (isGoodResponse(response)) {
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, response.clone())).catch(() => null);
        }
        return response;
      })
      .catch(() => cached || Response.error());
    return cached || refreshed;
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("medlib-") && !KNOWN_CACHES.includes(key))
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (!isCacheableRequest(event.request, url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (isNavigationRequest(event.request, url)) {
    event.respondWith(networkFirst(event.request, url));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request, url));
});
