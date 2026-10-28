import "server-only";

// Membership state, worked out from the members row alone (pure: no I/O), so
// every request decides it the same way and on the server.
//
//   active    paying, nothing pending
//   ending    cancel requested: access until cancel_at (members.cancel_at);
//             wins over problem (a cancel during the grace days ends on the grace date)
//   problem   a membership payment failed: access until grace_until (C-D12)
//   paused    membership_status 'paused'
//   cancelled ended: membership_status 'cancelled', or deleted, or cancel_at
//             or grace_until has passed even if no webhook said so yet
//
// paused and cancelled are gated (decision A-D4): requireMember() sends them to
// ROUTES.membership. The strings are the You card's style ("12 Nov", London).

import type { MembershipCardData, MembershipState } from "@/lib/members/you/types";
import { dayMonth } from "./format";

export type MemberStateFields = {
  membership_status: string;
  cancel_at?: string | null;
  payment_failed_at?: string | null;
  grace_until?: string | null;
  paused_at?: string | null;
  ended_at?: string | null;
  deleted_at?: string | null;
};

export type MembershipStateInfo = {
  state: MembershipState;
  /** active: the next billing date, when given ("12 Nov"). */
  renewsOn?: string | null;
  /** ending: the day access ends. cancelled: the day it ended. */
  endsOn?: string | null;
  /** problem: the day the payment failed. */
  failedOn?: string | null;
  /** problem: the last day to update the card (the email says the same date). */
  updateBy?: string | null;
  /** The instant behind endsOn (ending and cancelled), ISO. */
  endsAt?: string | null;
};

function passed(iso: string | null | undefined, now: Date): boolean {
  return Boolean(iso) && new Date(iso as string).getTime() <= now.getTime();
}

function short(iso: string | null | undefined): string | null {
  return iso ? dayMonth(iso) : null;
}

export function membershipState(
  member: MemberStateFields,
  now: Date = new Date(),
  options: { renewsAt?: string | Date | null } = {},
): MembershipStateInfo {
  const endedAt =
    member.ended_at ??
    (passed(member.cancel_at, now) ? member.cancel_at : null) ??
    (member.payment_failed_at && passed(member.grace_until, now) ? member.grace_until : null) ??
    null;

  if (
    member.deleted_at ||
    member.membership_status === "cancelled" ||
    passed(member.cancel_at, now) ||
    (member.payment_failed_at && passed(member.grace_until, now))
  ) {
    const at = endedAt ?? member.deleted_at ?? null;
    return { state: "cancelled", endsOn: short(at), endsAt: at };
  }

  if (member.membership_status === "paused") {
    return { state: "paused" };
  }

  // Ending wins over problem: a member who cancels while a payment has failed
  // is told one date, the grace date their membership now ends on (QA1-01, C-D12).
  if (member.cancel_at) {
    return { state: "ending", endsOn: short(member.cancel_at), endsAt: member.cancel_at };
  }

  if (member.payment_failed_at) {
    return { state: "problem", failedOn: short(member.payment_failed_at), updateBy: short(member.grace_until) };
  }

  const renewsAt = options.renewsAt ? new Date(options.renewsAt) : null;
  return { state: "active", renewsOn: renewsAt && !Number.isNaN(renewsAt.getTime()) ? dayMonth(renewsAt) : null };
}

/** Paused and ended members see the gate and nothing else (A-D4). */
export function isGated(state: MembershipState): boolean {
  return state === "paused" || state === "cancelled";
}

/** Can this member book a club event? Active, ending and problem can (brief 5.3). */
export function canBook(state: MembershipState): boolean {
  return state === "active" || state === "ending" || state === "problem";
}

/** The You card's data (lib/members/you/types.ts) for a state. The card's button is the You page's to add. */
export function membershipCardData(info: MembershipStateInfo): MembershipCardData {
  switch (info.state) {
    case "active":
      return { state: "active", renews: info.renewsOn ?? null };
    case "ending":
      return { state: "ending", endsOn: info.endsOn ?? null };
    case "problem":
      return { state: "problem", failedOn: info.failedOn ?? null, updateBy: info.updateBy ?? null };
    case "paused":
      return { state: "paused" };
    case "cancelled":
      return { state: "cancelled", endsOn: info.endsOn ?? null };
  }
}
