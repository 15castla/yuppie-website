"use server";

import { currentPhotoUrl } from "@/lib/server/photos";
import { createClient } from "@/lib/supabase/server";

export type RedemptionStatus = {
  full_name: string | null;
  /**
   * The member's current photo (approved or pending) from the private bucket, through a short-lived signed URL
   * (lib/server/photos), never the old public avatar_url. Only for an active membership: the card shows no photo
   * otherwise.
   */
  photo_url: string | null;
  membership_status: string;
  // When this read happened (ISO, the server's clock). The redeem card prints
  // it as "Checked 09:41" so an old screenshot gives itself away, and a member
  // cannot change it by changing their phone's clock.
  checked_at: string;
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
    .select("full_name, membership_status")
    .eq("id", user.id)
    .maybeSingle<{ full_name: string | null; membership_status: string }>();

  if (!member) return null;
  const photoUrl = member.membership_status === "active" ? await currentPhotoUrl(user.id, "full") : null;
  return { full_name: member.full_name, membership_status: member.membership_status, photo_url: photoUrl, checked_at: new Date().toISOString() };
}
