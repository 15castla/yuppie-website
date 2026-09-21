import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { PERK_COLUMNS, type PartnerPerk } from "@/components/members/mock-perks";
import { deletePerk } from "@/app/admin/discounts-actions";
import { NewPerkForm } from "./NewPerkForm";
import { EditPerkForm } from "./EditPerkForm";

// Access-type perks live on their own dedicated page now (/admin/access) —
// this page only ever deals with type: "discount", so the shared
// discounts-actions.ts functions are always called with that type fixed.
export default async function AdminDiscountsPage() {
  const adminClient = createAdminSupabaseClient();
  const { data } = await adminClient
    .from("partner_perks")
    .select(PERK_COLUMNS)
    .eq("type", "discount")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  const perks = (data ?? []) as PartnerPerk[];

  // <form action> requires (formData) => void | Promise<void> — this
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

      <NewPerkForm />

      {perks.length === 0 ? (
        <p className="rounded-2xl border border-foreground/10 bg-cream p-8 text-center text-foreground/60">
          No discounts yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-6">
          {perks.map((perk) => (
            <li
              key={perk.id}
              className="flex flex-col gap-6 rounded-2xl border border-foreground/10 bg-cream p-6 sm:flex-row sm:items-start"
            >
              <EditPerkForm perk={perk} />

              <form action={deletePerkAction} className="shrink-0 self-start">
                <input type="hidden" name="id" value={perk.id} />
                <button
                  type="submit"
                  className="text-xs font-medium text-foreground/40 underline underline-offset-2 hover:text-red-700"
                >
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
