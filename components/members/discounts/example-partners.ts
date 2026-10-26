// The partner rows that were only ever placeholders, kept out of what members see.
//
// No partner is signed yet (Brand Bible, Decisions Log: "no named partners we
// cannot back"). The `partner_perks` table was seeded with nine invented
// rows by supabase/migrations/20260915120000_add_partner_perks_table_and_media_storage.sql
// (the old MOCK_PERKS), and four more discounts were added on 13 Oct 2026 so
// the App Store screenshots would look populated. They are still in the live
// table, so every real member would see "Bellina Trattoria" and a member
// showing it at a till would be turned away. This list hides them from the
// member pages only: the admin pages read the table directly and still show
// every row, nothing is deleted, and the "no offers yet" band (the honest
// state) appears until a real partner is added.
//
// When real partners replace these rows in /admin/discounts and /admin/access
// the list does nothing and can be deleted with its two call sites
// (app/members/discounts/page.tsx, app/members/access/page.tsx).
// To see the placeholders on purpose (a screenshot build, a preview deployment)
// set MEMBERS_SHOW_EXAMPLE_PARTNERS=on. The name is matched, not the id: the
// ids are random and differ from one database to the next.

const EXAMPLE_PARTNER_NAMES = [
  // seeded by the migration (names as seeded, "The Vault, Shoreditch" and "Forge Fitness" as they were later seen)
  "Bellina Trattoria",
  "Forge Fitness Studios",
  "Forge Fitness",
  "Hoxton Barbers Co.",
  "Lumen Sauna House",
  "Petra Rooftop Bar",
  "Casa Fiora",
  "The Vault, Shoreditch",
  "The Vault",
  "Harewood House",
  "24hr early access",
  // added on 13 Oct 2026 for App Store screenshots
  "Ironmonger Strength Club",
  "Lanternfish Cocktail Bar",
  "Oakhart Apothecary",
  "Brightmoor Spa Rooms",
];

function key(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+&\s+/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const EXAMPLE_KEYS = new Set(EXAMPLE_PARTNER_NAMES.map(key));

export function isExamplePartner(name: string): boolean {
  return EXAMPLE_KEYS.has(key(name));
}

export function withoutExamplePartners<T extends { name: string }>(perks: T[]): T[] {
  if (process.env.MEMBERS_SHOW_EXAMPLE_PARTNERS === "on") return perks;
  return perks.filter((perk) => !isExamplePartner(perk.name));
}
