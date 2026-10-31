"use client";

// "Move and zoom": a square stage with the photo under a dimmed mask and a
// circle cut out (80% of the stage), dragged to move, with a slider and two
// 44px buttons to zoom. Works with a mouse, a finger (drag, and pinch with
// two) and a keyboard (arrow keys move, plus and minus zoom). The maths is in
// lib/members/photo/crop.ts.
//
// Controlled: the parent keeps the crop so the same numbers reach the export.
// needs_device_check: drag and pinch on a real phone.

import "./photo.css";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { Icon, Pill, cssVars } from "@/components/members/kit";
import { CIRCLE_RATIO, MIN_ZOOM, clampCrop, imageBox, maxZoomFor, type CropState } from "@/lib/members/photo/crop";
import type { PhotoSource } from "@/lib/members/photo/validate";
import { cn } from "@/lib/utils";

const ZOOM_STEP = 0.25;
const KEY_STEP = 0.03;

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function PhotoCropper({
  source,
  crop,
  onChange,
  big = false,
  hint = true,
}: {
  source: PhotoSource;
  crop: CropState;
  onChange: (crop: CropState) => void;
  /** The 360px stage of the computer's modal. */
  big?: boolean;
  /** Show "Drag to move" until the photo is first moved. */
  hint?: boolean;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ start: number; zoom: number } | null>(null);
  const [moved, setMoved] = useState(false);

  const box = imageBox(source, crop);
  // The slider spans this photo's own zoom (never so far that the saved square is under 400px).
  const zoomSpan = maxZoomFor(source) - MIN_ZOOM;
  const percent = zoomSpan > 0 ? Math.min(100, Math.max(0, ((crop.zoom - MIN_ZOOM) / zoomSpan) * 100)) : 0;

  function update(next: CropState) {
    onChange(clampCrop(source, next));
  }

  // The circle's diameter in screen pixels: 80% of the stage's width.
  function diameter() {
    return (stage.current?.getBoundingClientRect().width ?? 1) * CIRCLE_RATIO;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { start: distance(a, b), zoom: crop.zoom };
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);

    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const ratio = distance(a, b) / Math.max(1, pinch.current.start);
      update({ ...crop, zoom: pinch.current.zoom * ratio });
      setMoved(true);
      return;
    }
    if (pointers.current.size === 1) {
      const d = diameter();
      update({ ...crop, x: crop.x + (point.x - previous.x) / d, y: crop.y + (point.y - previous.y) / d });
      setMoved(true);
    }
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      update({ ...crop, x: crop.x + move[0], y: crop.y + move[1] });
      setMoved(true);
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      update({ ...crop, zoom: crop.zoom + ZOOM_STEP });
    } else if (event.key === "-") {
      event.preventDefault();
      update({ ...crop, zoom: crop.zoom - ZOOM_STEP });
    }
  }

  return (
    <div className={cn("ph-crop-wrap", big && "is-big")} data-needs-device-check="true">
      <div
        ref={stage}
        className="ph-crop"
        role="group"
        tabIndex={0}
        aria-label="Your photo, with a circle that shows what other members will see. Drag to move it. Plus and minus zoom."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={source.url}
          alt=""
          draggable={false}
          style={cssVars({ "--w": `${box.width}%`, "--l": `${box.left}%`, "--t": `${box.top}%` })}
        />
        <i className="ph-mask" />
        <i className="ph-circle" />
        <span className="ph-hint">{hint && !moved ? <Pill kind="ink">Drag to move</Pill> : null}</span>
      </div>
      <div className="ph-zoom">
        <button type="button" className="ph-zb" aria-label="Zoom out" onClick={() => update({ ...crop, zoom: crop.zoom - ZOOM_STEP })}>
          <Icon name="minus" size={20} />
        </button>
        <input
          type="range"
          className="ph-range"
          aria-label="Zoom"
          min={0}
          max={100}
          step={1}
          value={Math.round(percent)}
          style={cssVars({ "--p": `${percent}%` })}
          onChange={(event) => update({ ...crop, zoom: MIN_ZOOM + (Number(event.target.value) / 100) * zoomSpan })}
        />
        <button type="button" className="ph-zb" aria-label="Zoom in" onClick={() => update({ ...crop, zoom: crop.zoom + ZOOM_STEP })}>
          <Icon name="plus" size={20} />
        </button>
      </div>
    </div>
  );
}
