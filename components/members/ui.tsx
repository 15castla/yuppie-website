import { Trophy, Sparkles, PartyPopper, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { EventCategory } from "./event-types";

export const EYEBROW_CLASS =
  "text-[10px] font-bold uppercase tracking-[0.22em] text-foreground optical-trim";

export const CARD_CLASS = "rounded-2xl border border-foreground/10 bg-background-muted";

const STATUS_DOT_COLOR: Record<string, string> = {
  active: "#2F6B3A",
  paused: "#B7791F",
  cancelled: "#8A8177",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Membership active",
  paused: "Membership paused",
  cancelled: "Membership cancelled",
};

export function StatusDot({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: STATUS_DOT_COLOR[status] ?? "#8A8177" }}
      />
      <span className="text-sm font-semibold text-foreground">
        {STATUS_LABEL[status] ?? `Membership ${status}`}
      </span>
    </span>
  );
}

export function PricePill({ pricePence }: { pricePence: number | null }) {
  if (!pricePence) {
    return (
      <span className="shrink-0 rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background">
        Included
      </span>
    );
  }

  return (
    <span className="shrink-0 rounded-full border border-foreground/20 px-3 py-1 text-xs font-bold text-foreground">
      £{(pricePence / 100).toFixed(pricePence % 100 === 0 ? 0 : 2)}pp
    </span>
  );
}

export const CATEGORY_ICON: Record<EventCategory, LucideIcon> = {
  sport: Trophy,
  entertainment: PartyPopper,
  personal_progression: Sparkles,
};

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  sport: "Sport",
  entertainment: "Entertainment",
  personal_progression: "Personal Progression",
};

export function initialsFor(fullName: string | null) {
  if (!fullName?.trim()) return "?";
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

export function formatMonthAbbrev(iso: string) {
  return new Date(iso)
    .toLocaleDateString("en-GB", { month: "short" })
    .toUpperCase();
}

export function formatDayNumber(iso: string) {
  return new Date(iso).getDate();
}

export function formatEventDayTime(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatEventFullDateTime(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const datePart = start.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const startTime = start.toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = end.toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart}, ${startTime} – ${endTime}`;
}

export function DateBadge({ iso }: { iso: string }) {
  return (
    <div className="flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-background">
      <span className="text-[9px] font-bold uppercase tracking-wider text-foreground/60">
        {formatMonthAbbrev(iso)}
      </span>
      <span className="text-lg font-extrabold leading-none text-foreground">
        {formatDayNumber(iso)}
      </span>
    </div>
  );
}

export function EventThumbnail({
  category,
  className,
  iconClassName,
}: {
  category: EventCategory;
  className?: string;
  iconClassName?: string;
}) {
  const Icon = CATEGORY_ICON[category];
  return (
    <div
      className={cn("relative flex items-center justify-center overflow-hidden", className)}
      style={{
        background: "linear-gradient(135deg, #FFD904, #FFF3B0)",
      }}
    >
      <Icon
        className={cn("text-foreground/15", iconClassName)}
        strokeWidth={1.5}
      />
      <span className="absolute left-3 top-3 rounded-full bg-cream px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground">
        {CATEGORY_LABEL[category]}
      </span>
    </div>
  );
}
