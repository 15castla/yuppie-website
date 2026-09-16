"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireAdmin } from "./require-admin";
import { createAdminSupabaseClient } from "./admin-client";
import { uploadMemberMedia } from "@/lib/media-storage";

const CATEGORIES = ["Food & Drink", "Fitness", "Grooming", "Wellness"] as const;
const TYPES = ["discount", "access"] as const;
const ACCESS_KINDS = ["skip_queue", "members_club", "first_dibs", "invite_only"] as const;

function revalidatePerks() {
  // "perks" is the cache tag components/members/perks-data.ts's
  // getCachedPerks is tagged with — without this, changes here wouldn't
  // show on Discounts/Access/Home for up to 60s. Both admin pages are
  // revalidated since this file's actions serve both (split by `type`).
  revalidateTag("perks", "minutes");
  revalidatePath("/admin/discounts");
  revalidatePath("/admin/access");
}

type PerkFields = {
  name: string;
  category: (typeof CATEGORIES)[number] | null;
  area: string;
  type: string;
  access_kind: string | null;
  headline: string;
  badge: string | null;
};

// Literal-tagged discriminated union — a plain `error?: string` /
// `fields?: PerkFields` shape (varying only in presence/absence, not a
// literal discriminant) doesn't reliably narrow `result.fields` to defined
// after checking `result.error`, since TS's discriminated-union narrowing
// is keyed on a shared literal-typed property, not general truthiness.
type PerkFieldsResult = { ok: false; error: string } | { ok: true; fields: PerkFields };

function readPerkFields(formData: FormData): PerkFieldsResult {
  const name = formData.get("name");
  const categoryRaw = formData.get("category");
  const area = formData.get("area");
  const type = formData.get("type");
  const accessKindRaw = formData.get("access_kind");
  const headline = formData.get("headline");
  const badgeRaw = formData.get("badge");

  if (typeof name !== "string" || !name.trim()) return { ok: false, error: "Name is required." };
  if (typeof area !== "string" || !area.trim()) return { ok: false, error: "Area is required." };
  if (typeof type !== "string" || !TYPES.includes(type as (typeof TYPES)[number]))
    return { ok: false, error: "Please choose a valid type." };
  if (typeof headline !== "string" || !headline.trim())
    return { ok: false, error: "Headline is required." };

  // Category is only meaningful for Discount perks — access-view.tsx groups
  // Access perks purely by access_kind and never reads it (see the
  // 20260916090000 migration that dropped the column's NOT NULL for exactly
  // this reason), so it's neither collected nor validated for type: "access".
  let category: (typeof CATEGORIES)[number] | null = null;
  if (type === "discount") {
    if (typeof categoryRaw !== "string" || !CATEGORIES.includes(categoryRaw as (typeof CATEGORIES)[number]))
      return { ok: false, error: "Please choose a valid category." };
    category = categoryRaw as (typeof CATEGORIES)[number];
  }

  const accessKind =
    typeof accessKindRaw === "string" &&
    ACCESS_KINDS.includes(accessKindRaw as (typeof ACCESS_KINDS)[number])
      ? accessKindRaw
      : null;
  const badge = typeof badgeRaw === "string" && badgeRaw.trim() ? badgeRaw.trim() : null;

  return {
    ok: true,
    fields: {
      name: name.trim(),
      category,
      area: area.trim(),
      type,
      access_kind: type === "access" ? accessKind : null,
      headline: headline.trim(),
      badge,
    },
  };
}

// A "logo" file field is optional here — when present (Discount perks
// only; Access cards never show a logo, see PerkPreview), it's uploaded and
// attached to the new row in the same submission, the same combined-upload
// pattern as app/admin/events-actions.ts's createEvent. If the insert
// succeeds but the logo upload fails, the perk still exists — surfaced back
// as a non-fatal `warning` rather than `error`, so the admin isn't tempted
// to resubmit and create a duplicate.
export async function createPerk(
  formData: FormData,
): Promise<{ success: boolean; error?: string; warning?: string }> {
  await requireAdmin();

  const result = readPerkFields(formData);
  if (!result.ok) return { success: false, error: result.error };

  const logo = formData.get("logo");
  const hasLogo = result.fields.type === "discount" && logo instanceof File && logo.size > 0;

  const adminClient = createAdminSupabaseClient();
  const { data, error } = await adminClient
    .from("partner_perks")
    .insert(result.fields)
    .select("id")
    .single();

  if (error) {
    console.error("createPerk failed:", error);
    return { success: false, error: "Something went wrong creating that perk." };
  }

  let warning: string | undefined;

  if (hasLogo) {
    const uploaded = await uploadMemberMedia("perks", data.id, logo as File);
    if (uploaded.error) {
      warning = `Perk created, but the logo failed to upload: ${uploaded.error}`;
    } else {
      const { error: logoError } = await adminClient
        .from("partner_perks")
        .update({ logo_url: uploaded.url })
        .eq("id", data.id);
      if (logoError) {
        console.error(`createPerk: saving logo_url failed for ${data.id}:`, logoError);
        warning = "Perk created, but saving the logo to it failed.";
      }
    }
  }

  revalidatePerks();
  return { success: true, warning };
}

export async function updatePerk(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { success: false, error: "Missing perk." };

  const result = readPerkFields(formData);
  if (!result.ok) return { success: false, error: result.error };

  const adminClient = createAdminSupabaseClient();
  const { error } = await adminClient.from("partner_perks").update(result.fields).eq("id", id);

  if (error) {
    console.error(`updatePerk failed for perk ${id}:`, error);
    return { success: false, error: "Something went wrong saving that perk." };
  }

  revalidatePerks();
  return { success: true };
}

export async function uploadPerkLogo(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();

  const id = formData.get("id");
  const logo = formData.get("logo");

  if (typeof id !== "string" || !id) return { success: false, error: "Missing perk." };
  if (!(logo instanceof File)) {
    return { success: false, error: "Please choose an image to upload." };
  }

  const uploaded = await uploadMemberMedia("perks", id, logo);
  if (uploaded.error) return { success: false, error: uploaded.error };

  const adminClient = createAdminSupabaseClient();
  const { error } = await adminClient
    .from("partner_perks")
    .update({ logo_url: uploaded.url })
    .eq("id", id);

  if (error) {
    console.error(`uploadPerkLogo failed for perk ${id}:`, error);
    return { success: false, error: "Uploaded, but saving it to the perk failed." };
  }

  revalidatePerks();
  return { success: true };
}

export async function deletePerk(formData: FormData): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { success: false, error: "Missing perk." };

  const adminClient = createAdminSupabaseClient();
  const { error } = await adminClient.from("partner_perks").delete().eq("id", id);

  if (error) {
    console.error(`deletePerk failed for perk ${id}:`, error);
    return { success: false, error: "Something went wrong deleting that perk." };
  }

  revalidatePerks();
  return { success: true };
}
