"use client";

import { usePathname } from "next/navigation";
import Image from "next/image";

// Rendered here (in the root layout, outside app/template.tsx's animated
// wrapper) rather than inline on each page, so this fixed-position element
// is never a descendant of that wrapper's transform. A non-none transform
// on an ancestor becomes the containing block for position: fixed
// descendants, which briefly misplaces anything fixed inside it during
// the page-transition animation.
//
// Only the native app's sign-in screen (member-login-form-native.tsx)
// shows it now: the website's pages dropped it in the option D redesign.
// Both share the /member-login route, so it's always rendered there and
// globals.css hides it unless <html data-native-app> is set (before the
// first paint, by app/layout.tsx), so neither side flashes the other's
// look on load.
//
// Back on the app's sign-in screen (Albert, 8 Nov 2026, option B: "I don't
// like the login page. What's with the Yuppie on the line?"). From 28 Oct the
// screen drew the wordmark in solid ink on a 3px rule (members backend A, r2a
// section 7); this faint one, edge to edge at the foot, is what it had before.
const WATERMARK_ROUTES = ["/member-login"];

export function SiteWatermark() {
  const pathname = usePathname();

  if (!WATERMARK_ROUTES.includes(pathname)) {
    return null;
  }

  return (
    <div
      aria-hidden
      data-site-watermark
      className="pointer-events-none fixed inset-x-0 bottom-0 select-none"
    >
      <Image
        src="/yuppie_logo_forte_forward.png"
        alt=""
        width={1942}
        height={641}
        className="h-auto w-full opacity-10"
      />
    </div>
  );
}
