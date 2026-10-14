"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import type { FocalPoint } from "@/components/members/ui";

// Shows the whole photo, uncropped, and lets an admin click, tap or drag
// to choose its focal point: the part that stays in frame when members see
// it cropped to 16:9 (EVENT_PHOTO_CLASS). The whole photo rather than the
// cropped frame, because anything already cropped out of the frame
// couldn't be clicked on. The live preview card next to this shows the
// cropped result as the point moves. Pointer events cover mouse, touch and
// pen; arrow keys nudge it for keyboard users.

const clamp = (value: number) => Math.min(100, Math.max(0, value));
const round = (value: number) => Math.round(value * 10) / 10;

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
      <p className="text-xs text-foreground/50">
        Click or tap the part of the photo that should always stay in frame
        (drag to fine-tune). The preview shows how members will see it.
      </p>
    </div>
  );
}
