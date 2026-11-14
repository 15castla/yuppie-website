/* Club Yuppie members: pages that still open with no signal (Albert, 13 Nov 2026: "I want to improve the app so it
   still loads when disconnected from wifi like other apps do such as instagram. Although, it should still be clear
   the user is offline").

   Registered by components/members/shell/offline.tsx with scope /members, so it runs for the members pages only
   (never the public site, /member-login, /apply or /admin). In the iOS app it needs App-Bound Domains
   (mobile/capacitor.config.ts limitsNavigationsToAppBoundDomains, WKAppBoundDomains in Info.plist).

   What it does:
   - A members page the member opens is saved on the phone as it arrives (only for a signed-in member: the server
     marks those with x-cy-member, a short hash of who they are). With no signal, or no answer within a few seconds,
     the saved copy opens instead. A page never opened before shows /members-offline.html.
   - The site's own files (/_next/static, fonts, pictures) are kept so a saved page draws properly offline.
   - Member photos and event pictures are kept as they load (a few hundred at most).
   - Everything else (server actions, /api, the client router's own requests) goes straight to the network: an
     action offline fails, and the page says it needs a connection.
   - Privacy: the saved pages are wiped when a different member signs in on the phone, when a page load is sent to
     Log in (signed out or session ended), and by /member-login itself (app/member-login: clearMemberPages).

   To switch it off for everyone: NEXT_PUBLIC_MEMBERS_OFFLINE=off (the page then unregisters it and clears the saved
   pages). Bump VERSION when the caching rules change. */

const VERSION = "v1";
const PAGES = `cy-pages-${VERSION}`;
const ASSETS = `cy-assets-${VERSION}`;
const IMAGES = `cy-images-${VERSION}`;
const META = `cy-meta-${VERSION}`;
const OFFLINE_PAGE = "/members-offline.html";
const PRECACHE = [OFFLINE_PAGE, "/yuppie_logo_forte_forward.png"];
const MAX_PAGES = 80;
const MAX_IMAGES = 300;
const MAX_ASSETS = 600;
/** A page saved in the background is saved again at most this often. */
const RESAVE_MS = 2 * 60 * 1000;
/** How long a page load waits for the network before showing the saved copy (when there is one). */
const PAGE_TIMEOUT_MS = 6000;
const NEVER_SAVE = [/^\/members\/billing/, /\/calendar\.ics$/, /^\/members\/test-error/];

/** Which client was given a saved page, and from when: the page asks, to word its bar. */
const servedFromCache = new Map();

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(ASSETS)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("cy-") && !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function wipeMemberData() {
  await Promise.all([caches.delete(PAGES), caches.delete(IMAGES), caches.delete(META)]);
}

async function meta(key, value) {
  const cache = await caches.open(META);
  const url = `/__cy_meta/${key}`;
  if (value === undefined) {
    const hit = await cache.match(url);
    return hit ? hit.text() : null;
  }
  await cache.put(url, new Response(String(value)));
  return value;
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i += 1) await cache.delete(keys[i]);
}

