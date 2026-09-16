import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { PERK_COLUMNS, type PartnerPerk } from "@/components/members/mock-perks";
import { updatePerk, deletePerk } from "@/app/admin/discounts-actions";
import { setFeaturedInviteOnlyEvent } from "@/app/admin/events-actions";
import { ACCESS_KIND_LABEL, PerkPreview, inputClasses, labelClasses } from "@/app/admin/perk-shared";
import { NewAccessForm } from "./NewAccessForm";

type EventOption = { id: string; title: string; is_invite_only_feature: boolean };

// Previously, Access perks were managed from inside /admin/discounts (one
// shared page for both types, picked via a "Type" dropdown) — split out
// here into its own page, matching the two separate member-facing pages
// (components/members/discounts-view.tsx / access-view.tsx). Both pages'
// server actions still live in discounts-actions.ts since it's the same
// underlying partner_perks table either way.
export default async function AdminAccessPage() {
  const adminClient = createAdminSupabaseClient();
  const [{ data: perksData }, { data: eventsData }] = await Promise.all([
    adminClient
      .from("partner_perks")
      .select(PERK_COLUMNS)
      .eq("type", "access")
      .order("created_at", { ascending: true }),
    adminClient
      .from("events")
      .select("id, title, is_invite_only_feature")
      .order("start_time", { ascending: true }),
  ]);

  const perks = (perksData ?? []) as PartnerPerk[];
  const events = (eventsData ?? []) as EventOption[];
  const featuredEventId = events.find((event) => event.is_invite_only_feature)?.id ?? "";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Access</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Manage the members&apos; club / skip-the-queue perks shown on the
          member Access page, grouped there by access kind. The card next to
          each one is exactly what members see. Looking for the discount
          partners instead? Those live on the separate Discounts page.
        </p>
      </div>

      <section className="rounded-2xl border border-foreground/10 bg-cream p-6">
        <h2 className="text-base font-semibold text-foreground">Featured invite-only event</h2>
        <p className="mt-1 text-sm text-foreground/60">
          Powers the black &quot;Invite Only&quot; card at the top of the
          members&apos; Access page — only one event can be featured there at
          a time. Choose &quot;None&quot; to hide the card entirely.
        </p>
        <form
          action={setFeaturedInviteOnlyEvent}
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <select name="event_id" defaultValue={featuredEventId} className={inputClasses}>
            <option value="">None — hide the card</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="shrink-0 rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background"
          >
            Save
          </button>
        </form>
      </section>

      <NewAccessForm />

      {perks.length === 0 ? (
        <p className="rounded-2xl border border-foreground/10 bg-cream p-8 text-center text-foreground/60">
          No access perks yet.
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
              </div>

              <form action={updatePerk} className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={perk.id} />
                <input type="hidden" name="type" value="access" />
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

              <form action={deletePerk} className="shrink-0 self-start">
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
