import "server-only";

// Shared by the stage 2 member actions (Open Invite, Messages, You, the photo gate). Not a "use server" file, so
// nothing here is a public endpoint by itself.

import { SESSION_ENDED, type SessionEnded } from "@/components/members/session-ended";
import type { Viewer } from "@/lib/server/plans";
import { memberForAction, type Member, type RequireMemberOptions } from "./require-member";

/** The words when an action fails for a reason the member cannot act on (r2b: plain words, never a generic failure line). */
export const TRY_AGAIN = "That didn’t go through. Try again in a moment.";

export type Failed = { ok: false; error: string };

/**
 * Run an action as the signed-in member: SESSION_ENDED when the session has gone (the page sends them to Log in
 * with "Your session ended."), the gates as for pages (paused and ended members, and the photo gate, redirect),
 * and a plain failure instead of a thrown error.
 */
export async function asMember<T>(
  label: string,
  run: (member: Member, viewer: Viewer) => Promise<T>,
  options: RequireMemberOptions = {},
): Promise<T | SessionEnded | Failed> {
  const member = await memberForAction(options);
  if (!member) return SESSION_ENDED;
  try {
    return await run(member, { id: member.id, email: member.email });
  } catch (err) {
    // A redirect or notFound from inside (the gates) must go on up.
    if (err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string") throw err;
    console.error(`${label} failed for member ${member.id}:`, err);
    return { ok: false, error: TRY_AGAIN };
  }
}
