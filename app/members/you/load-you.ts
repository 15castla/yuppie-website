// What the You page needs, fetched once: the signed-in member, the membership
// card with its real dates (membershipCardFor: the renewal date from Stripe,
// the end date of a cancel, the failed payment and the update-by date), the
// club events booked after an end date (the D8 warning line), and the real
// server actions. Shared by /members/you and /members/you/photo (the same page
// with the Change photo sheet open). Not a route: only page.tsx files are.

import { flags } from "@/lib/members/flags";
import { ROUTES } from "@/lib/members/routes";
import { detectShellMode } from "@/lib/members/shell-mode";
import { displayPhone, firstNameOf, legalLines, memberSince } from "@/lib/members/you/format";
import { settingsRowsFor } from "@/lib/members/you/settings";
import type { MembershipCardData } from "@/lib/members/you/types";
import { bookingsAfter } from "@/lib/server/bookings";
import { dayDate } from "@/lib/server/format";
import { membershipCardFor } from "@/lib/server/membership-actions";
import type { YouViewProps } from "@/components/members/you/you-view";
import { signOutMember } from "../profile/actions";
import { requireMember } from "../require-member";
import { deleteMyAccount, getCancelMembershipPreview, keepMyMembership, requestCancelMembership } from "./actions";

/** /members/billing sent the member back: the portal did not open. The portal's own words. */
const BILLING_ERROR = "We couldn’t open billing. Try again.";

export async function loadYou({ billingUnavailable = false }: { billingUnavailable?: boolean } = {}): Promise<YouViewProps> {
  const member = await requireMember();
  const [mode, card] = await Promise.all([detectShellMode(), membershipCardFor(member)]);

  // Manage and Update card: the billing portal (/members/billing redirects to Stripe). In the app the link
  // is marked external, the way the members area marks every outside link, so the native shell hands it on
  // rather than replacing the app's own page (needs_device_check: what the shell does with it).
  const external = mode === "app";
  let membership: MembershipCardData = card;
  if (card.state === "active") membership = { ...card, action: { label: "Manage", href: ROUTES.billing, external } };
  if (card.state === "problem") membership = { ...card, action: { label: "Update card", href: ROUTES.billing, external } };
  if (card.state === "ending") {
    const after = member.cancel_at ? await bookingsAfter(member.id, new Date(member.cancel_at).toISOString()) : [];
    membership = {
      ...card,
      afterEnd: after.map((booking) => ({ title: booking.title, when: dayDate(booking.startTime) })),
      action: { label: "Keep my membership" },
    };
  }

  // Cancel needs a subscription to set to end; without one there is no Cancel link.
  const canCancel = Boolean(member.stripe_subscription_id);

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
    keep: keepMyMembership,
    cancelPreview: canCancel ? getCancelMembershipPreview : null,
    cancelMembership: canCancel ? requestCancelMembership : null,
    deleteAccount: deleteMyAccount,
    billingError: billingUnavailable ? BILLING_ERROR : null,
  };
}
