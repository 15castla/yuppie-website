import "server-only";

// Everything that changes a membership: the member's own cancel, keep and
// delete, the billing portal, the admin's pause, resume and cancel now, and
// the endings driven by Stripe and the memberships job. Each function checks
// the state itself (callers check who is asking), uses an idempotency key on
// every Stripe write, and returns a result rather than throwing.

import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import { ROUTES } from "@/lib/members/routes";
import { absoluteUrl, PAYMENT_GRACE_DAYS, tombstoneEmail } from "./config";
import { cancelFutureBookingsForMember, bookingsAfter, type CancelledFutureBooking } from "./bookings";
import { MEMBER_ROW_COLUMNS, errorMessage, serviceDb, stripeErrorCode, type EndedReason, type MemberRow } from "./db";
import { deleteMemberPhotos } from "./photos";
import { leaveOpenInviteForDeletion } from "./plans";
import { dayDate, londonEndOfDay, pounds } from "./format";
import { later } from "./later";
import { membershipCardData, membershipState, type MemberStateFields } from "./membership";
import type { MembershipCardData } from "@/lib/members/you/types";
import { sendEmail } from "./messages";
import { cardLabelForMembership } from "./stripe/card";
import { subscriptionPaidUp } from "./stripe/subscription";
import { periodEndSeconds } from "./stripe/period";

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; code: string; error: string };

const GENERIC = "Something went wrong. Try again, or email hello@clubyuppie.com if it keeps happening.";

/** The member row; null when there is none. A database error throws (every caller reports it, and a webhook is sent again). */
async function loadMember(memberId: string): Promise<MemberRow | null> {
  const { data, error } = await serviceDb().from("members").select(MEMBER_ROW_COLUMNS).eq("id", memberId).maybeSingle<MemberRow>();
  if (error) throw new Error(`loading member ${memberId}: ${error.message}`);
  return data ?? null;
}

/** The idempotency key part that changes whenever the member row changes, so a double click is one Stripe write and a later, different request is another. */
function version(member: MemberRow): string {
  return member.updated_at ? String(new Date(member.updated_at).getTime()) : "0";
}

function fail(code: string, error: string): { ok: false; code: string; error: string } {
  return { ok: false, code, error };
}

function unixToIso(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/** When a subscription set to cancel at period end will end. */
function cancelAtOf(sub: Stripe.Subscription): string | null {
  return unixToIso(sub.cancel_at) ?? unixToIso(periodEndSeconds(sub));
}

// ---------------------------------------------------------------------------
// The member's own actions
// ---------------------------------------------------------------------------

/** Cancel at the end of the billing period (two-step Cancel membership). Saves the reason. */
export async function requestCancel(
  memberId: string,
  reason: string | null,
): Promise<ActionResult<{ endsAt: string; endsOn: string; bookingsAfterEnd: { bookingId: string; title: string; startTime: string; slug: string }[] }>> {
  try {
    const member = await loadMember(memberId);
    if (!member) return fail("not_found", GENERIC);
    const state = membershipState(member).state;
    if (state === "ending" && member.cancel_at) {
      const endsAt = new Date(member.cancel_at).toISOString();
      return { ok: true, endsAt, endsOn: dayDate(endsAt), bookingsAfterEnd: await bookingsAfter(memberId, endsAt) };
    }
    if (state === "paused" || state === "cancelled") return fail("not_active", "Your membership isn’t active, so there’s nothing to cancel.");
    if (!member.stripe_subscription_id) return fail("no_subscription", "We couldn’t find a subscription on your account. Email hello@clubyuppie.com.");

    // A payment has failed (C-D12): the membership already ends on the grace date unless the card is fixed,
    // so a cancel now ends it on that date, not later (QA1-01). Stripe stops at that moment: no attempts after.
    const graceEnd = state === "problem" && member.grace_until ? new Date(member.grace_until) : null;

    let endsAt: string | null;
    try {
      if (graceEnd) {
        await stripe.subscriptions.update(
          member.stripe_subscription_id,
          { cancel_at: Math.floor(graceEnd.getTime() / 1000), proration_behavior: "none" },
          { idempotencyKey: `sub-cancel-at-grace-${member.stripe_subscription_id}-${version(member)}` },
        );
        // The stored date is the grace date itself (the payment-failed email's and the card's date).
        endsAt = graceEnd.toISOString();
      } else {
        const sub = await stripe.subscriptions.update(
          member.stripe_subscription_id,
          { cancel_at_period_end: true, proration_behavior: "none" },
          { idempotencyKey: `sub-cancel-at-period-end-${member.stripe_subscription_id}-${version(member)}` },
        );
        endsAt = cancelAtOf(sub);
      }
    } catch (err) {
      console.error(`requestCancel: Stripe update failed for member ${memberId}:`, err);
      return fail("stripe", "Your membership wasn’t cancelled. Try again.");
    }
    if (!endsAt) return fail("stripe", "Your membership wasn’t cancelled. Try again.");

    const requestedAt = new Date().toISOString();
    const { error } = await serviceDb()
      .from("members")
      .update({ cancel_at: endsAt, cancel_requested_at: requestedAt, cancel_reason: reason?.trim().slice(0, 500) || null })
      .eq("id", memberId);
    if (error) {
      console.error(`requestCancel: saving cancel_at failed for member ${memberId}:`, error);
      return fail("db", GENERIC);
    }

    const after = await bookingsAfter(memberId, endsAt);
    later(`cancel-requested email for ${memberId}`, () =>
      sendEmail({
        template: "cancel-requested",
        to: member.email,
        data: { endsOn: dayDate(endsAt), bookingsAfterEnd: after.length > 0, keepUrl: ROUTES.you },
        dedupeKey: `cancel-requested:${memberId}:${requestedAt}`,
        refs: { memberId },
      }),
    );
    return { ok: true, endsAt, endsOn: dayDate(endsAt), bookingsAfterEnd: after };
  } catch (err) {
    console.error(`requestCancel ${memberId} failed:`, err);
    return fail("error", GENERIC);
  }
}

/** The current billing period's end, from Stripe (null when unknown). */
async function periodEnd(subscriptionId: string | null): Promise<string | null> {
  if (!subscriptionId) return null;
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    return unixToIso(periodEndSeconds(sub));
  } catch (err) {
    console.error(`periodEnd: reading subscription ${subscriptionId} failed:`, err);
    return null;
  }
}

