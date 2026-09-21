import { ACCESS_KIND_LABEL, PerkPreview, inputClasses, labelClasses } from "@/app/admin/perk-shared";
import type { PartnerPerk } from "@/components/members/mock-perks";

// Extracted from what used to be inline <li> markup in page.tsx so
// AccessList.tsx can wrap each row in a Reorder.Item — the row content
// itself is unchanged, just no longer tied to a specific list-rendering
// spot.
export function AccessPerkRow({
  perk,
  updatePerkAction,
  deletePerkAction,
}: {
  perk: PartnerPerk;
  updatePerkAction: (formData: FormData) => void;
  deletePerkAction: (formData: FormData) => void;
}) {
  return (
    <>
      <div className="flex w-full max-w-[280px] shrink-0 flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/40">
          Live preview
        </span>
        <PerkPreview perk={perk} />
      </div>

      <form action={updatePerkAction} className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={perk.id} />
        <input type="hidden" name="type" value="access" />
        <div className="flex flex-col gap-1.5">
          <label className={labelClasses}>Name</label>
          <input name="name" type="text" required defaultValue={perk.name} className={inputClasses} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClasses}>Area</label>
          <input name="area" type="text" required defaultValue={perk.area} className={inputClasses} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClasses}>Access kind</label>
          <select
            name="access_kind"
            required
            defaultValue={perk.access_kind ?? ""}
            className={inputClasses}
          >
            {Object.entries(ACCESS_KIND_LABEL).map(([kind, label]) => (
              <option key={kind} value={kind}>
                {label}
              </option>
            ))}
          </select>
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
    </>
  );
}