/** The address a page is saved under: the path and its query, without the router's own markers. */
function pageKey(url) {
  const u = new URL(url);
  u.hash = "";
  u.searchParams.delete("_rsc");
  return u.toString();
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function savePage(request, response) {
  const url = new URL(response.url || request.url);
  if (NEVER_SAVE.some((re) => re.test(url.pathname))) return;
  const member = response.headers.get("x-cy-member");
  if (!member) return;
  const known = await meta("member");
  if (known && known !== member) await wipeMemberData();
  if (known !== member) await meta("member", member);
  const cache = await caches.open(PAGES);
  await cache.put(pageKey(url.toString()), response);
  await meta(`saved:${url.pathname}${url.search}`, Date.now());
  await trim(PAGES, MAX_PAGES);
}

async function savedPage(request) {
  const cache = await caches.open(PAGES);
  const hit = await cache.match(pageKey(request.url), { ignoreVary: true, ignoreSearch: false });
  if (hit) {
    const url = new URL(request.url);
    return { response: hit, savedAt: Number(await meta(`saved:${url.pathname}${url.search}`)) || null };
  }
  // /members only redirects to the landing page (next.config.ts): offline, to whichever of them is saved.
  if (new URL(request.url).pathname === "/members") {
    for (const landing of ["/members/open-invite", "/members/events"]) {
      const target = new URL(landing, request.url).toString();
      // A small page that moves on to it, rather than a redirect response (a navigation answered by the worker
      // with a redirect was sometimes dropped).
      if (await cache.match(pageKey(target), { ignoreVary: true })) return { response: moveTo(landing), savedAt: null };
    }
  }
  return null;
}

function moveTo(path) {
  const safe = JSON.stringify(path);
  const html = `<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="0;url=${path}"><style>html,body{margin:0;background:#FFD904}</style></head><body><script>location.replace(${safe})</script></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

async function offlinePage() {
  return (await caches.match(OFFLINE_PAGE)) || new Response("You’re offline.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
}

async function handlePage(event) {
  const { request } = event;
  const network = fetch(request);
  // Keep the network answer whenever it comes, even after the saved copy was shown.
  // (A redirect, such as signed out to Log in, comes back as it is and is not saved: /member-login wipes the saved
  // pages itself.)
  event.waitUntil(
    network
      .then(async (response) => {
        if (response.ok && response.type === "basic") await savePage(request, response.clone());
      })
      .catch(() => {}),
  );
  const saved = await savedPage(request);
  try {
    // With a saved copy, wait a few seconds at most (a weak signal); without one, wait for the network.
    return saved ? await withTimeout(network, PAGE_TIMEOUT_MS) : await network;
  } catch {
    if (saved) {
      if (event.resultingClientId) servedFromCache.set(event.resultingClientId, { savedAt: saved.savedAt, offline: !self.navigator.onLine });
      return saved.response;
    }
    return offlinePage();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trim(cacheName, MAX_ASSETS);
  }
  return response;
}

/**
 * A page reached inside the app (the client router fetches only its data, not the page) is saved in the background
 * when the page asks (components/members/shell/offline.tsx), at most every couple of minutes.
 */
async function saveInBackground(href) {
  const url = new URL(href);
  if (url.origin !== self.location.origin || !(url.pathname === "/members" || url.pathname.startsWith("/members/"))) return;
  if (NEVER_SAVE.some((re) => re.test(url.pathname))) return;
  const last = Number(await meta(`saved:${url.pathname}${url.search}`)) || 0;
  if (Date.now() - last < RESAVE_MS) return;
  const response = await fetch(url.toString(), { credentials: "same-origin", headers: { accept: "text/html" }, redirect: "manual" });
  if (response.ok && response.type === "basic") await savePage(new Request(url.toString()), response);
}

/** A picture's key. A member photo's signed link carries a token that changes on every page, so it is kept by the
 *  photo's own path (the same photo, whichever link the page has); anything else by its full address. */
function pictureKey(url) {
  const u = new URL(url);
  if (u.pathname.startsWith("/storage/v1/object/sign/")) return `${u.origin}${u.pathname}`;
  return u.toString();
}

/** Pictures: the saved one at once when there is one, refreshed in the background; otherwise the network. */
async function picture(event, cors) {
  const { request } = event;
  const key = pictureKey(request.url);
  const cache = await caches.open(IMAGES);
  const hit = await cache.match(key, { ignoreVary: true });
  const network = (cors ? fetch(request.url, { mode: "cors", credentials: "omit" }) : fetch(request))
    .then(async (response) => {
      if (response.ok) {
        await cache.put(key, response.clone());
        await trim(IMAGES, MAX_IMAGES);
      }
      return response;
    });
  if (hit) {
    event.waitUntil(network.catch(() => {}));
    return hit;
  }
  try {
    return await network;
  } catch {
    // A member photo on another host that won't answer with CORS: let the browser load it as it would.
    return cors ? fetch(request) : Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) return;
    if (request.mode === "navigate" && (url.pathname === "/members" || url.pathname.startsWith("/members/"))) {
      event.respondWith(handlePage(event));
      return;
    }
    if (url.pathname.startsWith("/_next/static/") || /\.(?:png|jpe?g|svg|webp|gif|ico|woff2?)$/.test(url.pathname)) {
      event.respondWith(cacheFirst(request, ASSETS));
      return;
    }
    if (url.pathname.startsWith("/_next/image")) {
      event.respondWith(picture(event, false));
      return;
    }
    return; // the router's own requests (RSC), server actions and everything else: the network as usual
  }

  // Member photos (signed links) and event pictures from storage (Supabase; the local stack's gateway in tests).
  if (request.destination === "image" && url.pathname.startsWith("/storage/v1/object/")) {
    event.respondWith(picture(event, true));
  }
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "cy-status" && event.source && event.ports && event.ports[0]) {
    const status = servedFromCache.get(event.source.id) || null;
    event.ports[0].postMessage(status);
    return;
  }
  if (data.type === "cy-wipe") {
    event.waitUntil(wipeMemberData());
    return;
  }
  if (data.type === "cy-save" && typeof data.href === "string") {
    event.waitUntil(saveInBackground(data.href).catch(() => {}));
  }
});
