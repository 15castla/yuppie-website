import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { requireAdmin } from "@/app/admin/require-admin";
import { Card } from "@/components/admin/ui";
import { FeatureCardForm } from "../FeatureCardForm";

// The Feature card (r2b 18, a tab on Access): the card at the top of the members' Access page.
export default async function FeatureCardPage() {
  await requireAdmin();
  const db = createAdminSupabaseClient();
  const [{ data: events }, { data: perks }, { data: current }] = await Promise.all([
    db.from("events").select("id, title, start_time").is("cancelled_at", null).gte("start_time", new Date().toISOString()).order("start_time", { ascending: true }),
    db.from("partner_perks").select("id, name, type").order("display_order", { ascending: true }),
    db.from("feature_card").select("content_type, content_id, label").eq("id", true).maybeSingle(),
  ]);
  const options = {
    event: (events ?? []).map((e) => ({ id: e.id as string, label: e.title as string })),
    discount: (perks ?? []).filter((p) => p.type === "discount").map((p) => ({ id: p.id as string, label: p.name as string })),
    access: (perks ?? []).filter((p) => p.type === "access").map((p) => ({ id: p.id as string, label: p.name as string })),
  };
  return (
    <Card labelledBy="feature-card">
      <div className="ad-dh">
        <div className="tt">
          <h2 id="feature-card" className="ad-h2">
            Feature card
          </h2>
          <p className="sub">The card at the top of the members’ Access page.</p>
        </div>
      </div>
      <FeatureCardForm
        options={options}
        current={current ? { type: current.content_type as "event" | "discount" | "access", id: current.content_id as string, label: (current.label as string | null) ?? null } : null}
      />
    </Card>
  );
}
