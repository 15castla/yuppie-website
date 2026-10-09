// The public pages' title header standard (/apply, /faq, /contact,
// /privacy), shared so other pages match it rather than copying the
// numbers again. Those four pages still spell these values out inline.

// Eyebrow above a page's heading: 10px / 0.24em, 12px from sm:.
export const PAGE_EYEBROW_CLASS =
  "text-[10px] font-bold uppercase tracking-[0.24em] text-foreground sm:text-xs optical-trim";

// Top padding that starts a page's title below the public SiteNav, below
// the safe area (see --safe-top in globals.css). Only for pages that show
// SiteNav; a page without a top nav doesn't need this room.
export const PAGE_TITLE_TOP_PADDING =
  "pt-[calc(7rem+var(--safe-top))] sm:pt-[calc(8rem+var(--safe-top))]";
