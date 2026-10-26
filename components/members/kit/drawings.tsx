// The public site's line drawings, standing on a rule. The drawings
// themselves are components/site/icons.tsx (never redrawn here). This file
// only crops each one to its ink box so its ink bottom is the element's
// bottom edge (RULE-07: drawings stand on rules), and sizes it the way the
// public Perks section does (width and height as shares of a --slot, one
// stroke weight). Kit counterparts: k2.perk_art(name), k2.trainer_full().
//
// Use PerkDrawing for coupes, tag, rope and phone inside a .mk-art box
// (--slot 120px on a phone, 176px from 768; override --slot in your own CSS).
// Use TrainerDrawing for the trainer and coffee on an Open Invite card.

import type { CSSProperties } from "react";

import {
  BrickPhoneDrawing,
  CoupesDrawing,
  PriceTagDrawing,
  TrainerAndCoffeeDrawing,
  VelvetRopeDrawing,
} from "@/components/site/icons";
import { cn } from "@/lib/utils";
import { cssVars } from "./css-vars";

export type PerkDrawingName = "coupes" | "tag" | "rope" | "phone";

// [x, y, width, height] of each drawing's ink (strokes included) in its
// 200-unit grid, from the kit's ink_boxes.json; fw, fh are the share of the
// slot, fs the stroke in grid units: the public Perks fit.
const PERK_FIT: Record<
  PerkDrawingName,
  { box: [number, number, number, number]; fw: number; fh: number; fs: number }
> = {
  coupes: { box: [15.25, 22.5, 169.5, 147.5], fw: 0.9259, fh: 0.8057, fs: 3.204 },
  tag: { box: [30.25, 28.5, 141.0, 125.75], fw: 0.9136, fh: 0.8164, fs: 2.698 },
  rope: { box: [16.5, 52.5, 167.0, 125.0], fw: 0.9983, fh: 0.7472, fs: 2.927 },
  phone: { box: [66.5, 10.5, 67.0, 177.0], fw: 0.3785, fh: 1.0, fs: 3.098 },
};

const PERK_COMPONENTS = {
  coupes: CoupesDrawing,
  tag: PriceTagDrawing,
  rope: VelvetRopeDrawing,
  phone: BrickPhoneDrawing,
} as const;

export function PerkDrawing({ name, className }: { name: PerkDrawingName; className?: string }) {
  const { box, fw, fh, fs } = PERK_FIT[name];
  const Drawing = PERK_COMPONENTS[name];
  const style: CSSProperties = cssVars({ "--fw": fw, "--fh": fh, "--fs": fs });
  return (
    <Drawing
      size={100}
      viewBox={box.join(" ")}
      className={cn("mk-perk-svg", className)}
      style={style}
    />
  );
}

// The trainer and coffee exactly as the public Open Invite card draws it:
// the full 200 grid, ink bottom at 189.5. Place it with .mk-invite-art
// (absolute, standing on the card's top edge) or your own class.
export function TrainerDrawing({ className }: { className?: string }) {
  return <TrainerAndCoffeeDrawing size={96} className={cn("mk-invite-art", className)} />;
}
