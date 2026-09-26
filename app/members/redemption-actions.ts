"use server";

import { createClient } from "@/lib/supabase/server";

export type RedemptionStatus = {
  full_name: string | null;
  avatar_url: string | null;
  membership_status: string;
};

// Backs RedeemCard.tsx, shown to venue staff as proof of current
// membership. Deliberately reads straight from the members table rather
// than going through require-member.ts's getMember, which is wrapped in
// React's cache() and would just return whatever was already fetched
// earlier in this request. A static card is trivially screenshotted and
// handed to someone who isn't a member, so the whole point of this
// action is a fresh read at the exact moment the card opens, not the one
// from whenever the page originally loaded.
export async function getRedemptionStatus(): Promise<RedemptionStatus | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: member } = await supabase
    .from("members")
    .select("full_name, avatar_url, membership_status")
    .eq("id", user.id)
    .maybeSingle();

  return (member as RedemptionStatus | null) ?? null;
}
