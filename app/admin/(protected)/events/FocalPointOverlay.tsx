"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, type LucideIcon } from "lucide-react";

import type { EventCategory } from "@/components/members/event-types";
import { EVENT_PHOTO_CLASS, EventThumbnail, type FocalPoint } from "@/components/members/ui";
import { cn } from "@/lib/utils";

// The event photo exactly as members see it (the real EventThumbnail,
// cropped to 16:9), with four arrow buttons on top of it for moving the
// focal point: the part of the photo that stays in frame. Nudging and
// seeing the result happen in the same place. The buttons sit at the
// frame's edges rather than in the middle, where they'd cover the photo's
// subject. With no photo there's nothing to position, so no buttons.

const clamp = (value: number) => Math.min(100, Math.max(0, value));
const round = (value: number) => Math.round(value * 10) / 10;

// 5% per press: moves the photo visibly each time, and goes edge to edge
// in 20 presses.
const BUTTON_STEP = 5;

const NUDGE_BUTTONS: {
  label: string;
  Icon: LucideIcon;
  dx: number;
  dy: number;
  position: string;
}[] = [
  { label: "Move focal point up", Icon: ChevronUp, dx: 0, dy: -1, position: "left-1/2 top-2 -translate-x-1/2" },
  { label: "Move focal point down", Icon: ChevronDown, dx: 0, dy: 1, position: "bottom-2 left-1/2 -translate-x-1/2" },
  { label: "Move focal point left", Icon: ChevronLeft, dx: -1, dy: 0, position: "left-2 top-1/2 -translate-y-1/2" },
  { label: "Move focal point right", Icon: ChevronRight, dx: 1, dy: 0, position: "right-2 top-1/2 -translate-y-1/2" },
];

export function FocalPointOverlay({
  category,
  imageUrl,
  value,
  onChange,
}: {
  category: EventCategory;
  imageUrl: string | null;
  value: FocalPoint;
  onChange: (point: FocalPoint) => void;
}) {
  // Already at the edge in this direction: the button is faded and does
  // nothing.
  function atEdge(dx: number, dy: number) {
    return (dx < 0 && value.x <= 0) || (dx > 0 && value.x >= 100) ||
      (dy < 0 && value.y <= 0) || (dy > 0 && value.y >= 100);
  }

  function nudge(dx: number, dy: number) {
    if (atEdge(dx, dy)) return;
    onChange({
      x: round(clamp(value.x + dx * BUTTON_STEP)),
      y: round(clamp(value.y + dy * BUTTON_STEP)),
    });
  }

  return (
    <div className="relative">
      <EventThumbnail
        category={category}
        imageUrl={imageUrl}
        focalPoint={value}
        className={EVENT_PHOTO_CLASS}
      />
      {/* aria-disabled rather than disabled, so a button keeps keyboard
          focus when the point reaches the edge mid-way through repeated
          presses; nudge() ignores it there. type="button" since this sits
          inside NewEventForm's <form>. Translucent ink with a white ring
          and shadow, so they read as controls over light and dark photos. */}
      {imageUrl &&
        NUDGE_BUTTONS.map(({ label, Icon, dx, dy, position }) => {
          const disabled = atEdge(dx, dy);
          return (
            <button
              key={label}
              type="button"
              aria-label={label}
              aria-disabled={disabled || undefined}
              onClick={() => nudge(dx, dy)}
              className={cn(
                position,
                "absolute flex h-7 w-7 items-center justify-center rounded-full bg-foreground/55 text-white shadow-[0_2px_8px_rgba(0,0,0,0.35)] ring-1 ring-white/60 backdrop-blur-[2px] outline-none transition-colors focus-visible:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-white",
                disabled ? "cursor-not-allowed opacity-35" : "hover:bg-foreground/85",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={2.5} />
            </button>
          );
        })}
    </div>
  );
}
