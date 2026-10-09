import { cn } from "@/lib/utils";
import type { EventCategory } from "./event-types";

// Page-title eyebrow: identical to the public pages' (/apply, /faq).
export const EYEBROW_CLASS =
  "text-[10px] font-bold uppercase tracking-[0.24em] text-foreground sm:text-xs optical-trim";

export const CARD_CLASS = "rounded-2xl border border-foreground/10 bg-background-muted";

// Shared <main> wrapper for every top-level members page. Top padding
// (below the safe area, see --safe-top in globals.css): below md: there's
// no top nav (mobile uses the bottom tab bar), so just 2rem, putting the
// title at the top of the page. From md:, where the floating top pill nav
// is shown, 8rem: the same height the public pages (/apply, /faq) start
// their titles below their own nav. Large pb-[150px] below md: (matching
// event-detail-view.tsx's own <main>) since MembersBottomBar
// (members-nav.tsx) is position: fixed, not part of normal document
// flow, so content needs its own clearance to avoid ending up hidden
// behind it.
export const MEMBERS_MAIN_CLASS =
  "relative z-10 flex flex-1 flex-col px-4 pt-[calc(2rem+var(--safe-top))] pb-[150px] sm:px-6 md:pt-[calc(8rem+var(--safe-top))] md:pb-20";

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

export function formatEventPrice(pricePence: number) {
  return `£${(pricePence / 100).toFixed(pricePence % 100 === 0 ? 0 : 2)}pp`;
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
      {formatEventPrice(pricePence)}
    </span>
  );
}

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

const EVENT_TIME_ZONE = "Europe/London";

export function formatMonthAbbrev(iso: string) {
  return new Date(iso)
    .toLocaleDateString("en-GB", { month: "short", timeZone: EVENT_TIME_ZONE })
    .toUpperCase();
}

export function formatDayNumber(iso: string) {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      timeZone: EVENT_TIME_ZONE,
    }).format(new Date(iso)),
  );
}

export function formatEventDayTime(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: EVENT_TIME_ZONE,
  });
}

export function formatEventFullDateTime(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const datePart = start.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: EVENT_TIME_ZONE,
  });
  const startTime = start.toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: EVENT_TIME_ZONE,
  });
  const endTime = end.toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: EVENT_TIME_ZONE,
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
  imageUrl,
  className,
  showCategoryBadge = true,
}: {
  category: EventCategory;
  imageUrl?: string | null;
  className?: string;
  showCategoryBadge?: boolean;
}) {
  return (
    <div
      className={cn("relative flex items-center justify-center overflow-hidden", className)}
      style={
        imageUrl
          ? undefined
          : { background: "linear-gradient(135deg, #FFD904, #FFF3B0)" }
      }
    >
      {/* No photo: just the brand gradient. There's deliberately no
          Yuppie wordmark here; the members area carries no logo. */}
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      )}
      {showCategoryBadge && (
        <span className="absolute left-3 top-3 rounded-full bg-cream px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground">
          {CATEGORY_LABEL[category]}
        </span>
      )}
    </div>
  );
}
