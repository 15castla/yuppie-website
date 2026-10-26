import type { CSSProperties } from "react";

// React's CSSProperties has no room for custom properties. The kit sets a
// few inline (--s on an avatar, --fw/--fh/--fs on a drawing); this is the
// one typed way to do it.
export function cssVars(vars: Record<`--${string}`, string | number>): CSSProperties {
  return vars as CSSProperties;
}
