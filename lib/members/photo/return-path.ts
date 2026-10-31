// Where the photo gate sends a member after Continue: the members page they were going to when the gate stopped
// them (photo.md section 1: "A tapped notification while the photo is missing shows the gate first, then opens
// what was tapped"). The proxy passes the address of every request on in MEMBERS_PATH_HEADER
// (lib/supabase/middleware.ts); requireMember (app/members/require-member.ts) puts it on the gate's address as
// ?next=, and the gate page reads it back. Both ends check it with returnPath, so only a members page on this site
// can come out of it (never another site, never the gate itself).

export const MEMBERS_PATH_HEADER = "x-members-path";

const PHOTO_GATE = "/members/photo";
const MAX_LENGTH = 600;

/** A members page's path and query to return to, or null when `raw` is not one. */
export function returnPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw || raw.length > MAX_LENGTH) return null;
  // a path on this site: one leading slash, no backslashes or control characters (no "//host", no "/\host")
  if (!raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, "https://members.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "https://members.invalid") return null;
  const path = url.pathname.length > 1 && url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
  if (path !== "/members" && !path.startsWith("/members/")) return null;
  if (path === PHOTO_GATE || path.startsWith(`${PHOTO_GATE}/`)) return null;
  return `${path}${url.search}`;
}
