import "server-only";

// The private member-photos bucket: uploads, removals and signed URLs, from the server only (members cannot
// read, list or write the bucket: the migration's restrictive storage policy). Signed URLs last an hour and are
// cached in this server instance, so a page drawn twice hands the browser the same URL (and the browser's own
// cache works) until it has less than 15 minutes left.

import { PHOTO_BUCKET, PHOTO_URL_MIN_LEFT_SECONDS, PHOTO_URL_TTL_SECONDS } from "../config";
import { serviceDb } from "../db";

type Cached = { url: string; expiresAt: number };
const CACHE_MAX = 2000;
const cache = new Map<string, Cached>();

function fromCache(path: string, now: number): string | null {
  const hit = cache.get(path);
  if (!hit) return null;
  if (hit.expiresAt - now < PHOTO_URL_MIN_LEFT_SECONDS * 1000) {
    cache.delete(path);
    return null;
  }
  return hit.url;
}

function remember(path: string, url: string, now: number): void {
  if (cache.size >= CACHE_MAX) {
    // Oldest first: a Map keeps insertion order.
    const drop = cache.size - CACHE_MAX + 1;
    let n = 0;
    for (const key of cache.keys()) {
      cache.delete(key);
      n += 1;
      if (n >= drop) break;
    }
  }
  cache.set(path, { url, expiresAt: now + PHOTO_URL_TTL_SECONDS * 1000 });
}

/** Signed URLs for paths in the private bucket, one storage call for all the ones not cached. Unknown paths map to null. */
export async function signedUrls(paths: (string | null | undefined)[]): Promise<Map<string, string | null>> {
  const now = Date.now();
  const out = new Map<string, string | null>();
  const missing: string[] = [];
  for (const path of new Set(paths.filter((p): p is string => Boolean(p)))) {
    const hit = fromCache(path, now);
    if (hit) out.set(path, hit);
    else missing.push(path);
  }
  if (missing.length) {
    try {
      const { data, error } = await serviceDb().storage.from(PHOTO_BUCKET).createSignedUrls(missing, PHOTO_URL_TTL_SECONDS);
      if (error) throw error;
      for (const row of data ?? []) {
        if (row.path && row.signedUrl && !row.error) {
          out.set(row.path, row.signedUrl);
          remember(row.path, row.signedUrl, now);
        }
      }
    } catch (err) {
      // A photo that cannot be signed shows as the member's initial; the page still draws.
      console.error("photos: signing URLs failed:", err);
    }
    for (const path of missing) if (!out.has(path)) out.set(path, null);
  }
  return out;
}

export async function signedUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  return (await signedUrls([path])).get(path) ?? null;
}

/** Forget a path's cached URL (after a removal), so no new page gets it. URLs already handed out run out within the hour. */
export function forgetSigned(paths: (string | null | undefined)[]): void {
  for (const path of paths) if (path) cache.delete(path);
}

export async function putPhotoFile(path: string, bytes: Uint8Array, contentType: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await serviceDb().storage.from(PHOTO_BUCKET).upload(path, Buffer.from(bytes), { contentType, upsert: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deletePhotoFiles(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => Boolean(p));
  if (!list.length) return;
  forgetSigned(list);
  const { error } = await serviceDb().storage.from(PHOTO_BUCKET).remove(list);
  if (error) console.error("photos: removing files failed:", error);
}
