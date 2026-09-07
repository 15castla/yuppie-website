// UI-only for this pass. Discounts and Access are really the same
// underlying thing, a partner venue with a perk attached, just differently
// framed — kept as one shape here (type: "discount" | "access") so that
// when this becomes real (a partner_venues table with admin tooling), it's
// a clean swap to one table with a type column rather than two systems.
export type PartnerPerk = {
  id: string;
  name: string;
  category: "Food & Drink" | "Fitness" | "Grooming" | "Wellness";
  area: string;
  type: "discount" | "access";
  access_kind?: "skip_queue" | "members_club" | "first_dibs" | "invite_only";
  headline: string;
  badge?: string;
};

export const MOCK_PERKS: PartnerPerk[] = [
  {
    id: "bellina-trattoria",
    name: "Bellina Trattoria",
    category: "Food & Drink",
    area: "Soho",
    type: "discount",
    headline: "20% off food, Mon–Thu",
    badge: "20%",
  },
  {
    id: "forge-fitness-studios",
    name: "Forge Fitness Studios",
    category: "Fitness",
    area: "Shoreditch",
    type: "discount",
    headline: "1 free class, then 15% off packages",
    badge: "15%",
  },
  {
    id: "hoxton-barbers-co",
    name: "Hoxton Barbers Co.",
    category: "Grooming",
    area: "Hoxton",
    type: "discount",
    headline: "10% off every visit",
    badge: "10%",
  },
  {
    id: "lumen-sauna-house",
    name: "Lumen Sauna House",
    category: "Wellness",
    area: "Bermondsey",
    type: "discount",
    headline: "25% off single sessions",
    badge: "25%",
  },
  {
    id: "petra-rooftop-bar",
    name: "Petra Rooftop Bar",
    category: "Food & Drink",
    area: "King's Cross",
    type: "discount",
    headline: "2-for-1 cocktails before 8pm",
    badge: "2-for-1",
  },
  {
    id: "casa-fiora",
    name: "Casa Fiora",
    category: "Food & Drink",
    area: "Mayfair",
    type: "access",
    access_kind: "skip_queue",
    headline: "Show your membership at the door, Fri–Sat",
  },
  {
    id: "the-vault-shoreditch",
    name: "The Vault, Shoreditch",
    category: "Food & Drink",
    area: "Shoreditch",
    type: "access",
    access_kind: "skip_queue",
    headline: "Priority line every night after 10pm",
  },
  {
    id: "harewood-house",
    name: "Harewood House",
    category: "Food & Drink",
    area: "Mayfair",
    type: "access",
    access_kind: "members_club",
    headline: "Reciprocal guest access, Mon–Wed",
  },
  {
    id: "24hr-early-access",
    name: "24hr early access",
    category: "Food & Drink",
    area: "Citywide",
    type: "access",
    access_kind: "first_dibs",
    headline: "To any event that looks like it'll sell out",
  },
];