/**
 * Cancel membership, step 1 (before anything changes): the day access would
 * end, and the club events booked after it that would be cancelled and
 * refunded (the D8 warning line, "Sunrise Wellness Retreat, Sun 15 Nov, is
 * after this date.").
 */
export async function cancelPreview(
  memberId: string,
): Promise<ActionResult<{ endsAt: string | null; endsOn: string | null; bookingsAfterEnd: { bookingId: string; title: string; startTime: string; slug: string }[] }>> {
  const member = await loadMember(memberId);
  if (!member) return fail("not_found", GENERIC);
  const state = membershipState(member).state;
  // In the payment problem state a cancel ends the membership on the grace date (QA1-01).
  const endsAt = member.cancel_at
    ? new Date(member.cancel_at).toISOString()
    : state === "problem" && member.grace_until
      ? new Date(member.grace_until).toISOString()
      : await periodEnd(member.stripe_subscription_id);
  return {
    ok: true,
    endsAt,
    endsOn: endsAt ? dayDate(endsAt) : null,
    bookingsAfterEnd: endsAt ? await bookingsAfter(memberId, endsAt) : [],
  };
}

/** The You card's data with real dates (lib/members/you/types.ts MembershipCardData): the renewal date from Stripe when active. */
export async function membershipCardFor(member: MemberStateFields & { stripe_subscription_id: string | null }): Promise<MembershipCardData> {
  const info = membershipState(member);
  if (info.state !== "active") return membershipCardData(info);
  return membershipCardData(membershipState(member, new Date(), { renewsAt: await periodEnd(member.stripe_subscription_id) }));
}

