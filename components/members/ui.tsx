import Image from "next/image";

import { PAGE_EYEBROW_CLASS } from "@/components/page-header";
import { cn } from "@/lib/utils";
import type { EventCategory } from "./event-types";

// Page-title eyebrow: the public pages' standard (components/page-header).
export const EYEBROW_CLASS = PAGE_EYEBROW_CLASS;

// Shared entrance animation for every members view: a quick fade with a
// 20px rise, sections staggered a few hundredths of a second apart so the
// last one starts by ~0.15s. A plain function (not a hook) because this
// file is also imported by server components; each view passes in its own
// framer-motion useReducedMotion() result, and reduced motion means no
// entrance animation at all. slide: false fades without moving (the event
// page's hero, which would otherwise show a strip of background above it).
export const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export function fadeIn(reduce: boolean | null, delay = 0, { slide = true } = {}) {
  return {
    initial: reduce ? false : slide ? { y: 20, opacity: 0 } : { opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.35, delay, ease: EASE_OUT_EXPO },
  };
}

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

// Shared sizing so every variant below (Booked / Included / price) renders
// at the same minimum size, centered, rather than each hugging its own
// label's width. min-w-20 (80px) is a floor, not a cap, measured just past
// the widest label expected in practice ("Included" / "£12.50pp") — an
// unusually long price (e.g. "£125.50pp") will still grow past it to fit,
// the same as it always has; it just won't match the others' width in that
// case. `border` is in the shared class (not just the outlined price
// variant) so all three reserve the same 1px and come out the same height;
// the filled variants just make that border transparent instead of
// omitting it.
const PRICE_PILL_BASE_CLASS =
  "inline-flex min-w-20 shrink-0 items-center justify-center rounded-full border px-3 py-0.5 text-center text-xs font-bold";

// booked: the member already has a confirmed booking, free or paid, so
// the pill says that instead of the price (same filled style as "Included").
export function PricePill({
  pricePence,
  booked = false,
}: {
  pricePence: number | null;
  booked?: boolean;
}) {
  if (booked) {
    return (
      <span
        className={cn(PRICE_PILL_BASE_CLASS, "border-transparent bg-foreground text-background")}
      >
        Booked
      </span>
    );
  }

  if (!pricePence) {
    return (
      <span
        className={cn(PRICE_PILL_BASE_CLASS, "border-transparent bg-foreground text-background")}
      >
        Included
      </span>
    );
  }

  return (
    <span className={cn(PRICE_PILL_BASE_CLASS, "border-foreground/20 text-foreground")}>
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

export function formatWeekdayShort(iso: string) {
  return new Date(iso)
    .toLocaleDateString("en-GB", { weekday: "short", timeZone: EVENT_TIME_ZONE })
    .toUpperCase();
}

export function formatEventTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: EVENT_TIME_ZONE,
  });
}

// For grouping events by calendar month in London time: a sortable key
// ("2026-11") and a heading ("November", or "January 2027" when it isn't
// the current year).
export function eventMonthGroup(iso: string, now = new Date()) {
  const parts = (date: Date) =>
    Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", timeZone: EVENT_TIME_ZONE })
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );
  const { year, month } = parts(new Date(iso));
  const monthName = new Date(iso).toLocaleDateString("en-GB", { month: "long", timeZone: EVENT_TIME_ZONE });
  return {
    key: `${year}-${month}`,
    label: year === parts(now).year ? monthName : `${monthName} ${year}`,
  };
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

// "Saturday 31 October, 10:00 – 12:00", or just "Saturday 31 October,
// 10:00" when there's no end time (or it's the same as the start), rather
// than a range from the start time to itself.
export function formatEventFullDateTime(startIso: string, endIso?: string | null) {
  const start = new Date(startIso);
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
  // Compared as instants: the same time can arrive as "...Z" or "...+00:00".
  const end = endIso ? new Date(endIso) : null;
  if (!end || end.getTime() === start.getTime()) {
    return `${datePart}, ${startTime}`;
  }
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

// Event photo frame: one fixed aspect ratio at every screen width, so
// object-cover shows the same part of the photo on a phone and on a
// desktop, just scaled. Fixed pixel heights (what this replaced) kept the
// height constant while the width followed the screen, so a wider screen
// cropped more off the top and bottom. 16:9 keeps cards and the event
// page's hero a sensible height; most photos are taller than that, so
// some of each is cropped, and the event's focal point (set by clicking
// the photo at /admin/events) decides which part stays in frame.
export const EVENT_PHOTO_CLASS = "aspect-[16/9] w-full";

// 0-100 percentages of the photo's width and height. Used as CSS
// object-position, which lines the photo's x% point up with the frame's
// x% point, so the focal point always stays inside the frame.
export type FocalPoint = { x: number; y: number };

export const CENTRE_FOCAL_POINT: FocalPoint = { x: 50, y: 50 };

export function eventFocalPoint(event: {
  image_focal_x?: number | null;
  image_focal_y?: number | null;
}): FocalPoint {
  return {
    x: Number(event.image_focal_x ?? 50),
    y: Number(event.image_focal_y ?? 50),
  };
}

// Event photos uploaded at /admin/events live here (allowed in
// next.config.ts images.remotePatterns). Anything else, like admin's blob:
// preview of a just-chosen file, can't go through the image optimiser.
const OPTIMISABLE_IMAGE_PREFIX =
  "https://tbcpzmzfxtbaumlcnmdf.supabase.co/storage/v1/object/public/";

export function EventThumbnail({
  category,
  imageUrl,
  focalPoint = CENTRE_FOCAL_POINT,
  className,
  showCategoryBadge = true,
  sizes = "100vw",
  onImageLoad,
}: {
  category: EventCategory;
  imageUrl?: string | null;
  focalPoint?: FocalPoint;
  className?: string;
  showCategoryBadge?: boolean;
  // How wide the photo is drawn, so next/image picks a right-sized file
  // rather than the full upload (e.g. "88px" for a list thumbnail).
  sizes?: string;
  // The photo's natural size once it's loaded. Only the admin focal point
  // overlay uses it (to work out how far the crop can move), and only
  // client components can pass it, so the handlers below are attached
  // only when it's given.
  onImageLoad?: (size: { width: number; height: number }) => void;
}) {
  const reportSize = (img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth) {
      onImageLoad?.({ width: img.naturalWidth, height: img.naturalHeight });
    }
  };

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
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes={sizes}
          unoptimized={!imageUrl.startsWith(OPTIMISABLE_IMAGE_PREFIX)}
          className="object-cover"
          style={{ objectPosition: `${focalPoint.x}% ${focalPoint.y}%` }}
          // The ref catches a photo that finished loading before React
          // attached onLoad (e.g. already cached when the page hydrated).
          // With a srcset, naturalWidth/Height are scaled by the chosen
          // file's density rather than its pixel size, but the aspect ratio
          // (all FocalPointOverlay needs) is still the original photo's.
          ref={onImageLoad ? reportSize : undefined}
          onLoad={onImageLoad ? (event) => reportSize(event.currentTarget) : undefined}
        />
      )}
      {showCategoryBadge && (
        <span className="absolute left-3 top-3 rounded-full bg-cream px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground">
          {CATEGORY_LABEL[category]}
        </span>
      )}
    </div>
  );
}
