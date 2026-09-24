import { type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

// Shared by every /admin content-management form (events, discounts,
// access, feature card). Was previously copy-pasted byte-for-byte into
// each of those files.
export const inputClasses =
  "w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/40";
export const labelClasses = "text-xs font-semibold uppercase tracking-wider text-foreground/50";

// Wraps a native <select> so it renders identically to a plain text
// input: a browser draws a <select>'s own arrow/padding regardless of
// the classes applied to it, which is why every dropdown in this
// codebase used to look visibly different from the inputs next to it.
// appearance-none strips that native chrome, pr-9 leaves room for the
// chevron rendered here instead, and the wrapper (always w-full, same as
// inputClasses, so it sizes identically to a bare select in every
// context this replaces (flex row, flex-col field, grid cell) is just so
// that chevron can be positioned against the select itself.
export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative w-full">
      <select className={cn(inputClasses, "appearance-none pr-9", className)} {...props} />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
    </div>
  );
}
