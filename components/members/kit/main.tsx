// The page's <main>. Every members page has a real <main> (the native app's
// splash waits for one), and a loading state keeps aria-busy="true" on it.
// Kit counterpart: the <main class="main-pad"> inside .page. It is a direct
// child of the shell's .mk-page, so .mk-page > .mk-main fills the height and
// the tab bar sits at the foot.
//   fill   makes it a column, so a closing band or empty state reaches down to
//          the tab bar's rule (Discounts, Access, empty states)
//   pad    false drops the 40px bottom padding (a page that ends on a band)

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Main({
  className,
  fill = false,
  pad = true,
  busy = false,
  children,
}: {
  className?: string;
  fill?: boolean;
  pad?: boolean;
  /** Loading: aria-busy="true". Only while loading, so the splash stays up until the page is ready. */
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <main
      className={cn("mk-main", pad && "mk-main-pad", fill && "mk-main-fill", className)}
      aria-busy={busy || undefined}
    >
      {children}
    </main>
  );
}
