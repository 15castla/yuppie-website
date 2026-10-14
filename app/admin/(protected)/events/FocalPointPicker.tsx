"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, type LucideIcon } from "lucide-react";

import type { FocalPoint } from "@/components/members/ui";
import { cn } from "@/lib/utils";

// Shows the whole photo, uncropped, and lets an admin click, tap or drag
// to choose its focal point: the part that stays in frame when members see
// it cropped to 16:9 (EVENT_PHOTO_CLASS). The whole photo rather than the
// cropped frame, because anything already cropped out of the frame
// couldn't be clicked on. The live preview card next to this shows the
// cropped result as the point moves. Pointer events cover mouse, touch and
// pen; arrow keys nudge it for keyboard users, and the arrow buttons below
// the photo nudge it for anyone who wants to fine-tune by clicking.

const clamp = (value: number) => Math.min(100, Math.max(0, value));
const round = (value: number) => Math.round(value * 10) / 10;

// The arrow buttons' step. Bigger than the frame's own arrow-key step
// (2%) since each move is a separate click: 5% moves the marker visibly,
// and crosses the photo in 20 clicks rather than 50.
const BUTTON_STEP = 5;

// Arrow buttons around a blank centre, in a 3x3 grid.
const NUDGE_BUTTONS: {
  label: string;
  Icon: LucideIcon;
  dx: number;
  dy: number;
  cell: string;
}[] = [
  { label: "Move focal point up", Icon: ChevronUp, dx: 0, dy: -1, cell: "col-start-2 row-start-1" },
  { label: "Move focal point left", Icon: ChevronLeft, dx: -1, dy: 0, cell: "col-start-1 row-start-2" },
  { label: "Move focal point right", Icon: ChevronRight, dx: 1, dy: 0, cell: "col-start-3 row-start-2" },
  { label: "Move focal point down", Icon: ChevronDown, dx: 0, dy: 1, cell: "col-start-2 row-start-3" },
];

export function FocalPointPicker({
  imageUrl,
  value,
  onChange,
}: {
  imageUrl: string;
  value: FocalPoint;
  onChange: (point: FocalPoint) => void;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);

  function pointFromEvent(event: PointerEvent<HTMLDivElement>): FocalPoint | null {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    return {
      x: round(clamp(((event.clientX - rect.left) / rect.width) * 100)),
      y: round(clamp(((event.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    if (point) onChange(point);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = pointFromEvent(event);
    if (point) onChange(point);
  }

  // Already at the edge in this direction: the button is greyed out and
  // does nothing.
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

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 2;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onChange({ x: clamp(value.x + move[0]), y: clamp(value.y + move[1]) });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={frameRef}
        role="slider"
        tabIndex={0}
        aria-label="Photo focal point"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value.x)}
        aria-valuetext={`${Math.round(value.x)}% across, ${Math.round(value.y)}% down`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onKeyDown={handleKeyDown}
        className="relative cursor-crosshair touch-none select-none overflow-hidden rounded-xl border border-foreground/10 outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" draggable={false} className="block h-auto w-full" />
        <span
          aria-hidden
          className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-foreground/40 shadow-[0_0_0_1px_rgba(27,21,18,0.6)]"
          style={{ left: `${value.x}%`, top: `${value.y}%` }}
        />
      </div>
      <div className="flex items-start gap-3">
        <p className="flex-1 text-xs text-foreground/50">
          Click or tap the part of the photo that should always stay in frame
          (drag to fine-tune). The preview shows how members will see it.
        </p>
        {/* aria-disabled rather than disabled, so a button keeps keyboard
            focus when the point reaches the edge mid-way through repeated
            presses; nudge() ignores it there. type="button" since this sits
            inside NewEventForm's <form>. */}
        <div className="grid shrink-0 grid-cols-3 grid-rows-3 gap-0.5">
          {NUDGE_BUTTONS.map(({ label, Icon, dx, dy, cell }) => {
            const disabled = atEdge(dx, dy);
            return (
              <button
                key={label}
                type="button"
                aria-label={label}
                aria-disabled={disabled || undefined}
                onClick={() => nudge(dx, dy)}
                className={cn(
                  cell,
                  "flex h-7 w-7 items-center justify-center rounded-full border border-foreground/15 bg-cream text-foreground/70 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-foreground/40",
                  disabled
                    ? "cursor-not-allowed opacity-30"
                    : "hover:border-foreground hover:bg-foreground hover:text-background",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
