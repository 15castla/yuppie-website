import "server-only";

// A member as other members see them: first name and photo, nothing else (types: InviteMember, MemberRef). The
// photo is a signed URL of the member's current photo, read at the moment the page is drawn, so a photo the club
// removes disappears from old chats too (messages spec 8).

import { serviceDb } from "./db";
import { firstName } from "./format";
import { currentPhotoUrls, type PhotoSize } from "./photos";

export type PersonRef = { id: string; firstName: string; photoUrl: string | null };

/** What a member who deleted their account is called where their old messages still stand. NEW COPY. */
export const FORMER_MEMBER = "Former member";

type PersonRow = { id: string; full_name: string | null; deleted_at: string | null; membership_status: string };

export async function peopleRefs(ids: (string | null | undefined)[], size: PhotoSize = "thumb"): Promise<Map<string, PersonRef>> {
  const list = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const out = new Map<string, PersonRef>();
  if (!list.length) return out;
  const [{ data }, photos] = await Promise.all([
    serviceDb().from("members").select("id, full_name, deleted_at, membership_status").in("id", list),
    currentPhotoUrls(list, size),
  ]);
  for (const row of (data ?? []) as PersonRow[]) {
    const deleted = Boolean(row.deleted_at);
    out.set(row.id, {
      id: row.id,
      firstName: deleted ? FORMER_MEMBER : firstName(row.full_name) || "Member",
      photoUrl: deleted ? null : photos.get(row.id) ?? null,
    });
  }
  for (const id of list) if (!out.has(id)) out.set(id, { id, firstName: FORMER_MEMBER, photoUrl: null });
  return out;
}

export async function personRef(id: string, size: PhotoSize = "thumb"): Promise<PersonRef> {
  return (await peopleRefs([id], size)).get(id) ?? { id, firstName: FORMER_MEMBER, photoUrl: null };
}
