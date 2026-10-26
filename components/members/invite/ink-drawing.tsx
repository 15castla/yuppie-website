// The club's own drawings (components/site/icons.tsx), cropped to their ink
// box so the drawing's ink bottom is its bottom edge and it can stand on a
// rule (RULE-07). Kit counterpart: k2.art(name, w=, h=, line=): give a width
// or a height in px, and `line`, the rendered line weight in px (the public
// Perks draw 1.68px on a phone). The drawings are never redrawn here.

import { CoupesDrawing, TrainerAndCoffeeDrawing } from "@/components/site/icons";
import { cn } from "@/lib/utils";

// [x, y, width, height] of each drawing's ink on its 200-unit grid (the
// kit's ink_boxes.json).
const INK_BOX = {
  coupes: [15.25, 22.5, 169.5, 147.5],
  trainer: [10.5, 94.5, 181.5, 95.0],
} as const;

export type InkDrawingName = keyof typeof INK_BOX;

export function InkDrawing({
  name,
  w,
  h,
  line = 1.68,
  className,
}: {
  name: InkDrawingName;
  /** Rendered width in px (give w or h). */
  w?: number;
  /** Rendered height in px. */
  h?: number;
  /** Rendered line weight in px. */
  line?: number;
  className?: string;
}) {
  const [x, y, bw, bh] = INK_BOX[name];
  const width = w ?? (h ?? 100) * (bw / bh);
  const height = h ?? width * (bh / bw);
  const strokeWidth = line / (width / bw);
  const Drawing = name === "coupes" ? CoupesDrawing : TrainerAndCoffeeDrawing;
  return (
    <Drawing
      size={100}
      viewBox={`${x} ${y} ${bw} ${bh}`}
      width={Number(width.toFixed(2))}
      height={Number(height.toFixed(2))}
      strokeWidth={Number(strokeWidth.toFixed(3))}
      className={cn("oi-drawing", className)}
      style={{ display: "block", overflow: "visible" }}
    />
  );
}
