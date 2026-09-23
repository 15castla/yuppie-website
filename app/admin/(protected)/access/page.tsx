import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { PERK_COLUMNS, type PartnerPerk } from "@/components/members/mock-perks";
import { updatePerk, deletePerk } from "@/app/admin/discounts-actions";
import { NewAccessForm } from "./NewAccessForm";
import { AccessList } from "./AccessList";
import { FeatureCardForm } from "./FeatureCardForm";

type EventOption = { id: string; title: string };
type DiscountOption = { id: string; name: string };
type FeatureCardRow = {
  content_type: "event" | "discount" | "access";
  content_id: string;
  label: string | null;
};

// Previously, Access perks were managed from inside /admin/discounts (one
// shared page for both types, picked via a "Type" dropdown), split out
// here into its own page, matching the two separate member-facing pages
// (components/members/discounts-view.tsx / access-view.tsx). Both pages'
// server actions still live in discounts-actions.ts since it's the same
// underlying partner_perks table either way.
export default async function AdminAccessPage() {
  const adminClient = createAdminSupabaseClient();
  const [{ data: perksData }, { data: discountsData }, { data: eventsData }, { data: featureCardData }] =
    await Promise.all([
      adminClient
        .from("partner_perks")
        .select(PERK_COLUMNS)
        .eq("type", "access")
        .order("display_order", { ascending: true })
        .order("id", { ascending: true }),
      // Purely for the Feature card dropdown below: this page doesn't
      // otherwise manage discounts, so only id/name is needed.
      adminClient.from("partner_perks").select("id, name").eq("type", "discount").order("name"),
      adminClient
        .from("events")
        .select("id, title")
        .order("start_time", { ascending: true })
        .order("id", { ascending: true }),
      adminClient.from("feature_card").select("content_type, content_id, label").eq("id", true).maybeSingle(),
    ]);

  const perks = (perksData ?? []) as PartnerPerk[];
  const discounts = (discountsData ?? []) as DiscountOption[];
  const events = (eventsData ?? []) as EventOption[];
  const featureCard = (featureCardData ?? null) as FeatureCardRow | null;

  // <form action> requires (formData) => void | Promise<void>, and these
  // actions return { success, error } for other callers, so each is
  // wrapped here rather than changing its return type.
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
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Access</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Manage the members&apos; club / skip-the-queue perks shown on the
          member Access page, grouped there by access kind. The card next to
          each one is exactly what members see. Looking for the discount
          partners instead? Those live on the separate Discounts page.
        </p>
      </div>

      <section className="rounded-2xl border border-foreground/10 bg-cream p-6">
        <h2 className="text-base font-semibold text-foreground">Feature card</h2>
        <p className="mt-1 text-sm text-foreground/60">
          Powers the black spotlight card at the top of the members&apos;
          Access page. Pick any one event, discount, or access perk to
          feature there, with an optional custom label. Choose
          &quot;None&quot; to hide the card entirely.
        </p>
        <FeatureCardForm
          events={events.map((event) => ({ id: event.id, label: event.title }))}
          discounts={discounts.map((discount) => ({ id: discount.id, label: discount.name }))}
          access={perks.map((perk) => ({ id: perk.id, label: perk.name }))}
          current={
            featureCard
              ? { contentType: featureCard.content_type, contentId: featureCard.content_id, label: featureCard.label }
              : null
          }
        />
      </section>

      <NewAccessForm />

      {perks.length === 0 ? (
        <p className="rounded-2xl border border-foreground/10 bg-cream p-8 text-center text-foreground/60">
          No access perks yet.
        </p>
      ) : (
        <AccessList perks={perks} updatePerkAction={updatePerkAction} deletePerkAction={deletePerkAction} />
      )}
    </div>
  );
}
