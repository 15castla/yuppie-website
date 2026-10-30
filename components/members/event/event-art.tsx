// The event page's drawing: the public site's own line drawing (components/site/icons.tsx, never redrawn),
// cropped to its ink box so the ink bottom is the element's bottom edge and it stands on the 3px rule (RULE-07).
// Kit counterpart: k2 art(name, w, line): `width` in px, `line` the rendered stroke in px.
// Which drawing: coupes for entertainment, the trainer and coffee for sport and personal progression.

import { CoupesDrawing, TrainerAndCoffeeDrawing } from "@/components/site/icons";
import type { EventCategory } from "./model";

const INK_BOX = {
  coupes: [15.25, 22.5, 169.5, 147.5],
  trainer: [10.5, 94.5, 181.5, 95.0],
} as const;

export type EventArtName = keyof typeof INK_BOX;

export function artFor(category: EventCategory): EventArtName {
  return category === "entertainment" ? "coupes" : "trainer";
}

export function EventArt({ name, width, line }: { name: EventArtName; width: number; line: number }) {
  const [x, y, w, h] = INK_BOX[name];
  const height = (width * h) / w;
  const props = {
    size: width,
    width,
    height: Number(height.toFixed(2)),
    viewBox: `${x} ${y} ${w} ${h}`,
    strokeWidth: Number((line / (width / w)).toFixed(3)),
    style: { display: "block", overflow: "visible" as const },
  };
  return name === "coupes" ? <CoupesDrawing {...props} /> : <TrainerAndCoffeeDrawing {...props} />;
}
