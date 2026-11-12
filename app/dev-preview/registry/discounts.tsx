// EXAMPLE DATA: invented people and places, never shown to real members (flag off, 404 in production)
//
// Preview screens for Discounts and Access. OWNED BY THE DISCOUNTS BUILDER.
// One id per screen: "discounts-<name>" and "access-<name>". The partners,
// areas, offers and badges are the approved design's (v3 pages_disc.py): invented
// places (Northgate, Marlow, Calder), never real ones. The perks are shaped as
// the real `partner_perks` rows are ("Food & Drink" with an ampersand, a title-case
// custom category) so the views' own tidying is what the shots show. The two
// logos (a pair of chevrons, a sun) are plain example marks standing in for a
// partner's upload, not Club Yuppie drawings.
//
// The page's states are drawn by the real views (DiscountsView, AccessView,
// DiscountsLoading, AccessLoading, RedeemCardView) fed these example rows.

import { AccessView, type ResolvedFeatureCard } from "@/components/members/access-view";
import { AccessLoading, DiscountsLoading } from "@/components/members/discounts/loading-views";
import { DiscountsView } from "@/components/members/discounts-view";
import type { PartnerPerk } from "@/components/members/mock-perks";
import { RedeemCardView, type RedeemPhase } from "@/components/members/RedeemCard";
import { redeemPerkFor } from "@/components/members/discounts/perk-model";
import { examplePhoto } from "@/lib/members/mock/example-photos";
import type { PreviewScreen } from "./types";

