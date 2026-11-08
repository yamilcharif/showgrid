/* ShowGrid service worker: makes the site installable and keeps the tools working without internet.
   - Pages: network first, the saved copy when offline (so pages are always fresh when online).
   - Build files (/_next/static, fonts, icons): saved the first time, they never change.
   - Private pages (account, messages, quotes, requests, sign-in), the API and sign-in callbacks are never saved. */

const VERSION = "v3";
const PAGES = `pages-${VERSION}`;
const STATIC = `static-${VERSION}`;
const OFFLINE = "/offline.html";
const PRIVATE = /^\/(?:(?:en|es)\/)?(?:account|messages|quotes|requests|sign-in|api|auth)(?:\/|$)/;
const MAX_PAGES = 80;
const MAX_STATIC = 400;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.add(new Request(OFFLINE, { cache: "reload" }))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, STATIC]);
      for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") || /\.(?:png|svg|ico|jpg|jpeg|webp|gif|woff2?)$/.test(url.pathname);

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function put(name, req, res, max) {
  const c = await caches.open(name);
  await c.put(req, res);
  trim(name, max);
}

async function page(req) {
  try {
    const res = await fetch(req);
    if (res.ok && res.type === "basic") put(PAGES, req, res.clone(), MAX_PAGES);
    return res;
  } catch (err) {
    const saved = await caches.match(req, { ignoreVary: true, cacheName: PAGES });
    if (saved) return saved;
    if (req.mode === "navigate") return (await caches.match(OFFLINE)) || Response.error();
    throw err;
  }
}

async function file(req) {
  const saved = await caches.match(req, { cacheName: STATIC });
  if (saved) return saved;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") put(STATIC, req, res.clone(), MAX_STATIC);
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname === "/sw.js") return;
  if (PRIVATE.test(url.pathname)) {
    // never saved, but a page load without internet still gets the friendly offline page
    if (req.mode === "navigate") event.respondWith(fetch(req).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
    return;
  }
  if (isStatic(url)) return event.respondWith(file(req));
  // full page loads; when offline, Next's in-page moves fail and fall back to a full load, which this answers
  if (req.mode === "navigate") event.respondWith(page(req));
});

/* The page asks to keep the tools ready for offline use: save each tool page and the build files it loads. */
self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type !== "warm" || !Array.isArray(msg.urls)) return;
  event.waitUntil(
    (async () => {
      for (const path of msg.urls) {
        try {
          const req = new Request(path, { credentials: "same-origin" });
          const res = await fetch(req);
          if (!res.ok) continue;
          const html = await res.clone().text();
          await put(PAGES, req, res, MAX_PAGES);
          const files = new Set(html.match(/\/_next\/static\/[^"'\\\s)]+/g) || []);
          const store = await caches.open(STATIC);
          for (const f of files) if (!(await store.match(f))) await store.add(f).catch(() => {});
        } catch {
          /* offline or the page failed; try again next visit */
        }
      }
      trim(STATIC, MAX_STATIC);
    })(),
  );
});
