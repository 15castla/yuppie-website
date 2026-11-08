import "server-only";

// Who is applying (Albert, 8 Nov 2026): decided on the server before /apply takes a card or an application.
//
//   new       nobody with this email: apply as normal
//   waiting   an application with this email is waiting for a decision: "We'll be in touch soon"
//   member    a current member has this email, or the approved application that holds it belongs to one (for
//             example a member who changed their email since): "You're already a member." (Sign in); never a
//             second membership
//   moved     the approved application that holds this email belongs to a membership that has ended, but that
//             account uses a newer email now: they are asked to apply with that one, so approval finds their
//             account (a login is found by email) and starts it again instead of making a second one
//   rejoin    a membership that has ended has this email: they apply again (Albert: "If they end they would need
//             to reapply"); the old application that holds the email, if any, is superseded when the new one goes
//             in (applications.superseded_at), and approving it starts the membership again on the same account
//             (approve_application_and_create_member, migration 20261108090000_rejoin)
//
// Ended means the end is recorded (membership_status 'cancelled'), the same test as the database function. A
// cancel date or grace period that has passed but is not yet recorded (the memberships job runs every 15 minutes,
// and asks Stripe first) still counts as current. Approval also asks Stripe that the old subscription is over
// before charging (approvalBlock), since an admin can end a membership here without ending it in Stripe.
//
// Emails match exactly, ignoring case. The ilike filter only narrows the rows (PostgREST reads * as a wildcard
// there too); the exact comparison is made here.

import { serviceDb } from "./db";
import { membershipState, type MemberStateFields } from "./membership";
import { currentSubscription, subscriptionEnded } from "./stripe/subscription";

export type ApplicantStanding =
  | { kind: "new" }
  | { kind: "waiting" }
  | { kind: "member" }
  | { kind: "moved" }
  | { kind: "rejoin"; supersede: string | null };

type MemberRow = MemberStateFields & { id: string; email: string };

const MEMBER_FIELDS = "id, email, membership_status, cancel_at, payment_failed_at, grace_until, paused_at, ended_at, deleted_at";

/** Narrows an ilike filter to this email (% _ \ escaped; * is a wildcard to PostgREST, so callers compare exactly). */
function pattern(email: string): string {
  return email.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function same(a: string | null | undefined, email: string): boolean {
  return (a ?? "").trim().toLowerCase() === email;
}

/** The end is recorded: the same test as approve_application_and_create_member. */
export function membershipEnded(member: Pick<MemberStateFields, "membership_status">): boolean {
  return member.membership_status === "cancelled";
}

async function membersWithEmail(email: string): Promise<MemberRow[]> {
  const { data, error } = await serviceDb()
    .from("members")
    .select(MEMBER_FIELDS)
    .ilike("email", pattern(email))
    .is("deleted_at", null);
  if (error) throw new Error(`members by email: ${error.message}`);
  return ((data ?? []) as MemberRow[]).filter((m) => same(m.email, email));
}

export async function applicantStanding(rawEmail: string): Promise<ApplicantStanding> {
  const email = rawEmail.trim().toLowerCase();
  const db = serviceDb();

  // A current member with this email, whatever their applications say.
  const byEmail = await membersWithEmail(email);
  if (byEmail.some((m) => !membershipEnded(m))) return { kind: "member" };

  // The application that holds the email (one at most: applications_email_unique_active).
  const { data: apps, error: appError } = await db
    .from("applications")
    .select("id, email, status, stripe_customer_id, created_at")
    .ilike("email", pattern(email))
    .neq("status", "rejected")
    .is("superseded_at", null)
    .order("created_at", { ascending: false });
  if (appError) throw new Error(`applicantStanding: applications: ${appError.message}`);
  const live = ((apps ?? []) as { id: string; email: string; status: string; stripe_customer_id: string | null }[]).find(
    (a) => same(a.email, email),
  );

  if (!live) return byEmail.length ? { kind: "rejoin", supersede: null } : { kind: "new" };
  if (live.status !== "approved") return { kind: "waiting" };

  // Approved: whose membership? The member with this email, or the one approval made from it (approval copies the
  // application's Stripe customer onto the member, which stays when a member changes their email).
  if (byEmail.length) return { kind: "rejoin", supersede: live.id };
  if (live.stripe_customer_id) {
    const { data, error } = await db
      .from("members")
      .select(MEMBER_FIELDS)
      .eq("stripe_customer_id", live.stripe_customer_id)
      .is("deleted_at", null)
      .limit(1);
    if (error) throw new Error(`applicantStanding: members by customer: ${error.message}`);
    const owner = ((data ?? []) as MemberRow[])[0];
    if (owner && membershipEnded(owner)) return { kind: "moved" };
  }
  // A current member under another email, or an approved application with no account behind it: treated as a
  // member (Sign in, or email us), never a second application.
  return { kind: "member" };
}

export type ApprovalBlock = "current" | "deleted" | "mismatch" | "subscription";

/**
 * Before approval charges anything (Albert, 8 Nov 2026: never two memberships). `userId` is the login for the
 * application's email (null: none yet); approve_application_and_create_member finds the member by it.
 *
 *   current       a current member has this email, or this login
 *   deleted       this login's account was deleted
 *   subscription  this login's membership ended, but its old Stripe subscription is not over (an admin can end a
 *                 membership here without Stripe): starting it again replaces that subscription's id, which would
 *                 leave it billing with nothing watching it
 *   mismatch      a member whose membership ended has this email, but signs in with another (or no) login:
 *                 approval would make a second account
 */
export async function approvalBlock(rawEmail: string, userId: string | null): Promise<ApprovalBlock | null> {
  const email = rawEmail.trim().toLowerCase();
  const byEmail = await membersWithEmail(email);
  if (byEmail.some((m) => !membershipEnded(m))) return "current";

  if (userId) {
    const { data, error } = await serviceDb()
      .from("members")
      .select("membership_status, deleted_at, stripe_subscription_id")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(`approvalBlock: ${error.message}`);
    if (data) {
      if (data.deleted_at) return "deleted";
      if (!membershipEnded(data)) return "current";
      if (data.stripe_subscription_id && !subscriptionEnded(await currentSubscription(data.stripe_subscription_id))) {
        return "subscription";
      }
    }
  }

  if (byEmail.length && !byEmail.some((m) => m.id === userId)) return "mismatch";
  return null;
}

/** The ended member this email belongs to, if any (the admin card's "Rejoining" line). */
export async function endedMemberByEmail(rawEmail: string): Promise<{ id: string; endedAt: string | null } | null> {
  let members: MemberRow[];
  try {
    members = await membersWithEmail(rawEmail.trim().toLowerCase());
  } catch {
    return null;
  }
  const member = members.find(membershipEnded);
  if (!member) return null;
  return { id: member.id, endedAt: member.ended_at ?? membershipState(member).endsAt ?? null };
}
