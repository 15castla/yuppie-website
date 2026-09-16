import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { PERK_COLUMNS, type PartnerPerk } from "@/components/members/mock-perks";
import { updatePerk, uploadPerkLogo, deletePerk } from "@/app/admin/discounts-actions";
import { PERK_CATEGORIES, PerkPreview, inputClasses, labelClasses } from "@/app/admin/perk-shared";
import { NewPerkForm } from "./NewPerkForm";

// Access-type perks live on their own dedicated page now (/admin/access) —
// this page only ever deals with type: "discount", so the shared
// discounts-actions.ts functions are always called with that type fixed.
export default async function AdminDiscountsPage() {
  const adminClient = createAdminSupabaseClient();
  const { data } = await adminClient
    .from("partner_perks")
    .select(PERK_COLUMNS)
    .eq("type", "discount")
    .order("created_at", { ascending: true });

  const perks = (data ?? []) as PartnerPerk[];

  // <form action> requires (formData) => void | Promise<void> — these
  // actions return { success, error } for other callers, so each is
  // wrapped here rather than changing its return type.
  async function uploadPerkLogoAction(formData: FormData) {
    "use server";
    await uploadPerkLogo(formData);
  }

  async function updatePerkAction(formData: FormData) {
    "use server";
    await updatePerk(formData);
  }

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
              <div className="flex w-full max-w-[280px] shrink-0 flex-col gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/40">
                  Live preview
                </span>
                <PerkPreview perk={perk} />

                <form action={uploadPerkLogoAction} className="mt-1 w-full">
                  <input type="hidden" name="id" value={perk.id} />
                  <input
                    type="file"
                    name="logo"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    required
                    className="w-full text-[10px] text-foreground/70 file:mr-1 file:rounded-full file:border-0 file:bg-foreground file:px-2 file:py-1 file:text-[10px] file:font-bold file:text-background"
                  />
                  <button
                    type="submit"
                    className="mt-1.5 w-full rounded-full bg-foreground px-3 py-1.5 text-[11px] font-bold text-background"
                  >
                    {perk.logo_url ? "Replace logo" : "Upload logo"}
                  </button>
                </form>
              </div>

              <form action={updatePerkAction} className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={perk.id} />
                <input type="hidden" name="type" value="discount" />
                <div className="flex flex-col gap-1.5">
                  <label className={labelClasses}>Name</label>
                  <input
                    name="name"
                    type="text"
                    required
                    defaultValue={perk.name}
                    className={inputClasses}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClasses}>Area</label>
                  <input
                    name="area"
                    type="text"
                    required
                    defaultValue={perk.area}
                    className={inputClasses}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClasses}>Category</label>
                  <select name="category" required defaultValue={perk.category ?? ""} className={inputClasses}>
                    {PERK_CATEGORIES.map((category) => (
                      <option key={category} value={category ?? ""}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClasses}>Badge</label>
                  <input
                    name="badge"
                    type="text"
                    defaultValue={perk.badge ?? ""}
                    className={inputClasses}
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className={labelClasses}>Headline</label>
                  <input
                    name="headline"
                    type="text"
                    required
                    defaultValue={perk.headline}
                    className={inputClasses}
                  />
                </div>
                <div className="flex items-center gap-4 sm:col-span-2">
                  <button
                    type="submit"
                    className="rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background"
                  >
                    Save changes
                  </button>
                </div>
              </form>

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
