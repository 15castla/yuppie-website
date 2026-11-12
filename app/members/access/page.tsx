import { requireMember } from "@/app/members/require-member";
import { getCachedPerks } from "@/components/members/perks-data";
import { getCachedEvents } from "@/components/members/events-data";
import { getCachedFeatureCard, DEFAULT_FEATURE_LABEL } from "@/components/members/feature-card-data";
import { withoutExamplePartners } from "@/components/members/discounts/example-partners";
import { eventBadge, eventWhen, firstSentence } from "@/components/members/discounts/perk-model";
import { AccessView, type ResolvedFeatureCard } from "@/components/members/access-view";
import { flags } from "@/lib/members/flags";
import { nominateCard } from "@/lib/server/nominations";

export default async function MembersAccessPage() {
  // requireMember() is cached with the layout's login check (one fetch) and
  // runs alongside the data fetches. It is here so the photo gate
  // (flags.photoGate, see require-member.ts) sees this page too.
  const [member, allPerks, events, featureCard] = await Promise.all([
    requireMember(),
    getCachedPerks(),
    getCachedEvents(),
    getCachedFeatureCard(),
  ]);
  // Nominate a friend's card (12 Nov 2026). A failed read leaves the card off rather than the page.
  const nominate = flags.nominations ? await nominateCard(member.id).catch((err) => (console.error("Access: the nominate card failed:", err), null)) : null;

  // The placeholder partners still in the table are not shown to members (see
  // example-partners.ts), and a feature card pointing at one shows nothing
  // rather than a placeholder: it is resolved against this list.
  const perks = withoutExamplePartners(allPerks);
  const access = perks.filter((perk) => perk.type === "access");

  // Resolves the singleton feature_card row's content_type/content_id by
  // cross-referencing the events/perks already fetched above rather than
  // querying feature_card's target row separately. Kept as a
  // discriminated union (rather than flattened into one title/subtitle
  // shape) so AccessView knows what tapping the card should do: open the
  // event page, or open the redemption modal for the perk.
  let resolvedFeatureCard: ResolvedFeatureCard | null = null;
  if (featureCard) {
    const label = featureCard.label?.trim() || DEFAULT_FEATURE_LABEL[featureCard.content_type];

    if (featureCard.content_type === "event") {
      const event = events.find((event) => event.id === featureCard.content_id);
      if (event) {
        resolvedFeatureCard = {
          kind: "event",
          slug: event.slug,
          title: event.title,
          meta: [eventWhen(event.start_time), event.location].filter(Boolean).join(" · "),
          line: firstSentence(event.description),
          badge: eventBadge(event.price_pence),
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

  return <AccessView perks={access} featureCard={resolvedFeatureCard} nominate={nominate} />;
}
