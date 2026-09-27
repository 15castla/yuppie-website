import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

// Exported so other components that need this exact pill look (but can't
// use <Button> itself, e.g. a container wrapping more than one link)
// share this one definition instead of copying the class string somewhere
// else and risking it drifting out of sync.
// disabled:transition-none is load-bearing: without it, the disabled-state
// opacity/scale change gets caught up in the same transition as the hover
// state and the CSS transition never resolves (observed stuck mid-transition
// indefinitely via getAnimations()), producing a visible glitch/flicker
// instead of a clean dim. Applying the disabled look instantly avoids that.
export const buttonBaseClasses =
  "inline-flex items-center justify-center rounded-full bg-[#1B1512] px-10 py-4 text-base font-bold text-[#FFD904] transition-all duration-200 ease-out hover:scale-[1.03] hover:bg-[#2A2420] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:transition-none";

type ButtonAsButton = ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: undefined;
};

type ButtonAsAnchor = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

export function Button({ className, ...props }: ButtonProps) {
  const classes = [buttonBaseClasses, className].filter(Boolean).join(" ");

  if (props.href !== undefined) {
    return (
      <a {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)} className={classes} />
    );
  }

  return (
    <button {...(props as ButtonHTMLAttributes<HTMLButtonElement>)} className={classes} />
  );
}
