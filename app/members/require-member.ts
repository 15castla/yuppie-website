import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
export const getMember = cache(async (): Promise<Member | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: member } = await supabase
    .from("members")
    .select(MEMBER_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  return (member as Member | null) ?? null;
});

// Mirrors app/admin/require-admin.ts's shape, but queries through the
// request-scoped (RLS-respecting) client rather than the admin service-role
// client — members should only ever be able to read their own row, and
// every query below is additionally scoped by id as a second layer, not
// relied on as the only one.
export async function requireMember(): Promise<Member> {
  const member = await getMember();

  if (!member) {
    redirect("/member-login");
  }

  return member;
}
