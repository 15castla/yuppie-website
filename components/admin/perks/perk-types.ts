// Discounts and Access (the doors): one table (partner_perks), two admin pages (r2b 18). Shared words and shapes.

import type { AdminIconName } from "../icons";

export type PerkType = "discount" | "access";
export type AccessKind = "skip_queue" | "members_club" | "first_dibs" | "invite_only";

export type PerkRow = {
  id: string;
  display_order: number;
  name: string;
  category: string | null;
  area: string;
  type: PerkType;
  access_kind: AccessKind | null;
  headline: string;
  badge: string | null;
  logo_url: string | null;
};

export const ACCESS_KIND_WORDS: Record<AccessKind, string> = {
  skip_queue: "Skip the queue",
  members_club: "Members’ club",
  first_dibs: "First dibs",
  invite_only: "Invite only",
};

/** The icon each kind shows on the members' Access page. */
export const ACCESS_KIND_ICON: Record<AccessKind, AdminIconName> = {
  skip_queue: "zap",
  members_club: "building",
  first_dibs: "sparkle",
  invite_only: "lock",
};

/** The baseline categories; a category an admin has typed in joins them (see the discounts page). */
export const DEFAULT_CATEGORIES = ["Food & Drink", "Fitness", "Grooming", "Wellness"];

export const PERK_WORDS: Record<PerkType, { one: string; many: string; base: string; title: string }> = {
  discount: { one: "discount", many: "discounts", base: "/admin/discounts", title: "Discounts" },
  access: { one: "door", many: "doors", base: "/admin/access", title: "Access" },
};

export function perkMeta(p: Pick<PerkRow, "type" | "category" | "access_kind" | "area">): string {
  const first = p.type === "access" ? (p.access_kind ? ACCESS_KIND_WORDS[p.access_kind] : "Access") : p.category || "Discount";
  return [first, p.area].filter(Boolean).join(" · ");
}