/** Keep my membership: undo a cancel request before it takes effect. */
export async function keepMembership(memberId: string): Promise<ActionResult> {
  try {
    const member = await loadMember(memberId);
    if (!member) return fail("not_found", GENERIC);
    const state = membershipState(member).state;
    if (state === "active") return { ok: true };
    if (state !== "ending") return fail("not_ending", "There’s no cancellation to undo.");
    if (member.stripe_subscription_id) {
      try {
        // Both ways a subscription can be set to end go (QA3-11): cancel at period end, and a cancel_at moment
        // (a cancel made in the payment grace days). Read Stripe first: it takes one of the two per request.
        // proration_behavior none on every cancel change (N4): no proration is ever created.
        let sub = await stripe.subscriptions.retrieve(member.stripe_subscription_id);
        if (sub.cancel_at_period_end) {
          sub = await stripe.subscriptions.update(
            member.stripe_subscription_id,
            { cancel_at_period_end: false, proration_behavior: "none" },
            { idempotencyKey: `sub-keep-${member.stripe_subscription_id}-${version(member)}` },
          );
        }
        if (sub.cancel_at) {
          sub = await stripe.subscriptions.update(
            member.stripe_subscription_id,
            { cancel_at: "", proration_behavior: "none" },
            { idempotencyKey: `sub-keep-cancel-at-${member.stripe_subscription_id}-${version(member)}` },
          );
        }
        if (sub.cancel_at || sub.cancel_at_period_end) throw new Error(`subscription ${sub.id} is still set to cancel`);
      } catch (err) {
        console.error(`keepMembership: Stripe update failed for member ${memberId}:`, err);
        return fail("stripe", "Your membership is still set to end. Try again.");
      }
    }
    const { error } = await serviceDb()
      .from("members")
      .update({ cancel_at: null, cancel_requested_at: null, cancel_reason: null })
      .eq("id", memberId);
    if (error) return fail("db", GENERIC);
    return { ok: true };
  } catch (err) {
    console.error(`keepMembership ${memberId} failed:`, err);
    return fail("error", GENERIC);
  }
}

/** A Stripe Billing Portal session (Manage, Update card). Opens on "update payment method" when a payment failed. */
export async function billingPortalUrl(memberId: string, returnPath: string = ROUTES.you): Promise<ActionResult<{ url: string }>> {
  try {
    const member = await loadMember(memberId);
    if (!member) return fail("not_found", GENERIC);
    if (!member.stripe_customer_id) return fail("no_customer", "We couldn’t find your billing details. Email hello@clubyuppie.com.");
    const problem = membershipState(member).state === "problem";
    const safePath = returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : ROUTES.you;
    const session = await stripe.billingPortal.sessions.create(
      {
        customer: member.stripe_customer_id,
        return_url: absoluteUrl(safePath),
        // The portal configuration the release creates (release/stripe-setup.md). Unset: Stripe's default
        // configuration, which must then be saved once in the Dashboard (live has none today).
        ...(process.env.STRIPE_PORTAL_CONFIGURATION_ID ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID } : {}),
        ...(problem ? { flow_data: { type: "payment_method_update" as const } } : {}),
      },
      { idempotencyKey: `portal-${member.stripe_customer_id}-${problem ? "card" : "manage"}-${safePath}-${Math.floor(Date.now() / 60000)}` },
    );
    return { ok: true, url: session.url };
  } catch (err) {
    console.error(`billingPortalUrl ${memberId} failed:`, err);
    return fail("stripe", "We couldn’t open billing. Try again.");
  }
}

function avatarPath(url: string | null): string | null {
  if (!url) return null;
  const marker = "/storage/v1/object/public/member-media/";
  const i = url.indexOf(marker);
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length).split("?")[0]) : null;
}

/**
 * Delete my account (brief 5.6). Cancels the subscription now, cancels and
 * refunds future bookings, removes the photo, emails the current address,
 * then anonymises the members row (kept so booking and payment records
 * survive), frees the email for a new application, and bans the auth user
 * with its email moved to the tombstone. The caller signs the session out.
 */
