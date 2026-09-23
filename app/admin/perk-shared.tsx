import { Zap, Building2, Sparkles, Lock, type LucideIcon } from "lucide-react";

import type { PartnerPerk } from "@/components/members/mock-perks";
import { CARD_CLASS } from "@/components/members/ui";
import { cn } from "@/lib/utils";

// Shared between /admin/discounts and /admin/access, both of which manage rows in
// the same partner_perks table (see supabase/migrations/
// 20260915120000_add_partner_perks_table_and_media_storage.sql), split by
// `type` into two dedicated admin pages that mirror the two member-facing
// pages (components/members/discounts-view.tsx / access-view.tsx).

export const PERK_CATEGORIES: PartnerPerk["category"][] = [
  "Food & Drink",
  "Fitness",
  "Grooming",
  "Wellness",
];

export const ACCESS_KIND_LABEL: Record<NonNullable<PartnerPerk["access_kind"]>, string> = {
  skip_queue: "Skip the queue",
  members_club: "Members' club",
  first_dibs: "First dibs",
  invite_only: "Invite only",
};

// Mirrors the icon each access_kind renders with on
// components/members/access-view.tsx, so the preview matches exactly what
// that section looks like on the real Access page.
export const ACCESS_ICON: Record<NonNullable<PartnerPerk["access_kind"]>, LucideIcon> = {
  skip_queue: Zap,
  members_club: Building2,
  first_dibs: Sparkles,
  invite_only: Lock,
};

export const inputClasses =
  "w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/40";
export const labelClasses = "text-xs font-semibold uppercase tracking-wider text-foreground/50";

// Renders a perk exactly as it appears on its real member-facing page: a
// Discount card with a logo, or an Access card with an icon (Access never
// shows a logo, so this branch just ignores logo_url). Used both for the
// live-typing preview on each "Add a new..." form and for the per-row
// preview next to each perk further down each admin page.
export function PerkPreview({ perk }: { perk: PartnerPerk }) {
  if (perk.type === "access") {
    const Icon = perk.access_kind ? ACCESS_ICON[perk.access_kind] : Lock;
    return (
      <div className={cn(CARD_CLASS, "flex w-full items-center gap-4 p-4")}>
        <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-background">
          <Icon className="h-5 w-5 text-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-bold text-foreground">
            {perk.name || "Venue name"}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            {perk.headline || "What members get"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(CARD_CLASS, "flex w-full items-center gap-4 p-4")}>
      {perk.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={perk.logo_url}
          alt={perk.name}
          className="h-[46px] w-[46px] shrink-0 rounded-xl object-cover"
        />
      ) : (
        <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-background text-lg font-bold text-foreground">
          {perk.name ? perk.name.charAt(0).toUpperCase() : "?"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-bold text-foreground">
          {perk.name || "Venue name"}
        </p>
        <p className="truncate text-[11.5px] text-foreground-muted">
          {perk.category} · {perk.area || "Area"}
        </p>
        <p className="mt-1 text-xs text-foreground">{perk.headline || "What members get"}</p>
      </div>
      {perk.badge && (
        <span className="shrink-0 rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background">
          {perk.badge}
        </span>
      )}
    </div>
  );
}
