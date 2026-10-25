import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { flags } from "@/lib/members/flags";
import { ROUTES } from "@/lib/members/routes";
import type { MemberSummary } from "@/components/members/shell/types";

export type Member = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  employer: string | null;
  role_title: string | null;
  bio: string | null;
  avatar_url: string | null;
  membership_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
};

const MEMBER_COLUMNS =
  "id, full_name, email, phone, employer, role_title, bio, avatar_url, membership_status, stripe_customer_id, stripe_subscription_id, created_at";

// Non-redirecting check, for pages that need to know whether a valid
// member session exists without forcing a redirect on failure (e.g.
// app/member-login/page.tsx, which needs to redirect *away* to /members
// when a session already exists, and otherwise just render the login
// form rather than bouncing to itself).
//
// The user id comes from getClaims() (the verified JWT's `sub`) rather
// than getUser(): with asymmetric signing keys that's a local check, not a
// round trip to Supabase Auth (see lib/supabase/middleware.ts). The
// members row is still read through the RLS-scoped client, so a forged id
// couldn't read anyone else's row anyway. app/admin/require-admin.ts
// deliberately stays on getUser().
export const getMember = cache(async (): Promise<Member | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || !userId) {
    return null;
  }

  const { data: member } = await supabase
    .from("members")
    .select(MEMBER_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  return (member as Member | null) ?? null;
});

// What the shell draws of the member: first name and photo. Cached through
// getMember(), so the layout's streamed photo slot and the page's own
// requireMember() are one fetch per request. Never throws: the shell paints
// an empty slot rather than failing the page (the page's own requireMember()
// is what enforces login).
export const getMemberSummary = cache(async (): Promise<MemberSummary | null> => {
  try {
    const member = await getMember();
    if (!member) return null;
    return {
      firstName: member.full_name?.trim().split(/\s+/)[0] ?? "",
      photoUrl: member.avatar_url,
    };
  } catch {
    return null;
  }
});

export type RequireMemberOptions = {
  // The photo gate's escape hatch. Only the photo page itself, the actions
  // that save a photo, and the layout's login check pass this.
  allowMissingPhoto?: boolean;
};

// Mirrors app/admin/require-admin.ts's shape, but queries through the
// request-scoped (RLS-respecting) client rather than the admin service-role
// client, since members should only ever be able to read their own row, and
// every query below is additionally scoped by id as a second layer, not
// relied on as the only one.
//
// THE PHOTO GATE HOOK (flags.photoGate, off until the photo flow exists).
// Every members page calls requireMember() as its first line, so this is the
// one place that sees every page and knows which page it is: a layout cannot
// see the pathname, so a gate there would either miss pages or redirect the
// photo page to itself. When the flag is on and the member has no photo, this
// redirects to the gate (ROUTES.photo). The gate page, the actions that save
// a photo, and the layout's own login check (app/members/layout.tsx) pass
// { allowMissingPhoto: true }. A page that never calls requireMember() is
// not gated, so every page does (events, discounts and access were given the
// call for this). A member whose photo the club removes has avatar_url null
// again and meets the gate at their next screen.
export async function requireMember(options: RequireMemberOptions = {}): Promise<Member> {
  const member = await getMember();

  if (!member) {
    redirect("/member-login");
  }

  if (flags.photoGate && !options.allowMissingPhoto && !member.avatar_url) {
    redirect(ROUTES.photo);
  }

  return member;
}
