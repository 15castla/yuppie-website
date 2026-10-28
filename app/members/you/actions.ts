"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/lib/members/routes";
import { dayDate, dayMonth } from "@/lib/server/format";
import { billingPortalUrl, cancelPreview, deleteAccount, keepMembership, requestCancel } from "@/lib/server/membership-actions";
import { SESSION_ENDED, type SessionEnded } from "@/components/members/session-ended";
import { memberForAction } from "../require-member";

// The You page's membership actions (round 3 you.md, r2a section 8). The
// screens are the You agent's; these are the server side. Each one checks the
// signed-in member on the server and returns a plain result, or SESSION_ENDED
// when the session ended while the page was open (the page then sends the
// member to Log in with "Your session ended.", B-D1).

/**
 * The words a member sees when an action fails: the server's own when it wrote
 * them for this case, else this action's (never a generic "something went
 * wrong", r2b). The server's generic failures are not found, a database error
 * and an unexpected one.
 */
const GENERIC_CODES = new Set(["not_found", "db", "error"]);
function say(result: { code?: string; error: string }, words: string): string {
  return !result.code || GENERIC_CODES.has(result.code) ? words : result.error;
}
const NOT_CANCELLED = "Your membership wasn’t cancelled. Try again, or email hello@clubyuppie.com if it keeps happening.";
const STILL_ENDING = "Your membership is still set to end. Try again, or email hello@clubyuppie.com if it keeps happening.";
const NO_BILLING = "We couldn’t open billing. Try again.";
const NOT_DELETED = "Your account wasn’t deleted. Try again, or email hello@clubyuppie.com.";

/** A club event booked after the end date, with its day as the dialogs and the card write it ("Sun 15 Nov"). */
export type BookingAfterEnd = { bookingId: string; title: string; startTime: string; slug: string; when: string };

export type RequestCancelResult =
  | {
      ok: true;
      /** The day access ends, "Thu 12 Nov", the You card's "12 Nov", and the instant behind them (ISO). */
      endsOn: string;
      until: string;
      endsAt: string;
      /** Club events booked after the end date (the D8 warning line): they are cancelled and refunded when it ends. */
      bookingsAfterEnd: BookingAfterEnd[];
    }
  | { ok: false; error: string };

export type CancelPreviewResult =
  | {
      ok: true;
      /** The day access would end ("Thu 12 Nov", and the card's "12 Nov"), from the billing period; null when Stripe could not say. */
      endsOn: string | null;
      until: string | null;
      endsAt: string | null;
      /** Club events booked after that day: cancelled and refunded when it ends (the D8 line in step 1). */
      bookingsAfterEnd: BookingAfterEnd[];
    }
  | { ok: false; error: string };

function withDays(bookings: { bookingId: string; title: string; startTime: string; slug: string }[]): BookingAfterEnd[] {
  return bookings.map((booking) => ({ ...booking, when: dayDate(booking.startTime) }));
}

/** Cancel membership, step 1: what the member would lose, before anything changes. */
export async function getCancelMembershipPreview(): Promise<CancelPreviewResult | SessionEnded> {
  const member = await memberForAction();
  if (!member) return SESSION_ENDED;
  const result = await cancelPreview(member.id);
  if (!result.ok) return { ok: false, error: say(result, NOT_CANCELLED) };
  return {
    ok: true,
    endsOn: result.endsOn,
    until: result.endsAt ? dayMonth(result.endsAt) : null,
    endsAt: result.endsAt,
    bookingsAfterEnd: withDays(result.bookingsAfterEnd),
  };
}

/** Cancel membership, step 2: cancel at the end of the billing period, with the reason chosen in step 2. */
export async function requestCancelMembership(reason: string | null): Promise<RequestCancelResult | SessionEnded> {
  const member = await memberForAction();
  if (!member) return SESSION_ENDED;
  const result = await requestCancel(member.id, typeof reason === "string" ? reason : null);
  if (!result.ok) return { ok: false, error: say(result, NOT_CANCELLED) };
  revalidatePath("/members", "layout");
  return {
    ok: true,
    endsOn: result.endsOn,
    until: dayMonth(result.endsAt),
    endsAt: result.endsAt,
    bookingsAfterEnd: withDays(result.bookingsAfterEnd),
  };
}

/** Keep my membership: undo the cancel before the end date. */
export async function keepMyMembership(): Promise<{ ok: true } | { ok: false; error: string } | SessionEnded> {
  const member = await memberForAction();
  if (!member) return SESSION_ENDED;
  const result = await keepMembership(member.id);
  if (!result.ok) return { ok: false, error: say(result, STILL_ENDING) };
  revalidatePath("/members", "layout");
  return { ok: true };
}

/**
 * Manage and Update card: a Stripe Billing Portal URL to send the browser to
 * (in the app, open it in the system browser). Opens straight on "update
 * payment method" when a payment failed. The GET route ROUTES.billing does the
 * same with a redirect.
 */
export async function getBillingPortalUrl(
  returnPath: string = ROUTES.you,
): Promise<{ ok: true; url: string } | { ok: false; error: string } | SessionEnded> {
  const member = await memberForAction({ allowGated: true });
  if (!member) return SESSION_ENDED;
  const result = await billingPortalUrl(member.id, returnPath);
  return result.ok ? { ok: true, url: result.url } : { ok: false, error: say(result, NO_BILLING) };
}

/**
 * Delete my account (you.md: type "delete" to confirm; brief 5.6). On success
 * the session is signed out and the browser goes to the public home page; the
 * function only returns on failure.
 */
export async function deleteMyAccount(confirmation: string): Promise<{ ok: false; error: string } | SessionEnded> {
  // Open from the ended gate too (its "Delete my account").
  const member = await memberForAction({ allowGated: true, allowMissingPhoto: true });
  if (!member) return SESSION_ENDED;
  if (typeof confirmation !== "string" || confirmation.trim().toLowerCase() !== "delete") {
    return { ok: false, error: "Type delete to confirm." };
  }
  const result = await deleteAccount(member.id);
  if (!result.ok) return { ok: false, error: say(result, NOT_DELETED) };

  const supabase = await createClient();
  // Every device: the account is gone (signOut clears this browser's cookies
  // even when Auth answers that the user is banned).
  await supabase.auth.signOut({ scope: "global" });
  revalidatePath("/", "layout");
  redirect("/");
}
