import { getCachedPerks } from "@/components/members/perks-data";
import { getCachedEvents } from "@/components/members/events-data";
import { getCachedFeatureCard, DEFAULT_FEATURE_LABEL } from "@/components/members/feature-card-data";
import { formatEventDayTime } from "@/components/members/ui";
import { AccessView, type ResolvedFeatureCard } from "@/components/members/access-view";

export default async function MembersAccessPage() {
  const [perks, events, featureCard] = await Promise.all([
    getCachedPerks(),
    getCachedEvents(),
    getCachedFeatureCard(),
  ]);
  const access = perks.filter((perk) => perk.type === "access");

  // Resolves the singleton feature_card row's content_type/content_id by
  // cross-referencing the events/perks already fetched above rather than
  // querying feature_card's target row separately. Kept as a
  // discriminated union (rather than flattened into one title/subtitle
  // shape) so AccessView knows what tapping the card should do: open the
  // event page, or open the redemption modal for the perk.
  let resolvedFeatureCard: ResolvedFeatureCard | null = null;
  if (featureCard) {
    const label = featureCard.label || DEFAULT_FEATURE_LABEL[featureCard.content_type];

    if (featureCard.content_type === "event") {
      const event = events.find((event) => event.id === featureCard.content_id);
      if (event) {
        resolvedFeatureCard = {
          kind: "event",
          slug: event.slug,
          title: event.title,
          subtitle: `${formatEventDayTime(event.start_time)}${event.location ? ` · ${event.location}` : ""}`,
          label,
        };
      }
    } else {
      const perk = perks.find((perk) => perk.id === featureCard.content_id);
      if (perk) {
        resolvedFeatureCard = { kind: "perk", perk, label };
      }
    }
  }

  return <AccessView perks={access} featureCard={resolvedFeatureCard} />;
}
