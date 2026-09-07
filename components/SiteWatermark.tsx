"use client";

import { usePathname } from "next/navigation";
import Image from "next/image";

// Rendered here (in the root layout, outside app/template.tsx's animated
// wrapper) rather than inline on each page, so this fixed-position element
// is never a descendant of that wrapper's transform. A non-none transform
// on an ancestor becomes the containing block for position: fixed
// descendants, which briefly misplaces anything fixed inside it during
// the page-transition animation.
const WATERMARK_ROUTES = ["/apply", "/faq", "/member-login"];

export function SiteWatermark() {
  const pathname = usePathname();

  if (!WATERMARK_ROUTES.includes(pathname)) {
    return null;
  }

  return (
    <div
      aria-hidden
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
