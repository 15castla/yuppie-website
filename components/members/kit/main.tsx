// The page's <main>. Every members page has a real <main> (the native app's
// splash waits for one), and a loading state keeps aria-busy="true" on it.
//
// Loading (Albert, 7 Nov 2026: "Any way to make the whole page instantly?"):
// no loading screens. Moving between members pages keeps the current page
// until the next one is ready, then shows it whole; the tapped link shows the
// tap (kit/link.tsx), and the tabs, Messages and You fetch their pages ahead so
// they open at once. Only a cold load shows a plain busy <main> inside the
// shell (app/members/layout.tsx). Before: placeholder shapes (turned down 17
// Oct), then the title only (4 Nov). The title-only views in system/,
// discounts/ and invite/ are kept for the preview harness, unused by routes.
//
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