/** `by`: who asked for it. "club" is the admin's Delete member: the account-deleted email then does not say the member asked. */
export async function deleteAccount(memberId: string, options: { by?: "member" | "club" } = {}): Promise<ActionResult<{ refunded: number }>> {
  try {
    const db = serviceDb();
    const member = await loadMember(memberId);
    if (!member) return fail("not_found", GENERIC);
    const tombstone = tombstoneEmail(memberId);
    // Done already. (Marked but not finished, after a failure part way: carry on from here.)
    if (member.deleted_at && member.email === tombstone) return { ok: true, refunded: 0 };

    // Mark the account first (QA3-05): Stripe's customer.subscription.deleted, which the cancel below causes,
    // may arrive before this finishes, and must find a deleted account (reason kept, no emails, bookings
    // account_deleted). The row is gated from here on.
    const before = { deleted_at: member.deleted_at, ended_reason: member.ended_reason };
    const { error: markError } = await db
      .from("members")
      .update({ deleted_at: member.deleted_at ?? new Date().toISOString(), ended_reason: "account_deleted" })
      .eq("id", memberId);
    if (markError) {
      console.error(`deleteAccount: marking member ${memberId} failed:`, markError);
      return fail("db", GENERIC);
    }

    if (member.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(member.stripe_subscription_id, {}, { idempotencyKey: `sub-cancel-now-${member.stripe_subscription_id}` });
      } catch (err) {
        const code = stripeErrorCode(err);
        if (code !== "resource_missing") {
          console.error(`deleteAccount: Stripe cancel failed for member ${memberId}:`, err);
          // Nothing else has changed: undo the mark, so the member is not shut out while still paying.
          const { error: undoError } = await db.from("members").update(before).eq("id", memberId);
          if (undoError) console.error(`deleteAccount: undoing the mark for member ${memberId} failed:`, undoError);
          return fail("stripe", "Your account wasn’t deleted. Try again, or email hello@clubyuppie.com.");
        }
      }
    }

    const cancelled = await cancelFutureBookingsForMember(memberId, "account_deleted");

    const path = avatarPath(member.avatar_url);
    if (path) {
      const { error } = await db.storage.from("member-media").remove([path]);
      if (error) console.error(`deleteAccount: removing the photo failed for member ${memberId}:`, error);
    }
    // Stage 2: the private photos, and Open Invite and Messages (hosted plans cancelled, places given up, chats
    // left, messages removed, blocks, Updates and switches deleted). Both never throw.
    await deleteMemberPhotos(memberId);
    await leaveOpenInviteForDeletion(memberId);

    // To the address they have now, before it is replaced.
    await sendEmail({
      template: "account-deleted",
      to: member.email,
      data: options.by === "club" ? { byClub: true } : {},
      dedupeKey: `account-deleted:${memberId}`,
      refs: { memberId },
    });

    const now = new Date().toISOString();
    const { error: anonError } = await db
      .from("members")
      .update({
        full_name: null,
        phone: null,
        employer: null,
        role_title: null,
        bio: null,
        avatar_url: null,
        email: tombstone,
        membership_status: "cancelled",
        ended_reason: "account_deleted",
        ended_at: member.ended_at ?? now,
        deleted_at: member.deleted_at ?? now,
        cancel_at: null,
        cancel_requested_at: null,
        cancel_reason: null,
        payment_failed_at: null,
        grace_until: null,
      })
      .eq("id", memberId);
    if (anonError) {
      console.error(`deleteAccount: anonymising member ${memberId} failed:`, anonError);
      return fail("db", GENERIC);
    }

    // Free the email for a new application: the applications unique index
    // ignores only declined rows, so the old row's email moves to a tombstone
    // of its own (and its other personal fields are cleared where allowed).
    // The application is found by the address it was made with (the member's
    // email unless they changed it) and by the Stripe customer that approval
    // copied from it onto the member.
    const email = member.email.trim().toLowerCase();
    const { data: byEmail } = await db.from("applications").select("id, email").eq("email", email);
    const { data: byCustomer } = member.stripe_customer_id
      ? await db.from("applications").select("id, email").eq("stripe_customer_id", member.stripe_customer_id)
      : { data: [] as { id: string; email: string }[] };
    const apps = [...new Map([...(byEmail ?? []), ...(byCustomer ?? [])].map((a) => [a.id, a])).values()];
    for (const app of apps) {
      const { error } = await db.from("applications").update({ email: tombstoneEmail(app.id) }).eq("id", app.id);
      if (error) console.error(`deleteAccount: freeing application ${app.id} failed:`, error);
      const { error: scrubError } = await db
        .from("applications")
        .update({ full_name: "Deleted member", phone: null, employer: null, role_title: null, linkedin_url: null, instagram_username: null })
        .eq("id", app.id);
      if (scrubError) console.error(`deleteAccount: clearing application ${app.id} failed (left as is):`, scrubError);
    }
    for (const app of apps) {
      const { error } = await db.from("invited_emails").update({ email: tombstoneEmail(`invite-${app.id}`) }).eq("application_id", app.id);
      if (error) console.error(`deleteAccount: freeing the invite for application ${app.id} failed:`, error);
    }

    // members.id references auth.users with ON DELETE CASCADE (baseline;
    // check the live dump), so deleting the auth user would delete the row and
    // its bookings. Ban it and move its email instead.
    const { error: authError } = await db.auth.admin.updateUserById(memberId, {
      email: tombstone,
      email_confirm: true,
      ban_duration: "876000h",
      user_metadata: {},
    });
    if (authError) console.error(`deleteAccount: banning auth user ${memberId} failed:`, authError);

    return { ok: true, refunded: cancelled.filter((c) => c.refund.status === "succeeded" || c.refund.status === "pending").length };
  } catch (err) {
    console.error(`deleteAccount ${memberId} failed:`, err);
    return fail("error", GENERIC);
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function pauseMember(memberId: string, options: { stripe: boolean }): Promise<ActionResult<{ stripe: boolean }>> {
  try {
    const member = await loadMember(memberId);
    if (!member) return fail("not_found", "Member not found.");
    const state = membershipState(member).state;
    if (state === "cancelled") return fail("ended", "This membership has ended, so it can’t be paused.");
    if (state === "paused") return { ok: true, stripe: false };
    let stripeDone = false;
    if (options.stripe && member.stripe_subscription_id) {
      try {
        await stripe.subscriptions.update(
          member.stripe_subscription_id,
          { pause_collection: { behavior: "void" } },
          { idempotencyKey: `sub-pause-${member.stripe_subscription_id}-${version(member)}` },
        );
        stripeDone = true;
      } catch (err) {
        console.error(`pauseMember: Stripe failed for member ${memberId}:`, err);
        return fail("stripe", `Stripe didn’t pause the subscription, so nothing changed: ${errorMessage(err)}`);
      }
    }
    const { error } = await serviceDb()
      .from("members")
      .update({ membership_status: "paused", paused_at: new Date().toISOString() })
      .eq("id", memberId);
    if (error) return fail("db", "Saving the pause failed.");
    return { ok: true, stripe: stripeDone };
  } catch (err) {
    console.error(`pauseMember ${memberId} failed:`, err);
    return fail("error", "Something went wrong pausing that member.");
  }
}

export async function resumeMember(memberId: string, options: { stripe: boolean }): Promise<ActionResult<{ stripe: boolean }>> {
  try {
    const member = await loadMember(memberId);
    if (!member) return fail("not_found", "Member not found.");
    if (member.membership_status !== "paused") return fail("not_paused", "This member isn’t paused.");
    let stripeDone = false;
    if (options.stripe && member.stripe_subscription_id) {
      try {
        await stripe.subscriptions.update(
          member.stripe_subscription_id,
          { pause_collection: "" },
          { idempotencyKey: `sub-resume-${member.stripe_subscription_id}-${version(member)}` },
        );
        stripeDone = true;
      } catch (err) {
        console.error(`resumeMember: Stripe failed for member ${memberId}:`, err);
        return fail("stripe", `Stripe didn’t resume the subscription, so nothing changed: ${errorMessage(err)}`);
      }
    }
    const { error } = await serviceDb().from("members").update({ membership_status: "active", paused_at: null }).eq("id", memberId);
    if (error) return fail("db", "Saving the resume failed.");
    return { ok: true, stripe: stripeDone };
  } catch (err) {
    console.error(`resumeMember ${memberId} failed:`, err);
    return fail("error", "Something went wrong resuming that member.");
  }
}

/** Admin Cancel membership: immediate (B-D23). With stripe, the subscription is cancelled now too. */
export async function cancelMemberNow(
  memberId: string,
  options: { stripe: boolean },
): Promise<ActionResult<{ stripe: boolean; cancelledBookings: number }>> {
  try {
    const member = await loadMember(memberId);
    if (!member) return fail("not_found", "Member not found.");
    let stripeDone = false;
    if (options.stripe && member.stripe_subscription_id) {
      // The reason first (QA3-05): Stripe's customer.subscription.deleted may arrive before this returns, and
      // its membership-ended email must say the club ended it.
      const marked = !member.ended_reason;
      if (marked) {
        const { error } = await serviceDb().from("members").update({ ended_reason: "admin_cancelled" }).eq("id", memberId).is("ended_reason", null);
        if (error) return fail("db", "Saving the cancellation failed, so nothing changed.");
      }
      try {
        await stripe.subscriptions.cancel(member.stripe_subscription_id, {}, { idempotencyKey: `sub-cancel-now-${member.stripe_subscription_id}` });
        stripeDone = true;
      } catch (err) {
        if (stripeErrorCode(err) !== "resource_missing") {
          console.error(`cancelMemberNow: Stripe failed for member ${memberId}:`, err);
          if (marked) await serviceDb().from("members").update({ ended_reason: null }).eq("id", memberId).is("ended_at", null);
          return fail("stripe", `Stripe didn’t cancel the subscription, so nothing changed: ${errorMessage(err)}`);
        }
      }
    }
    const ended = await endMembership(memberId, "admin_cancelled");
    return { ok: true, stripe: stripeDone, cancelledBookings: ended.cancelledBookings.length };
  } catch (err) {
    console.error(`cancelMemberNow ${memberId} failed:`, err);
    return fail("error", "Something went wrong cancelling that membership.");
  }
}

// ---------------------------------------------------------------------------
// Endings and payment trouble (Stripe webhooks, the memberships job)
// ---------------------------------------------------------------------------

/**
 * End a membership: status cancelled, ended_at, ended_reason; cancel and
 * refund future bookings (A-D8); send membership-ended once. Safe to call
 * again (the second call only sweeps any booking left over).
 *
 * A reason already on the row wins (Delete my account and the admin's Cancel
 * now mark it before they cancel in Stripe, QA3-05). A deleted account gets no
 * membership-ended or booking emails, and its bookings say account_deleted.
 * A database error throws (the webhook answers 500 and Stripe sends it again).
 */
export async function endMembership(
  memberId: string,
  reason: EndedReason,
  options: { endedAt?: string | null; email?: boolean } = {},
): Promise<{ transitioned: boolean; endedAt: string | null; cancelledBookings: CancelledFutureBooking[] }> {
  const db = serviceDb();
  const member = await loadMember(memberId);
  if (!member) return { transitioned: false, endedAt: null, cancelledBookings: [] };

  let transitioned = false;
  let endedAt = member.ended_at;
  if (!member.ended_at) {
    const at = options.endedAt && new Date(options.endedAt).getTime() <= Date.now() ? options.endedAt : new Date().toISOString();
    const stored: EndedReason = member.deleted_at ? "account_deleted" : member.ended_reason ?? reason;
    const { data, error } = await db
      .from("members")
      .update({ membership_status: "cancelled", ended_at: at, ended_reason: stored })
      .eq("id", memberId)
      .is("ended_at", null)
      .select("id");
    if (error) throw new Error(`ending member ${memberId}: ${error.message}`);
    transitioned = Boolean(data?.length);
    endedAt = at;
  } else if (member.membership_status !== "cancelled") {
    const { error } = await db.from("members").update({ membership_status: "cancelled" }).eq("id", memberId);
    if (error) throw new Error(`ending member ${memberId}: ${error.message}`);
  }

  // As it is now: a Delete my account that marked the row meanwhile wins.
  const now = (await loadMember(memberId)) ?? member;
  endedAt = now.ended_at ?? endedAt;
  const deleted = Boolean(now.deleted_at) || now.ended_reason === "account_deleted";
  const effective: EndedReason = deleted ? "account_deleted" : now.ended_reason ?? reason;
  const endedOn = dayDate(endedAt ?? new Date());
  const cancelledBookings = await cancelFutureBookingsForMember(memberId, deleted ? "account_deleted" : "membership_ended", {
    membershipEndedOn: endedOn,
    email: options.email !== false && !deleted,
  });

  if (transitioned && !deleted && options.email !== false) {
    later(`membership-ended email for ${memberId}`, async () => {
      // Checked again at send time: an account deleted in the meantime gets the account-deleted email only.
      const latest = await loadMember(memberId);
      const why = latest?.ended_reason ?? effective;
      if (!latest || latest.deleted_at || why === "account_deleted") return;
      await sendEmail({
        template: "membership-ended",
        to: latest.email,
        data: { endedOn, reason: why },
        dedupeKey: `membership-ended:${memberId}`,
        refs: { memberId },
      });
    });
  }
  return { transitioned, endedAt, cancelledBookings };
}

/** invoice.payment_failed for a membership: first failure sets the dates; one email per invoice (C-D12). */
export async function recordMembershipPaymentFailed(
  memberId: string,
  invoice: { id: string; amount: number; paymentMethodId?: string | null; failedAt?: string | null },
): Promise<{ graceUntil: string | null; emailed: boolean }> {
  const db = serviceDb();
  const member = await loadMember(memberId);
  if (!member) return { graceUntil: null, emailed: false };
  if (member.membership_status === "cancelled" || member.deleted_at) return { graceUntil: null, emailed: false };

  let failedAt = member.payment_failed_at;
  let graceUntil = member.grace_until;
  if (!failedAt) {
    failedAt = invoice.failedAt ?? new Date().toISOString();
    graceUntil = londonEndOfDay(failedAt, PAYMENT_GRACE_DAYS).toISOString();
    const { data, error } = await db
      .from("members")
      .update({ payment_failed_at: failedAt, grace_until: graceUntil })
      .eq("id", memberId)
      .is("payment_failed_at", null)
      .select("payment_failed_at, grace_until");
    if (error) throw new Error(`saving the payment failure for member ${memberId}: ${error.message}`);
    if (!data?.length) {
      // Another delivery set them first: use what it saved.
      const fresh = await loadMember(memberId);
      failedAt = fresh?.payment_failed_at ?? failedAt;
      graceUntil = fresh?.grace_until ?? graceUntil;
    }
  }

  const result = await sendEmail({
    template: "payment-failed",
    to: member.email,
    data: {
      amount: pounds(invoice.amount || 1000),
      card: await cardLabelForMembership(invoice.paymentMethodId, member.stripe_subscription_id, member.stripe_customer_id),
      triedOn: dayDate(failedAt as string),
      until: dayDate(graceUntil as string),
      updateCardUrl: "/members/billing",
    },
    dedupeKey: `payment-failed:${invoice.id}`,
    refs: { memberId },
  });
  return { graceUntil, emailed: result.status === "sent" };
}

/** invoice.paid: the card works again, so the problem state goes. A database error throws. */
export async function clearMembershipPaymentFailed(memberId: string): Promise<boolean> {
  const { data, error } = await serviceDb()
    .from("members")
    .update({ payment_failed_at: null, grace_until: null })
    .eq("id", memberId)
    .not("payment_failed_at", "is", null)
    .select("id");
  if (error) throw new Error(`clearing the payment failure for member ${memberId}: ${error.message}`);
  return Boolean(data?.length);
}

const seconds = (iso: string | null | undefined) => (iso ? Math.floor(new Date(iso).getTime() / 1000) : null);

/**
 * customer.subscription.updated: Stripe is the source of truth for cancel_at, and for pause when it changed
 * there. `sub` is the subscription as Stripe has it NOW (the caller re-reads it: events arrive in any order,
 * so a late "cancel at period end" must not bring back a cancel the member undid, QA3-03). `previous` is the
 * event's previous_attributes, used only to see that a pause was lifted in Stripe.
 */
export async function syncSubscription(
  memberId: string,
  sub: Stripe.Subscription,
  previous: Record<string, unknown> | undefined,
): Promise<{ cancelAt: string | null; paused: boolean | null }> {
  const db = serviceDb();
  const member = await loadMember(memberId);
  if (!member || member.membership_status === "cancelled" || member.deleted_at) return { cancelAt: null, paused: null };

  const cancelAt = sub.cancel_at_period_end || sub.cancel_at ? cancelAtOf(sub) : null;
  const update: Record<string, unknown> = {};
  // Compared to the second: Stripe keeps seconds, the grace date ends at 23:59:59.999.
  if (seconds(member.cancel_at) !== seconds(cancelAt)) {
    update.cancel_at = cancelAt;
    if (cancelAt && !member.cancel_requested_at) update.cancel_requested_at = new Date().toISOString();
    if (!cancelAt) {
      update.cancel_requested_at = null;
      update.cancel_reason = null;
    }
  }

  let paused: boolean | null = null;
  if (sub.pause_collection && member.membership_status === "active") {
    update.membership_status = "paused";
    update.paused_at = new Date().toISOString();
    paused = true;
  } else if (!sub.pause_collection && member.membership_status === "paused" && previous && "pause_collection" in previous) {
    // Resumed in Stripe. Only on an explicit change: a member paused here
    // without touching Stripe stays paused when another field changes.
    update.membership_status = "active";
    update.paused_at = null;
    paused = false;
  }

  if (Object.keys(update).length) {
    const { error } = await db.from("members").update(update).eq("id", memberId);
    if (error) throw error;
  }
  return { cancelAt, paused };
}

export type RetryPaymentResult = {
  status: "not_problem" | "no_card" | "paid" | "already_paid" | "declined" | "in_progress";
  invoices?: string[];
  error?: string;
};

/**
 * A member whose membership payment failed saved a card (the billing portal: customer.updated with a new
 * invoice default, or payment_method.attached). The subscription carries its own default card, which wins
 * over the customer's, so the new card would never be charged (QA3-02): make it the subscription's default,
 * then pay the open invoice now. Every Stripe write has an idempotency key. On success the problem clears
 * here (the invoice.paid that follows does the same). A declined card leaves the problem state; Stripe's
 * invoice.payment_failed for the same invoice sends no second email. Stripe errors other than a decline throw
 * (the webhook answers 500 and Stripe sends it again).
 */
export async function retryMembershipPayment(memberId: string, paymentMethodId: string | null): Promise<RetryPaymentResult> {
  const member = await loadMember(memberId);
  if (!member || member.deleted_at || member.membership_status === "cancelled" || !member.payment_failed_at || !member.stripe_subscription_id) {
    return { status: "not_problem" };
  }
  if (!paymentMethodId) return { status: "no_card" };
  const subId = member.stripe_subscription_id;

  await stripe.subscriptions.update(
    subId,
    { default_payment_method: paymentMethodId },
    { idempotencyKey: `sub-default-pm-${subId}-${paymentMethodId}` },
  );

  const open = await stripe.invoices.list({ subscription: subId, status: "open", limit: 10 });
  if (!open.data.length) {
    // Nothing owed: paid already (invoice.paid missed or still on its way).
    if (await subscriptionPaidUp(await stripe.subscriptions.retrieve(subId, { expand: ["latest_invoice"] }))) {
      await clearMembershipPaymentFailed(memberId);
      return { status: "already_paid" };
    }
    return { status: "not_problem" };
  }

  const paid: string[] = [];
  for (const invoice of [...open.data].sort((a, b) => a.created - b.created)) {
    if (!invoice.id) continue;
    try {
      const result = await stripe.invoices.pay(invoice.id, { payment_method: paymentMethodId }, { idempotencyKey: `invoice-pay-${invoice.id}-${paymentMethodId}` });
      if (result.status === "paid") paid.push(invoice.id);
    } catch (err) {
      const code = stripeErrorCode(err);
      const type = err && typeof err === "object" && "type" in err ? String((err as { type: unknown }).type) : "";
      if (code === "idempotency_key_in_use") return { status: "in_progress" };
      if (type === "StripeCardError" || type === "card_error" || code === "card_declined" || code === "invoice_payment_intent_requires_action") {
        return { status: "declined", invoices: paid, error: errorMessage(err) };
      }
      if (code === "invoice_not_open") continue;
      throw err;
    }
  }
  if (paid.length) await clearMembershipPaymentFailed(memberId);
  return { status: "paid", invoices: paid };
}

/**
 * customer.updated with a new default card, for a member whose payment has NOT failed (N1). Subscriptions made
 * before this release carry their own default_payment_method, which wins over the customer's, so the next
 * renewal would charge the old card: when the subscription has its own card and it is not the new default,
 * the new one becomes the subscription's card. A subscription with no card of its own already follows the
 * customer's default, so it is left alone. Stripe errors throw (the webhook answers 500 and Stripe retries).
 */
export async function syncSubscriptionCard(memberId: string, paymentMethodId: string | null): Promise<{ status: "updated" | "no_change" | "not_member" | "no_card"; from?: string | null }> {
  const member = await loadMember(memberId);
  if (!member || member.deleted_at || member.membership_status === "cancelled" || !member.stripe_subscription_id) return { status: "not_member" };
  if (!paymentMethodId) return { status: "no_card" };
  const sub = await stripe.subscriptions.retrieve(member.stripe_subscription_id);
  if (sub.status === "canceled" || sub.status === "incomplete_expired") return { status: "not_member" };
  const own = typeof sub.default_payment_method === "string" ? sub.default_payment_method : sub.default_payment_method?.id ?? null;
  if (!own || own === paymentMethodId) return { status: "no_change", from: own };
  await stripe.subscriptions.update(
    sub.id,
    { default_payment_method: paymentMethodId },
    { idempotencyKey: `sub-default-pm-${sub.id}-${paymentMethodId}` },
  );
  return { status: "updated", from: own };
}
