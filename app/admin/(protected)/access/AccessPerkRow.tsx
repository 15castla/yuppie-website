import { ACCESS_KIND_LABEL, PerkPreview, inputClasses, labelClasses } from "@/app/admin/perk-shared";
import { Select } from "@/app/admin/form-controls";
import type { PartnerPerk } from "@/components/members/mock-perks";
import { ActionButton, ActionFormError, AdminActionForm } from "../ActionForm";

export type PerkAction = (formData: FormData) => Promise<{ success: boolean; error?: string }>;

// Extracted from what used to be inline <li> markup in page.tsx so
// AccessList.tsx can wrap each row in a Reorder.Item. The row content
// itself is unchanged, just no longer tied to a specific list-rendering
// spot.
export function AccessPerkRow({
  perk,
  updatePerkAction,
  deletePerkAction,
}: {
  perk: PartnerPerk;
  updatePerkAction: PerkAction;
  deletePerkAction: PerkAction;
}) {
  return (
    <>
      <div className="flex w-full max-w-[280px] shrink-0 flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/40">
          Live preview
        </span>
        <PerkPreview perk={perk} />
      </div>

      <AdminActionForm action={updatePerkAction} className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={perk.id} />
        <input type="hidden" name="type" value="access" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <label className={labelClasses}>Name</label>
          <input name="name" type="text" required defaultValue={perk.name} className={inputClasses} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label className={labelClasses}>Area</label>
          <input name="area" type="text" required defaultValue={perk.area} className={inputClasses} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label className={labelClasses}>Access kind</label>
          <Select name="access_kind" required defaultValue={perk.access_kind ?? ""}>
            {Object.entries(ACCESS_KIND_LABEL).map(([kind, label]) => (
              <option key={kind} value={kind}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
          <label className={labelClasses}>Headline</label>
          <input
            name="headline"
            type="text"
            required
            defaultValue={perk.headline}
            className={inputClasses}
          />
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <ActionButton
            pendingLabel="Saving…"
            className="rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save changes
          </ActionButton>
          <ActionFormError className="text-xs text-red-700" />
        </div>
      </AdminActionForm>

      <AdminActionForm action={deletePerkAction} className="flex shrink-0 flex-col items-start gap-1 self-start">
        <input type="hidden" name="id" value={perk.id} />
        <ActionButton
          pendingLabel="Deleting…"
          savedLabel="Deleted"
          className="text-xs font-medium text-foreground/40 underline underline-offset-2 hover:text-red-700 disabled:cursor-not-allowed disabled:no-underline"
        >
          Delete
        </ActionButton>
        <ActionFormError className="max-w-[10rem] text-xs text-red-700" />
      </AdminActionForm>
    </>
  );
}
