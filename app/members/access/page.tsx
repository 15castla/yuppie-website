import { getCachedPerks } from "@/components/members/perks-data";
import { getCachedEvents } from "@/components/members/events-data";
import { AccessView } from "@/components/members/access-view";

export default async function MembersAccessPage() {
  const [perks, events] = await Promise.all([getCachedPerks(), getCachedEvents()]);
  const access = perks.filter((perk) => perk.type === "access");
  const featuredEvent = events.find((event) => event.is_invite_only_feature) ?? null;

  return <AccessView perks={access} featuredEvent={featuredEvent} />;
}
