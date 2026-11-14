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
const MAX_ASSETS = 1200;
/** A page saved in the background is saved again at most this often. */
const RESAVE_MS = 2 * 60 * 1000;
/** The main pages (the tabs, Profile, Messages), saved ahead so each opens offline even if not visited: at most this often. */
const MAIN_RESAVE_MS = 30 * 60 * 1000;
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

/** Saves a page, then the site files it needs, so it draws offline; returns its HTML ("" when not saved). */
async function savePage(request, response) {
  const url = new URL(response.url || request.url);
  if (NEVER_SAVE.some((re) => re.test(url.pathname))) return "";
  const member = response.headers.get("x-cy-member");
  if (!member) return "";
  const known = await meta("member");
  if (known && known !== member) await wipeMemberData();
  if (known !== member) await meta("member", member);
  const html = await response.clone().text();
  const cache = await caches.open(PAGES);
  await cache.put(pageKey(url.toString()), response);
  await meta(`saved:${url.pathname}${url.search}`, Date.now());
  await trim(PAGES, MAX_PAGES);
  await saveAssets(html);
  return html;
}

/**
 * The site's own files a page names: its scripts, styles and fonts, and the chunks its components load later (listed
 * in the page's data as "static/chunks/..."). A page saved in the background was never drawn, so without these it
 * would fail offline (14 Nov 2026: Messages, saved ahead, showed "That didn't load", ChunkLoadError).
 */
async function saveAssets(html) {
  const paths = new Set();
  // (route groups put brackets in the names: "static/chunks/app/members/messages/(inbox)/page-1a2b.js")
  for (const m of html.matchAll(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\s\\]+/g)) {
    const path = m[0].startsWith("/_next/") ? m[0] : `/_next/${m[0]}`;
    paths.add(path.replace(/[,;]+$/, ""));
  }
  const cache = await caches.open(ASSETS);
  const missing = [];
  for (const path of paths) if (!(await cache.match(path, { ignoreSearch: true }))) missing.push(path);
  for (let i = 0; i < missing.length; i += 4) {
    await Promise.all(
      missing.slice(i, i + 4).map(async (path) => {
        try {
          const response = await fetch(path, { credentials: "same-origin" });
          if (response.ok) await cache.put(path, response);
        } catch {
          // offline again, or gone with a new build: the next save tries again
        }
      }),
    );
  }
  if (missing.length) await trim(ASSETS, MAX_ASSETS);
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
  // The site's files have their contents' hash in the name, so a query on them (a deployment marker) doesn't matter.
  const hit = await cache.match(request, { ignoreVary: true, ignoreSearch: true });
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
async function saveInBackground(href, minAge = RESAVE_MS) {
  const url = new URL(href, self.location.origin);
  if (url.origin !== self.location.origin || !(url.pathname === "/members" || url.pathname.startsWith("/members/"))) return;
  if (NEVER_SAVE.some((re) => re.test(url.pathname))) return;
  const last = Number(await meta(`saved:${url.pathname}${url.search}`)) || 0;
  if (Date.now() - last < minAge) return;
  // x-cy-save: saved in the background, not opened by the member (a chat saved this way is not marked read).
  const response = await fetch(url.toString(), { credentials: "same-origin", headers: { accept: "text/html", "x-cy-save": "1" }, redirect: "manual" });
  if (!response.ok || response.type !== "basic") return;
  const html = await savePage(new Request(url.toString()), response);
  if (html) await savePictures(html);
  // The inbox: its chats are saved ahead too, the newest first (14 Nov 2026: "can't seem to open messages offline").
  if (url.pathname === "/members/messages") {
    for (const chat of chatLinks(html)) await saveInBackground(chat, MAIN_RESAVE_MS).catch(() => {});
  }
}

/** The chats the inbox links to, newest first (the inbox's own order), at most MAX_CHATS. Not "ask-" ones (a
 *  question not asked yet). */
const MAX_CHATS = 8;
function chatLinks(html) {
  const out = [];
  for (const m of html.matchAll(/href="(\/members\/messages\/[^"?#]+)"/g)) {
    const path = m[1];
    if (path.includes("/ask-") || out.includes(path)) continue;
    out.push(path);
    if (out.length >= MAX_CHATS) break;
  }
  return out;
}

/** A picture's key. A member photo's signed link carries a token that changes on every page, so it is kept by the
 *  photo's own path (the same photo, whichever link the page has); anything else by its full address. */
function pictureKey(url) {
  const u = new URL(url);
  if (u.pathname.startsWith("/storage/v1/object/sign/")) return `${u.origin}${u.pathname}`;
  return u.toString();
}

/**
 * The member photos and storage pictures a page saved in the background shows (it was never drawn, so they were never
 * fetched): without them its faces are broken offline. At most MAX_PAGE_PICTURES a page, any already kept skipped.
 */
const MAX_PAGE_PICTURES = 16;
async function savePictures(html) {
  const urls = new Set();
  for (const m of html.matchAll(/src="(https?:\/\/[^"]+?\/storage\/v1\/object\/[^"]+)"/g)) {
    urls.add(m[1].replace(/&amp;/g, "&"));
    if (urls.size >= MAX_PAGE_PICTURES) break;
  }
  if (!urls.size) return;
  const cache = await caches.open(IMAGES);
  let added = false;
  for (const url of urls) {
    const key = pictureKey(url);
    if (await cache.match(key, { ignoreVary: true })) continue;
    try {
      const response = await fetch(url, { mode: "cors", credentials: "omit" });
      if (response.ok) {
        await cache.put(key, response);
        added = true;
      }
    } catch {
      // offline again, or a host that won't answer with CORS: the page draws it when opened online
    }
  }
  if (added) await trim(IMAGES, MAX_IMAGES);
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
    return;
  }
  // The main pages (14 Nov 2026: Concierge, never opened since the app was installed, led to the offline screen):
  // saved ahead, one after another, so every tab opens offline.
  if (data.type === "cy-save-main" && Array.isArray(data.hrefs)) {
    event.waitUntil(
      (async () => {
        for (const href of data.hrefs.slice(0, 10)) {
          if (typeof href === "string") await saveInBackground(href, MAIN_RESAVE_MS).catch(() => {});
        }
      })(),
    );
    return;
  }
  // Which pages are saved (path and query), so the page can tell, offline, which links will open.
  if (data.type === "cy-list" && event.ports && event.ports[0]) {
    const port = event.ports[0];
    event.waitUntil(
      caches
        .open(PAGES)
        .then((cache) => cache.keys())
        .then((keys) => port.postMessage(keys.map((r) => { const u = new URL(r.url); return u.pathname + u.search; })))
        .catch(() => port.postMessage([])),
    );
  }
});
