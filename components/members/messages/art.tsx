// The public site's line drawings, cropped to their ink so the drawing's ink
// bottom is the element's bottom edge and it stands on a rule (RULE-07), at
// the weight the design draws it (k2.art(name, h, line)): a height in px and
// the rendered line weight in px. The drawings themselves are
// components/site/icons.tsx, never redrawn. A phone and a computer size each
// get their own: msg-art-p shows below 768px, msg-art-d from 768px.

import { CoupesDrawing, TrainerAndCoffeeDrawing, VelvetRopeDrawing } from "@/components/site/icons";

type Name = "coupes" | "trainer" | "rope";

// [x, y, width, height] of each drawing's ink in its 200-unit grid (the design's ink_boxes.json).
const BOX: Record<Name, [number, number, number, number]> = {
  coupes: [15.25, 22.5, 169.5, 147.5],
  trainer: [10.5, 94.5, 181.5, 95],
  rope: [16.5, 52.5, 167, 125],
};

const DRAWING = { coupes: CoupesDrawing, trainer: TrainerAndCoffeeDrawing, rope: VelvetRopeDrawing } as const;

export function StandingDrawing({ name, height, line }: { name: Name; height: number; line: number }) {
  const [x, y, bw, bh] = BOX[name];
  const width = (height * bw) / bh;
  const strokeWidth = line / (width / bw);
  const Drawing = DRAWING[name];
  return (
    <Drawing
      size={height}
      width={Number(width.toFixed(2))}
      height={height}
      viewBox={`${x} ${y} ${bw} ${bh}`}
      strokeWidth={Number(strokeWidth.toFixed(3))}
      className="msg-art"
    />
  );
}

/** One drawing at two sizes: the phone's and the computer's. */
export function StandingArt({
  name,
  phone,
  desktop,
}: {
  name: Name;
  phone: { height: number; line: number };
  desktop: { height: number; line: number };
}) {
  return (
    <>
      <span className="msg-art-p">
        <StandingDrawing name={name} {...phone} />
      </span>
      <span className="msg-art-d">
        <StandingDrawing name={name} {...desktop} />
      </span>
    </>
  );
}
