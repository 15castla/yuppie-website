// What the You page needs, fetched once: the signed-in member, the next
// billing date from Stripe, and the real server actions. Shared by /members/you
// and /members/you/photo (the same page with the Change photo sheet open).
// Not a route: only page.tsx files are.

import { flags } from "@/lib/members/flags";
import { ROUTES } from "@/lib/members/routes";
import { detectShellMode } from "@/lib/members/shell-mode";
import { displayPhone, firstNameOf, legalLines, memberSince, shortDate } from "@/lib/members/you/format";
import { settingsRowsFor } from "@/lib/members/you/settings";
import type { MembershipCardData, MembershipState } from "@/lib/members/you/types";
import type { YouViewProps } from "@/components/members/you/you-view";
import { cancelMembership, getNextBillingDate, signOutMember } from "../profile/actions";
import { requireMember } from "../require-member";

// members.membership_status is active, paused or cancelled. "Ending" and
// "payment failed" are drawn but nothing reads them yet (see
// lib/members/you/types.ts), so the live card never shows them.
function stateFor(status: string): MembershipState {
  if (status === "active") return "active";
  if (status === "cancelled") return "cancelled";
  return "paused";
}

export async function loadYou(): Promise<YouViewProps> {
  const member = await requireMember();
  const [mode, nextBillingDate] = await Promise.all([detectShellMode(), getNextBillingDate(member.stripe_subscription_id)]);

  const state = stateFor(member.membership_status);
  const renews = shortDate(nextBillingDate);
  const membership: MembershipCardData = { state, renews: state === "active" ? renews : null };

  // Cancel membership is real for an active membership with a subscription:
  // cancelMembership() sets it to stop at the end of the billing period.
  const canCancel = member.membership_status === "active" && Boolean(member.stripe_subscription_id);

  return {
    firstName: firstNameOf(member.full_name),
    photoUrl: member.avatar_url,
    details: { fullName: member.full_name, email: member.email, phone: displayPhone(member.phone) },
    memberSince: memberSince(member.created_at),
    membership,
    settingsRows: settingsRowsFor(flags, mode),
    changePhotoHref: flags.photoGate ? ROUTES.youPhoto : null,
    legal: legalLines(new Date().getFullYear()),
    signOut: signOutMember,
    cancel: canCancel ? cancelMembership : null,
    cancelCopy: { endsOn: renews },
  };
}
