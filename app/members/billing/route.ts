import { NextResponse } from "next/server";

import { ROUTES } from "@/lib/members/routes";
import { billingPortalUrl } from "@/lib/server/membership-actions";
import { requireMember } from "../require-member";

export const dynamic = "force-dynamic";

// GET /members/billing: straight to the Stripe Billing Portal (r2c: the
// payment-failed email's "Update card" links here). Opens on "update payment
// method" when a payment failed. Paused and ended members can open it too.
// ?return=/members/... sets where Stripe sends them back (a members path only).
export async function GET(request: Request) {
  const member = await requireMember({ allowGated: true, allowMissingPhoto: true });
  const wanted = new URL(request.url).searchParams.get("return");
  const returnPath = wanted && /^\/members(\/|$)/.test(wanted) ? wanted : ROUTES.you;
  const result = await billingPortalUrl(member.id, returnPath);
  if (!result.ok) {
    return NextResponse.redirect(new URL(`${ROUTES.you}?billing=unavailable`, request.url), 303);
  }
  return NextResponse.redirect(result.url, 303);
}
