"use client";

import { useState } from "react";
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

// How far the crop can actually move depends on the photo's shape.
// object-fit: cover scales the photo until it exactly fills one dimension
// of the 16:9 frame, so only the other dimension overflows: a photo
// narrower than 16:9 can only move up/down, a wider one only left/right.
// The overflow, as a fraction of the frame's size on that axis, is
// max(F/r, r/F) - 1 (r = the photo's width/height, F = 16/9): 0.19 for a
// 3:2 photo, 0.33 for 4:3, 0.35 for a 2.4:1 panorama, 1.37 for a 3:4
// portrait. It doesn't depend on how big the frame is drawn, so the same
// numbers hold on the admin card and the members' event page.
const FRAME_RATIO = 16 / 9;

// Below this, an axis's movement is too small to be worth an arrow (a
// photo only just off 16:9): its arrows are disabled.
const MIN_TRAVEL = 0.03;

// Each press aims to move the crop about 2.5% of the frame (roughly 3px on
// the admin card, 11px on the event page), but never takes fewer than 4
// presses to cross edge to edge (so there's still something to adjust) or
// more than 12 (so a tall portrait isn't tedious).
const TRAVEL_PER_PRESS = 0.025;
const MIN_PRESSES = 4;
const MAX_PRESSES = 12;

// Before the photo has loaded (its shape isn't known yet), both axes work
// and move 5% per press, as before.
const FALLBACK_STEP = 5;

type PhotoSize = { url: string; width: number; height: number };

// One press along an axis. Lands exactly on 0 or 100 when it ends up within
// half a step of the edge, so rounding (100/12 = 8.33...) never leaves a
// final, invisible press to get the rest of the way there.
function move(current: number, direction: number, step: number | null) {
  if (!direction || step === null) return current;
  const next = clamp(current + direction * step);
  if (next > 100 - step / 2) return 100;
  if (next < step / 2) return 0;
  return round(next);
}

function axisSteps(size: { width: number; height: number } | null): { x: number | null; y: number | null } {
  if (!size) return { x: FALLBACK_STEP, y: FALLBACK_STEP };
  const ratio = size.width / size.height;
  const travel = Math.max(FRAME_RATIO / ratio, ratio / FRAME_RATIO) - 1;
  if (travel < MIN_TRAVEL) return { x: null, y: null };
  const presses = Math.min(MAX_PRESSES, Math.max(MIN_PRESSES, Math.round(travel / TRAVEL_PER_PRESS)));
  const step = 100 / presses;
  // null = no movement on this axis for this photo.
  return ratio < FRAME_RATIO ? { x: null, y: step } : { x: step, y: null };
}

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
  // The loaded photo's natural size, tagged with its URL so a newly chosen
  // or different photo is treated as unknown until it loads.
  const [photoSize, setPhotoSize] = useState<PhotoSize | null>(null);
  const size = photoSize && photoSize.url === imageUrl ? photoSize : null;
  const steps = axisSteps(size);

  function handleImageLoad(loaded: { width: number; height: number }) {
    if (!imageUrl) return;
    // Same size as already stored: keep the same object, so this doesn't
    // re-render (EventThumbnail reports it again on every render).
    setPhotoSize((prev) =>
      prev && prev.url === imageUrl && prev.width === loaded.width && prev.height === loaded.height
        ? prev
        : { url: imageUrl, ...loaded },
    );
  }

  // Faded and does nothing: either this axis can't move this photo at all,
  // or the point is already at the edge in this direction.
  function isDisabled(dx: number, dy: number) {
    if ((dx !== 0 && steps.x === null) || (dy !== 0 && steps.y === null)) return true;
    return (dx < 0 && value.x <= 0) || (dx > 0 && value.x >= 100) ||
      (dy < 0 && value.y <= 0) || (dy > 0 && value.y >= 100);
  }

  function nudge(dx: number, dy: number) {
    if (isDisabled(dx, dy)) return;
    onChange({
      x: move(value.x, dx, steps.x),
      y: move(value.y, dy, steps.y),
    });
  }

  return (
    <div className="relative">
      <EventThumbnail
        category={category}
        imageUrl={imageUrl}
        focalPoint={value}
        className={EVENT_PHOTO_CLASS}
        // The admin preview cards are 280px wide.
        sizes="280px"
        onImageLoad={handleImageLoad}
      />
      {/* aria-disabled rather than disabled, so a button keeps keyboard
          focus when the point reaches the edge mid-way through repeated
          presses; nudge() ignores it there. type="button" since this sits
          inside NewEventForm's <form>. Translucent ink with a white ring
          and shadow, so they read as controls over light and dark photos. */}
      {imageUrl &&
        NUDGE_BUTTONS.map(({ label, Icon, dx, dy, position }) => {
          const disabled = isDisabled(dx, dy);
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
