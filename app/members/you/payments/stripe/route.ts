import { NextResponse } from "next/server";

import { paidPlansShown } from "@/app/members/open-invite/guard";
import { ROUTES } from "@/lib/members/routes";
import { detectShellMode } from "@/lib/members/shell-mode";
import { getPaidLink } from "@/lib/server/plan-payments";
import { requireMember } from "../../../require-member";

export const dynamic = "force-dynamic";

// GET /members/you/payments/stripe: "Continue to Stripe" (Get paid) and "Manage on Stripe" (15 Nov 2026). Makes the
// host's connected account the first time, then a one-use link to Stripe's hosted onboarding (or, with ?manage=1 once
// the details are in, the host's Stripe dashboard) and sends them there.
//   ?from=post   back to the post form afterwards (default: You > Payments)
// On the web Stripe sends them back to that page (?getpaid=back), and an expired link comes back here for a new
// one. In the app, Stripe's pages open in the in-app browser (Stripe's onboarding does not work inside the app's
// web view), so they come back to /get-paid, a page that says to close it.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") === "post" ? "post" : "payments";
  const backPath = from === "post" ? ROUTES.openInviteNew : ROUTES.youPayments;
  if (!paidPlansShown()) return NextResponse.redirect(new URL(ROUTES.you, request.url), 303);
  const member = await requireMember();
  const app = (await detectShellMode()) === "app";
  const origin = url.origin;
  const back = app ? `${origin}/get-paid` : `${origin}${backPath}?getpaid=back`;
  const again = app ? `${origin}/get-paid?expired=1` : `${origin}/members/you/payments/stripe?from=${from}`;
  try {
    const link = await getPaidLink({ id: member.id, email: member.email }, url.searchParams.get("manage") === "1", back, again);
    return NextResponse.redirect(link, 303);
  } catch (err) {
    console.error(`Get paid: the Stripe link for ${member.id} failed:`, err);
    return NextResponse.redirect(new URL(`${backPath}?getpaid=error`, request.url), 303);
  }
}