// ---- example logos (data URIs, so nothing is fetched) ---------------------------------------------------------------
// Stroke widths are the approved art's (v3 pages_disc.py LOGOS): 3.2 for the chevrons, 3 for the sun.
const svg = (body: string, stroke: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="#1B1512" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`,
  )}`;
const LOGO_FORGE = svg('<path d="M5 15 16 6l11 9"/><path d="M5 26 16 17l11 9"/>', 3.2);
const LOGO_LUMEN = svg(
  '<circle cx="16" cy="16" r="5.5" fill="#1B1512"/><path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M25.2 6.8l-2.8 2.8M9.6 22.4l-2.8 2.8"/>',
  3,
);

// ---- example discounts ---------------------------------------------------------------------------------------------
let order = 0;
function discount(
  name: string,
  category: string,
  area: string,
  headline: string,
  badge: string | null = null,
  logo: string | null = null,
): PartnerPerk {
  order += 1;
  return {
    id: `d-${order}`,
    name,
    category,
    area,
    type: "discount",
    access_kind: null,
    headline,
    badge,
    logo_url: logo,
    display_order: order,
  };
}

const FOOD = "Food & Drink"; // as the database has it; the view prints "Food and drink"

const SEED: PartnerPerk[] = [
  discount("Bellina Trattoria", FOOD, "Northgate", "20% off supper, Monday to Thursday", "20%"),
  discount("Forge Fitness Studios", "Fitness", "Marlow", "15% off class packs", "15%", LOGO_FORGE),
  discount("Hoxton Barbers Co.", "Grooming", "Calder", "10% off any cut, any day", "10%"),
  discount("Lumen Sauna House", "Wellness", "Northgate", "25% off a two-hour sauna session", "25%", LOGO_LUMEN),
  discount("Petra Rooftop Bar", FOOD, "Marlow", "Two cocktails for one, before 20:00", "2-for-1"),
];

const MORE: PartnerPerk[] = [
  discount("Corner Table Kitchen", FOOD, "Calder", "10% off the whole bill, Tuesday to Thursday", "10%"),
  discount("Ironside Gym", "Fitness", "Calder", "20% off a monthly pass", "20%"),
  discount("Foxglove Bakehouse", FOOD, "Marlow", "A free coffee with any pastry"),
  discount("Halden Yoga Rooms", "Wellness", "Northgate", "15% off your first ten classes", "15%"),
  discount("The Copper Pot", FOOD, "Northgate", "15% off lunch, Monday to Friday", "15%"),
  discount("Ashby & Rowe Barbers", "Grooming", "Northgate", "15% off a cut and shave", "15%"),
  discount("Tidewater Swim Club", "Fitness", "Marlow", "A free day pass for you and a friend"),
  discount("Salt Yard Grill", FOOD, "Calder", "20% off steaks on Sundays", "20%"),
  discount("Marlow Pilates Loft", "Wellness", "Marlow", "10% off five-class packs", "10%"),
  discount("Sable Nail Studio", "Beauty", "Calder", "15% off any treatment", "15%"),
  discount("Quill Coffee Roasters", FOOD, "Northgate", "Two flat whites for the price of one", "2-for-1"),
  discount("Hartley Cold Plunge", "Wellness", "Calder", "20% off a plunge and sauna", "20%"),
  discount("The Velvet Razor", "Grooming", "Marlow", "A free hot towel with every shave"),
  discount("Noor Kitchen", FOOD, "Marlow", "10% off takeaway orders over £20", "10%"),
  discount("Birch Hair Rooms", "Beauty", "Northgate", "10% off a cut and blow dry", "10%"),
];
const TWENTY = [...SEED, ...MORE];

// The long-text cases: a name that wraps, a long area, a long offer, a long custom category, a badge longer than the pill minimum.
const LONG: PartnerPerk[] = [
  discount("Marlow Old Town Pilates and Barre Studio", "Wellness", "Marlow", "10% off a five-class pack", "10%"),
  discount(
    "Northgate Market Hall Dining Room",
    FOOD,
    "Northgate Market Hall, Upper Mill Street and the Old Wharf",
    "A free glass of house wine with any main course",
    "Free glass",
  ),
  discount(
    "Bellina Trattoria",
    FOOD,
    "Northgate",
    "20% off supper, Monday to Thursday, with a free dessert on your birthday week",
    "20%",
  ),
  discount("Calder Riverside Hair and Skin Rooms", "Beauty, Hair and Skincare", "Calder", "15% off any treatment", "15%"),
  discount("Foxglove Bakehouse", FOOD, "Marlow", "Free entry to the Saturday tasting table", "Free entry"),
];

// ---- example access perks -------------------------------------------------------------------------------------------
function access(
  name: string,
  kind: NonNullable<PartnerPerk["access_kind"]>,
  area: string,
  headline: string,
  badge: string | null = null,
): PartnerPerk {
  order += 1;
  return {
    id: `a-${order}`,
    name,
    category: null,
    area,
    type: "access",
    access_kind: kind,
    headline,
    badge,
    logo_url: null,
    display_order: order,
  };
}

const ACCESS: PartnerPerk[] = [
  access("Petra Rooftop Bar", "skip_queue", "Marlow", "Straight in on Friday and Saturday nights"),
  access("Casa Fiora", "members_club", "Northgate", "Use the lounge any weekday afternoon"),
  access("The Vault", "members_club", "Calder", "On the guest list on Thursdays, name at the door"),
  access("Early access to the next event", "first_dibs", "Club Yuppie events", "Book 24 hours before it opens to everyone"),
  access("Harewood House", "invite_only", "Marlow", "Private dinners, by invitation from us"),
];

const ACCESS_LONG: PartnerPerk[] = [
  access("Petra Rooftop Bar", "skip_queue", "Marlow", "Straight in on Friday and Saturday nights"),
  access(
    "The Northgate Wine Cellar and Reading Room",
    "skip_queue",
    "Northgate Market Hall, Upper Mill Street and the Old Wharf",
    "Skip the queue, Thursday to Saturday, and a table for four held until 20:30 if you book by 17:00",
  ),
  access("Casa Fiora", "members_club", "Northgate", "Use the lounge any weekday afternoon"),
  access("The Vault", "members_club", "Calder", "On the guest list on Thursdays, name at the door"),
  access("Calder Riverside Boat Club, Lower Terrace", "members_club", "Calder", "A day pass for you and one guest"),
  access("Early access to the next event", "first_dibs", "Club Yuppie events", "Book 24 hours before it opens to everyone"),
  access("Harewood House", "invite_only", "Marlow", "Private dinners, by invitation from us"),
  access("The Marlow Observatory Supper Rooms", "invite_only", "Marlow", "A seat at the long table, twice a year"),
];

// ---- the spotlight card, in the three kinds it can be -----------------------------------------------------------------
const SPOT_ACCESS: ResolvedFeatureCard = { kind: "perk", perk: ACCESS[1], label: "Featured access" };
const SPOT_DISCOUNT: ResolvedFeatureCard = { kind: "perk", perk: SEED[3], label: "Featured discount" };
const SPOT_EVENT: ResolvedFeatureCard = {
  kind: "event",
  slug: "rooftop-social",
  title: "Rooftop Social",
  meta: "Fri 30 Oct, 19:00 · The Mews Terrace",
  line: "Drinks on the terrace. Included with your membership.",
  badge: "Included",
  label: "Featured event",
};
const SPOT_CUSTOM: ResolvedFeatureCard = { kind: "perk", perk: ACCESS[4], label: "This week only" };

// ---- the redeem card's states -------------------------------------------------------------------------------------------
const MEMBER_PHASE: RedeemPhase = {
  kind: "active",
  name: "Sam Taylor",
  photoUrl: examplePhoto("S"),
  checked: "09:41",
};

function redeemPhase(state: string): RedeemPhase {
  switch (state) {
    case "loading":
      return { kind: "loading" };
    case "ended":
      return { kind: "ended" };
    case "other":
      return { kind: "other" };
    case "error":
      return { kind: "error" };
    case "nophoto":
      return { ...MEMBER_PHASE, photoUrl: null } as RedeemPhase;
    case "longname":
      return { ...MEMBER_PHASE, name: "Bartholomew-Alexander Featherstonehaugh-Smythe" } as RedeemPhase;
    default:
      return MEMBER_PHASE;
  }
}

const REDEEM_STATES = ["active", "ended", "other", "error", "loading", "nophoto", "longname"] as const;

// ---- the screens ----------------------------------------------------------------------------------------------------------

const ALL_FOUR = ["Food and drink", "Fitness", "Grooming", "Wellness"];

export const discountsScreens: PreviewScreen[] = [
  {
    id: "discounts-page",
    title: "Discounts: the page",
    states: ["default", "wellness", "filter-empty", "empty", "loading", "one", "twenty", "twenty-food", "long"],
    tab: "discounts",
    defaultFlags: ["openInvite", "concierge"],
    render: ({ state }) => {
      switch (state) {
        // A chosen chip scrolled into view (Wellness is the fifth chip, off the right edge on a phone).
        case "wellness":
          return <DiscountsView perks={SEED} initialCategory="Wellness" />;
        // The safety net: chips from a fixed list with Grooming empty (cannot happen with chips from the real categories).
        case "filter-empty":
          return (
            <DiscountsView
              perks={SEED.filter((perk) => perk.category !== "Grooming")}
              categories={ALL_FOUR}
              initialCategory="Grooming"
            />
          );
        case "empty":
          return <DiscountsView perks={[]} />;
        case "loading":
          return <DiscountsLoading />;
        // One category: nothing to filter, so no chips.
        case "one":
          return <DiscountsView perks={SEED.slice(0, 1)} />;
        case "twenty":
          return <DiscountsView perks={TWENTY} />;
        case "twenty-food":
          return <DiscountsView perks={TWENTY} initialCategory="Food and drink" />;
        case "long":
          return <DiscountsView perks={LONG} />;
        default:
          return <DiscountsView perks={SEED} />;
      }
    },
  },
  {
    id: "discounts-redeem",
    title: "Discounts: the redeem card",
    states: REDEEM_STATES,
    tab: "discounts",
    defaultFlags: ["openInvite", "concierge"],
    render: ({ state }) => (
      <>
        <DiscountsView perks={SEED} />
        <RedeemCardView phase={redeemPhase(state)} perk={redeemPerkFor(SEED[0])} />
      </>
    ),
  },
  {
    id: "discounts-redeem-long",
    title: "Discounts: the redeem card, a long offer",
    states: ["active"],
    tab: "discounts",
    defaultFlags: ["openInvite", "concierge"],
    render: () => (
      <>
        <DiscountsView perks={LONG} />
        <RedeemCardView phase={MEMBER_PHASE} perk={redeemPerkFor(LONG[1])} />
      </>
    ),
  },
  {
    id: "access-page",
    title: "Access: the page",
    states: [
      "default",
      "nospot",
      "one",
      "spot-event",
      "spot-discount",
      "spot-custom",
      "spot-only",
      "empty",
      "loading",
      "long",
    ],
    tab: "access",
    defaultFlags: ["openInvite", "concierge"],
    render: ({ state }) => {
      switch (state) {
        case "nospot":
          return <AccessView perks={ACCESS} featureCard={null} />;
        // One item, no spotlight.
        case "one":
          return <AccessView perks={[ACCESS[1]]} featureCard={null} />;
        case "spot-event":
          return <AccessView perks={ACCESS} featureCard={SPOT_EVENT} />;
        case "spot-discount":
          return <AccessView perks={ACCESS} featureCard={SPOT_DISCOUNT} />;
        // The admin's own label replaces the default; the pill grows to fit.
        case "spot-custom":
          return <AccessView perks={ACCESS} featureCard={SPOT_CUSTOM} />;
        // A spotlight and no access perks at all.
        case "spot-only":
          return <AccessView perks={[]} featureCard={SPOT_ACCESS} />;
        case "empty":
          return <AccessView perks={[]} featureCard={null} />;
        case "loading":
          return <AccessLoading />;
        case "long":
          return <AccessView perks={ACCESS_LONG} featureCard={SPOT_CUSTOM} />;
        default:
          return <AccessView perks={ACCESS} featureCard={SPOT_ACCESS} />;
      }
    },
  },
  {
    id: "access-redeem",
    title: "Access: the redeem card",
    states: REDEEM_STATES,
    tab: "access",
    defaultFlags: ["openInvite", "concierge"],
    render: ({ state }) => (
      <>
        <AccessView perks={ACCESS} featureCard={SPOT_ACCESS} />
        <RedeemCardView phase={redeemPhase(state)} perk={redeemPerkFor(ACCESS[0])} />
      </>
    ),
  },
];
