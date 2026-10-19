// Shared look for the public website (/, /apply, /member-login, /faq,
// /contact, /privacy): the "option D" design. Values come from the
// approved boards. The breakpoint between the 390px (mobile) and 1440px
// (desktop) boards is md (768px). Not used by /members, /admin or the
// native app, which have their own styles.

// Each page's outer wrapper: the site fonts (pass almarai.variable and
// instrumentSerif.variable alongside it). On phones its bottom padding is
// the height of the header's fixed bottom strip (site-nav.tsx), so a
// page's last row is never hidden under it. `site-page` is the hook for
// globals.css's no-focus-box rule.
export const SITE_STRIP_PADDING_CLASS = "pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-0";
export const SITE_PAGE_CLASS = `site-page flex flex-1 flex-col bg-background text-foreground antialiased ${SITE_STRIP_PADDING_CLASS}`;
export const SITE_FONT_STYLE = {
  fontFamily: "var(--font-almarai), 'Helvetica Neue', ui-sans-serif, system-ui, sans-serif",
};

// 1240px container. 20px sides on mobile, clamp(20px, 4vw, 40px) from md.
export const SITE_CONTAINER_CLASS = "mx-auto w-full max-w-[1240px] px-5 md:px-[clamp(20px,4vw,40px)]";

// The inner pages' <main> spacing (apply, sign-in, FAQ, contact, privacy).
export const SITE_MAIN_PADDING_CLASS =
  "pt-10 pb-[72px] md:pt-[clamp(48px,7vw,104px)] md:pb-[clamp(80px,10vw,136px)]";

// Instrument Serif italic accent words. SERIF_ACCENT_CLASS sets no
// letter-spacing (the section headings' accents and the step numbers);
// HEADLINE_ACCENT_CLASS is the h1s' accent ("sorted.", "No catch."), at
// -0.01em. Kept as two so no element gets two tracking classes: cn() is a
// plain join, not a Tailwind conflict merge.
export const SERIF_ACCENT_CLASS =
  "[font-family:var(--font-instrument-serif),Georgia,serif] italic font-normal";
export const HEADLINE_ACCENT_CLASS = `${SERIF_ACCENT_CLASS} tracking-[-0.01em]`;

// Inner page h1: 44px mobile, clamp(48px, 6vw, 88px) desktop.
export const PAGE_H1_CLASS =
  "m-0 text-[44px] font-extrabold leading-[0.95] tracking-[-0.03em] md:text-[clamp(48px,6vw,88px)]";

// Ink pill, yellow text, 56px tall, 17px/700. Full width inside cards and
// on mobile is up to the caller (w-full).
export const PRIMARY_BUTTON_CLASS =
  "inline-flex min-h-14 items-center justify-center gap-3 rounded-full border-0 bg-foreground px-7 text-[17px] font-bold text-background no-underline transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-60";

// Pale card with the 2px ink border and hard ink shadow.
export const CARD_CLASS =
  "box-border rounded-[20px] border-2 border-foreground bg-background-muted px-5 py-[22px] shadow-[6px_6px_0_var(--foreground)] md:p-[clamp(28px,3vw,40px)] md:shadow-[8px_8px_0_var(--foreground)]";

// 50px inputs, 16px text (no iOS zoom on focus), 1.5px ink border.
export const INPUT_CLASS =
  "box-border block min-h-[50px] w-full rounded-xl border-[1.5px] border-foreground bg-cream px-3.5 text-base font-normal text-foreground placeholder:text-site-muted outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground md:px-4";

export const LABEL_CLASS = "text-sm font-bold";

// Underlined text link inside body copy.
export const TEXT_LINK_CLASS = "font-bold text-foreground underline underline-offset-2 hover:opacity-70";

// Links that never show a box: no outline in any state and no iOS tap
// highlight, so nothing is left around a link after a click, a tap or a
// programmatic focus. Keyboard focus (:focus-visible) shows a 3px
// underline instead, offset like the current page's. Used by the header,
// the mobile menu and the homepage footer.
export const NO_BOX_CLASS = "outline-none [-webkit-tap-highlight-color:transparent]";
export const FOCUS_UNDERLINE_CLASS = `${NO_BOX_CLASS} focus-visible:underline focus-visible:decoration-[3px] focus-visible:underline-offset-[6px]`;

// The current page's link in the header.
export const CURRENT_LINK_CLASS = "underline decoration-2 underline-offset-[6px]";

