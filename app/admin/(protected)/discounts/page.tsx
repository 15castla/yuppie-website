import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { PERK_COLUMNS, type PartnerPerk } from "@/components/members/mock-perks";
import { deletePerk } from "@/app/admin/discounts-actions";
import { DEFAULT_PERK_CATEGORIES } from "@/app/admin/perk-shared";
import { NewPerkForm } from "./NewPerkForm";
import { DiscountsList } from "./DiscountsList";

// Access-type perks live on their own dedicated page now (/admin/access),
// so this page only ever deals with type: "discount", and the shared
// discounts-actions.ts functions are always called with that type fixed.
export default async function AdminDiscountsPage() {
  const adminClient = createAdminSupabaseClient();
  const { data } = await adminClient
    .from("partner_perks")
    .select(PERK_COLUMNS)
    .eq("type", "discount")
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  const perks = (data ?? []) as PartnerPerk[];

  // Baseline categories plus whatever custom ones admins have already
  // typed in, so a category someone added stays offered as a normal
  // dropdown option for every future discount rather than being a
  // one-off free text entry.
  const categories = Array.from(
    new Set([
      ...DEFAULT_PERK_CATEGORIES,
      ...perks.map((perk) => perk.category).filter((c): c is string => Boolean(c)),
    ]),
  ).sort((a, b) => a.localeCompare(b));

  // <form action> requires (formData) => void | Promise<void>, and this
  // action returns { success, error } for other callers, so it's wrapped
  // here rather than changing its return type.
  async function deletePerkAction(formData: FormData) {
    "use server";
    await deletePerk(formData);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Discounts</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Manage the partner discounts shown on the member Discounts page.
          The card next to each one is exactly what members see. Looking for
          the members&apos; club / skip-the-queue perks instead? Those live
          on the separate Access page.
        </p>
      </div>

      <NewPerkForm categories={categories} />

      {perks.length === 0 ? (
        <p className="rounded-2xl border border-foreground/10 bg-cream p-8 text-center text-foreground/60">
          No discounts yet.
        </p>
      ) : (
        <DiscountsList perks={perks} categories={categories} deletePerkAction={deletePerkAction} />
      )}
    </div>
  );
}
