// The system screens' drawings: the public site's own (components/site/icons.tsx, never redrawn), cropped
// to their ink boxes (the kit's ink_boxes) so the ink bottom is the element's bottom edge, at the heights
// r2b draws them (phone, then 768 and up). Brick phone: page error, global error. Rope: not on the list.
// Trainer and coffee: back in a moment. Sizing is CSS (system.css .sy-art svg) from these variables.

import { BrickPhoneDrawing, TrainerAndCoffeeDrawing, VelvetRopeDrawing } from "@/components/site/icons";
import { cssVars } from "@/components/members/kit";

export type SystemArtName = "phone" | "rope" | "trainer";

const ART = {
  phone: { Drawing: BrickPhoneDrawing, box: [66.5, 10.5, 67, 177], hp: 168, hd: 232 },
  rope: { Drawing: VelvetRopeDrawing, box: [16.5, 52.5, 167, 125], hp: 128, hd: 176 },
  trainer: { Drawing: TrainerAndCoffeeDrawing, box: [10.5, 94.5, 181.5, 95], hp: 120, hd: 168 },
} as const;

export function SystemArt({ name }: { name: SystemArtName }) {
  const { Drawing, box, hp, hd } = ART[name];
  return (
    <Drawing
      size={100}
      viewBox={box.join(" ")}
      style={cssVars({ "--hp": hp, "--hd": hd, "--bw": box[2], "--bh": box[3] })}
    />
  );
}
