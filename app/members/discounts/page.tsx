import { requireMember } from "@/app/members/require-member";
import { getCachedPerks } from "@/components/members/perks-data";
import { withoutExamplePartners } from "@/components/members/discounts/example-partners";
import { DiscountsView } from "@/components/members/discounts-view";

export default async function MembersDiscountsPage() {
  // requireMember() is cached with the layout's login check (one fetch) and
  // runs alongside the perks fetch. It is here so the photo gate
  // (flags.photoGate, see require-member.ts) sees this page too.
  const [, perks] = await Promise.all([requireMember(), getCachedPerks()]);

  // The placeholder partners still in the table are not shown to members (see
  // example-partners.ts); the admin pages still list every row.
  const discounts = withoutExamplePartners(perks.filter((perk) => perk.type === "discount"));

  return <DiscountsView perks={discounts} />;
}
