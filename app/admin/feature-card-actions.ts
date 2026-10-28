"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireAdmin } from "./require-admin";
import { createAdminSupabaseClient } from "./admin-client";
import { audit } from "@/lib/server/audit";

const CONTENT_TYPES = ["event", "discount", "access"] as const;
type ContentType = (typeof CONTENT_TYPES)[number];

function revalidateFeatureCard() {
  // "feature-card" is the tag components/members/feature-card-data.ts's
  // getCachedFeatureCard is tagged with.
  revalidateTag("feature-card", "minutes");
  revalidatePath("/admin/access");
  revalidatePath("/members/access");
}

// Backs the single "Feature card" dropdown on /admin/access. Spotlights
// any one event, discount, or access perk as the black card at the top of
// /members/access (see components/members/access-view.tsx). Previously
// event-only (events.is_invite_only_feature + events.invite_only_label),
// generalized to a singleton feature_card table (see
// supabase/migrations/20260924120000_add_feature_card_table.sql) so any of
// the three content types can be featured. content_type + content_id come
// as separate FormData fields: FeatureCardForm.tsx splits its single
// `type:id`-prefixed <select> value into these before submitting.
export async function setFeatureCard(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const admin = await requireAdmin();

  const contentType = formData.get("content_type");
  const contentId = formData.get("content_id");
  const labelRaw = formData.get("label");
  const adminClient = createAdminSupabaseClient();

  // Empty selection means "None", so delete the singleton row, if any,
  // rather than leaving a row with a null content_id around.
  if (typeof contentId !== "string" || !contentId) {
    const { error } = await adminClient.from("feature_card").delete().eq("id", true);

    if (error) {
      console.error("setFeatureCard: failed to clear:", error);
      return { success: false, error: `We couldn’t clear the feature card. (${error.message})` };
    }

    await audit(admin.id, "feature_card.clear", { type: "feature_card", id: "feature_card" });
    revalidateFeatureCard();
    return { success: true };
  }

  if (typeof contentType !== "string" || !CONTENT_TYPES.includes(contentType as ContentType)) {
    return { success: false, error: "Choose something to feature." };
  }

  const label = typeof labelRaw === "string" ? labelRaw.trim() || null : null;

  const { error } = await adminClient.from("feature_card").upsert({
    id: true,
    content_type: contentType,
    content_id: contentId,
    label,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("setFeatureCard failed:", error);
    return { success: false, error: `We couldn’t save the feature card. (${error.message})` };
  }

  await audit(admin.id, "feature_card.set", { type: "feature_card", id: "feature_card" }, { content_type: contentType, content_id: contentId, label });
  revalidateFeatureCard();
  return { success: true };
}
