import { createClient } from "@/lib/supabase/server";
import { requireMember } from "../require-member";
import { getNextBillingDate } from "./actions";
import { ProfileView, type BookingHistoryRow } from "@/components/members/profile-view";

export default async function MembersProfilePage() {
  const member = await requireMember();
  const supabase = await createClient();

  const [{ data: bookingsData, error }, nextBillingDate] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, status, event:events(id, title, start_time)")
      .eq("member_id", member.id)
      .order("start_time", { referencedTable: "events", ascending: false }),
    getNextBillingDate(member.stripe_subscription_id),
  ]);

  if (error) {
    console.error(`Failed to load booking history for member ${member.id}:`, error);
  }

  const bookingHistory = (bookingsData ?? []) as unknown as BookingHistoryRow[];

  return (
    <ProfileView
      member={member}
      bookingHistory={bookingHistory}
      nextBillingDate={nextBillingDate}
    />
  );
}
