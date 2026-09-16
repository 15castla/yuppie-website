import { getCachedPerks } from "@/components/members/perks-data";
import { DiscountsView } from "@/components/members/discounts-view";

export default async function MembersDiscountsPage() {
  const perks = await getCachedPerks();
  const discounts = perks.filter((perk) => perk.type === "discount");

  return <DiscountsView perks={discounts} />;
}
