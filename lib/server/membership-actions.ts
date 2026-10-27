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
import { dayDate, londonEndOfDay, pounds } from "./format";
import { later } from "./later";
import { membershipCardData, membershipState, type MemberStateFields } from "./membership";
import type { MembershipCardData } from "@/lib/members/you/types";
import { sendEmail } from "./messages";
import { cardLabelForPaymentMethod } from "./stripe/card";

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; code: string; error: string };

const GENERIC = "Something went wrong. Try again, or email hello@clubyuppie.com if it keeps happening.";

async function loadMember(memberId: string): Promise<MemberRow | null> {
  const { data, error } = await serviceDb().from("members").select(MEMBER_ROW_COLUMNS).eq("id", memberId).maybeSingle<MemberRow>();
  if (error) console.error(`loadMember ${memberId} failed:`, error);
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
  return unixToIso(sub.cancel_at) ?? unixToIso(sub.items?.data?.[0]?.current_period_end);
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

    let sub: Stripe.Subscription;
    try {
      sub = await stripe.subscriptions.update(
        member.stripe_subscription_id,
        { cancel_at_period_end: true },
        { idempotencyKey: `sub-cancel-at-period-end-${member.stripe_subscription_id}-${version(member)}` },
      );
    } catch (err) {
      console.error(`requestCancel: Stripe update failed for member ${memberId}:`, err);
      return fail("stripe", "Your membership wasn’t cancelled. Try again.");
    }
    const endsAt = cancelAtOf(sub);
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
    return unixToIso(sub.items?.data?.[0]?.current_period_end);
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
  const endsAt = member.cancel_at ? new Date(member.cancel_at).toISOString() : await periodEnd(member.stripe_subscription_id);
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
        await stripe.subscriptions.update(
          member.stripe_subscription_id,
          { cancel_at_period_end: false },
          { idempotencyKey: `sub-keep-${member.stripe_subscription_id}-${version(member)}` },
        );
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
export async function deleteAccount(memberId: string): Promise<ActionResult<{ refunded: number }>> {
  try {
    const db = serviceDb();
    const member = await loadMember(memberId);
    if (!member) return fail("not_found", GENERIC);
    if (member.deleted_at) return { ok: true, refunded: 0 };

    if (member.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(member.stripe_subscription_id, {}, { idempotencyKey: `sub-cancel-now-${member.stripe_subscription_id}` });
      } catch (err) {
        const code = stripeErrorCode(err);
        if (code !== "resource_missing") {
          console.error(`deleteAccount: Stripe cancel failed for member ${memberId}:`, err);
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

    // To the address they have now, before it is replaced.
    await sendEmail({ template: "account-deleted", to: member.email, data: {}, dedupeKey: `account-deleted:${memberId}`, refs: { memberId } });

    const now = new Date().toISOString();
    const tombstone = tombstoneEmail(memberId);
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
        deleted_at: now,
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
      try {
        await stripe.subscriptions.cancel(member.stripe_subscription_id, {}, { idempotencyKey: `sub-cancel-now-${member.stripe_subscription_id}` });
        stripeDone = true;
      } catch (err) {
        if (stripeErrorCode(err) !== "resource_missing") {
          console.error(`cancelMemberNow: Stripe failed for member ${memberId}:`, err);
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
    const { data } = await db
      .from("members")
      .update({ membership_status: "cancelled", ended_at: at, ended_reason: member.ended_reason ?? reason })
      .eq("id", memberId)
      .is("ended_at", null)
      .select("id");
    transitioned = Boolean(data?.length);
    endedAt = at;
  } else if (member.membership_status !== "cancelled") {
    await db.from("members").update({ membership_status: "cancelled" }).eq("id", memberId);
  }

  const endedOn = dayDate(endedAt ?? new Date());
  const cancelledBookings = await cancelFutureBookingsForMember(memberId, reason === "account_deleted" ? "account_deleted" : "membership_ended", {
    membershipEndedOn: endedOn,
    email: options.email !== false,
  });

  if (transitioned && reason !== "account_deleted" && options.email !== false) {
    await sendEmail({
      template: "membership-ended",
      to: member.email,
      data: { endedOn, reason },
      dedupeKey: `membership-ended:${memberId}`,
      refs: { memberId },
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
    const { data } = await db
      .from("members")
      .update({ payment_failed_at: failedAt, grace_until: graceUntil })
      .eq("id", memberId)
      .is("payment_failed_at", null)
      .select("payment_failed_at, grace_until");
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
      card: await cardLabelForPaymentMethod(invoice.paymentMethodId),
      triedOn: dayDate(failedAt as string),
      until: dayDate(graceUntil as string),
      updateCardUrl: "/members/billing",
    },
    dedupeKey: `payment-failed:${invoice.id}`,
    refs: { memberId },
  });
  return { graceUntil, emailed: result.status === "sent" };
}

/** invoice.paid: the card works again, so the problem state goes. */
export async function clearMembershipPaymentFailed(memberId: string): Promise<boolean> {
  const { data } = await serviceDb()
    .from("members")
    .update({ payment_failed_at: null, grace_until: null })
    .eq("id", memberId)
    .not("payment_failed_at", "is", null)
    .select("id");
  return Boolean(data?.length);
}

/** customer.subscription.updated: Stripe is the source of truth for cancel_at, and for pause when it changed there. */
export async function syncSubscription(
  memberId: string,
  sub: Stripe.Subscription,
  previous: Record<string, unknown> | undefined,
): Promise<{ cancelAt: string | null; paused: boolean | null }> {
  const db = serviceDb();
  const member = await loadMember(memberId);
  if (!member || member.membership_status === "cancelled") return { cancelAt: null, paused: null };

  const cancelAt = sub.cancel_at_period_end || sub.cancel_at ? cancelAtOf(sub) : null;
  const update: Record<string, unknown> = {};
  if ((member.cancel_at ? new Date(member.cancel_at).getTime() : null) !== (cancelAt ? new Date(cancelAt).getTime() : null)) {
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
