// The homepage (option D design: design-ref/boards/DHome and DHomeMobile).
// A server component: nothing on it is interactive beyond links.

import Image from "next/image";
import Link from "next/link";
import { Fragment, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { almarai, instrumentSerif } from "@/components/templates/creative-studio/fonts";
import {
  ArrowRightIcon,
  BrickPhoneDrawing,
  CheckIcon,
  CoupesDrawing,
  PriceTagDrawing,
  TrainerAndCoffeeDrawing,
  VelvetRopeDrawing,
} from "./icons";
import { COMPANY, CONTACT_EMAIL, EXTERNAL_LINKS, REGISTERED_OFFICE } from "./links";
import { StepList, StepRow } from "./step-list";
import {
  FOCUS_UNDERLINE_CLASS,
  HEADLINE_ACCENT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SERIF_ACCENT_CLASS,
  SITE_CONTAINER_CLASS,
  SITE_FONT_STYLE,
  SITE_PAGE_CLASS,
} from "./ui";

type DrawingComponent = typeof CoupesDrawing;

// Each perk drawing's ink box in its 200-unit grid, strokes included
// (rendered and pixel-scanned at the desktop stroke width of 3), as
// [x, y, width, height]. Used as the drawing's viewBox here so its ink
// fills its box exactly and ends on the box's bottom; the drawings' own
// 200x200 boxes have different empty margins.
type InkBox = [number, number, number, number];

// How each drawing fills the one square slot every perk drawing gets
// (design/specs/round2-home.md, H2): its width and height as shares of the
// slot, chosen so all four have the same ink area (only the tall brick
// phone is capped by the slot's height), and its stroke in grid units, so
// every line renders at the same weight (1.68px on phones, 2.39px at 1440).
type PerkFit = { w: number; h: number; stroke: number };

// Each perk's copy is shorter on mobile (the boards differ).
const PERKS: { title: string; desktop: string; mobile: string; Drawing: DrawingComponent; ink: InkBox; fit: PerkFit }[] = [
  {
    title: "Events",
    desktop:
      "Supper clubs, Padel & Pints, wellness mornings and nights out, planned and run by our team. At cost, never marked up.",
    mobile: "Supper clubs, Padel & Pints and nights out. Run by us, at cost.",
    Drawing: CoupesDrawing,
    ink: [15.25, 22.5, 169.5, 147.5],
    fit: { w: 0.9259, h: 0.8057, stroke: 3.204 },
  },
  {
    title: "Discounts",
    desktop: "Money off at restaurants, bars, barbers, gyms and sports clubs in the city.",
    mobile: "Money off at restaurants, bars, gyms and clubs.",
    Drawing: PriceTagDrawing,
    ink: [30.25, 28.5, 140.875, 125.875],
    fit: { w: 0.9136, h: 0.8164, stroke: 2.698 },
  },
  {
    title: "Access",
    desktop: "Members’ clubs, skip-the-queue entry, guest lists and first dibs before things sell out.",
    mobile: "Members’ clubs, guest lists and first dibs.",
    Drawing: VelvetRopeDrawing,
    ink: [16.5, 52.5, 167, 125],
    fit: { w: 0.9983, h: 0.7472, stroke: 2.927 },
  },
  {
    title: "Concierge",
    desktop: "Built on a top hotel concierge’s black book. Ask it anything, and it learns your taste.",
    mobile: "A top hotel concierge’s black book. It learns your taste.",
    Drawing: BrickPhoneDrawing,
    ink: [66.5, 10.5, 67, 177],
    fit: { w: 0.3785, h: 1, stroke: 3.098 },
  },
];

const OPEN_INVITE_STEPS = ["Post an invite", "Members say yes", "Go together"];

const MEMBERSHIP_INCLUDES = [
  "Events run by us, at cost",
  "Open Invites from other members",
  "Discounts, access and the concierge",
];

function ApplyButton({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Link href="/apply" className={cn(PRIMARY_BUTTON_CLASS, className)}>
      {children}
      <ArrowRightIcon />
    </Link>
  );
}

export function SiteHome() {
  return (
    <div className={cn(almarai.variable, instrumentSerif.variable, SITE_PAGE_CLASS)} style={SITE_FONT_STYLE}>
      <main>
        <Hero />
        <Perks />
        <OpenInvite />
        <Membership />
      </main>
      <SiteFooter />
    </div>
  );
}

// Desktop: headline, intro and button on the left, the drawing on the
// right, standing on the rule along the section's bottom.
//
// Phones: exactly the rest of the first screen (100svh less the phone
// bar's --site-header-h and the top safe area), with a full-width 3px rule as the
// section's bottom border. Headline, then the intro and button, then the
// whole drawing (never cropped) in the leftover height (at least 180px),
// centred and standing on that bottom rule. On a screen too short for the
// 180px the hero just grows past the fold.
function Hero() {
  return (
    <section className="flex min-h-[calc(100svh-var(--site-header-h)-var(--safe-top))] flex-col border-b-[3px] border-foreground md:block md:min-h-0 md:border-b-[3px]">
      <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-x-12 md:px-[clamp(20px,4vw,40px)]">
        <h1 className="m-0 px-5 pt-[22px] text-[64px] font-extrabold leading-[0.92] tracking-[-0.04em] [text-wrap:balance] md:col-start-1 md:row-start-1 md:px-0 md:pt-[clamp(48px,7vw,120px)] md:text-[clamp(56px,7vw,104px)] md:leading-[0.95] md:tracking-[-0.03em]">
          Your social life, <span className={HEADLINE_ACCENT_CLASS}>sorted.</span>
        </h1>
        {/* The SVG's viewBox is trimmed to its ink on the left, top and
            right, so on desktop its right edge (the right-hand figure's
            arm) lands on the container's right edge, in line with the
            header's Apply pill. Max widths are the old 500px / 340px scaled
            by 463.5/540 (the trimmed width), so the drawing keeps its size. */}
        {/* Phones: last (order-2), 26px under the button. The whole drawing
            is sized to the area's height (never wider than the 350px
            container: max-height is that width's matching height) and
            centred. Its viewBox keeps 7.5 units of empty space under the
            feet (bottom of 620, ink ending at 612.5), so it's moved down by
            exactly that, 7.5/615.375 of its own height, and the feet stand
            on the section's bottom rule at any size. */}
        <div className="relative order-2 mx-5 mt-[26px] min-h-[180px] flex-1 md:order-none md:col-start-2 md:row-span-2 md:row-start-1 md:mx-0 md:mt-0 md:flex md:min-h-0 md:flex-none md:justify-end md:self-end md:pt-6">
          <Image
            src="/yuppie-group.svg"
            alt="Line drawing of three young yuppies out together: one on a brick phone, two clinking champagne coupes"
            width={463.5}
            height={615.375}
            loading="eager"
            fetchPriority="high"
            className="absolute bottom-0 left-1/2 block h-full max-h-[calc((100vw-40px)*615.375/463.5)] w-auto -translate-x-1/2 translate-y-[1.21875%] md:static md:-mb-0.5 md:h-auto md:max-h-none md:w-full md:max-w-[429.17px] md:translate-none"
          />
        </div>
        {/* Phones: second (order-1), 16px under the headline. */}
        <div className="order-1 mt-4 flex flex-col gap-[22px] px-5 md:order-none md:col-start-1 md:row-start-2 md:mt-0 md:gap-7 md:px-0 md:pt-7 md:pb-[clamp(56px,8vw,136px)]">
          <p className="m-0 text-[17px] leading-[1.45] max-md:[text-wrap:balance] md:max-w-[460px] md:text-[19px] md:leading-normal">
            <span className="md:hidden">
              A club for full diaries and empty weekends.
            </span>
            <span className="hidden md:inline">
              A club for full diaries and empty weekends. Dinners, sport,
              parties and perks, all planned for you. You just show up.
            </span>
          </p>
          <div>
            <ApplyButton className="w-full md:w-auto">Apply for membership</ApplyButton>
          </div>
        </div>
      </div>
    </section>
  );
}

// The perk drawing slot on phones (the drawing column before round 3); it
// grows to 137px at 1440 (--perk-slot below). Here it only sets the SVG's
// width and height attributes, before the CSS sizes it.
const PERK_SLOT_MIN = 96;

// Four ruled rows: the words on the container's left edge, each drawing
// in one square slot on the right edge (--perk-slot: 96px on phones,
// growing to 137px at 1440), centred on the slot's centre line, with its
// ink bottom standing on the row's 1.5px rule (RULE-07: the drawing box's
// negative bottom margin equals the row's bottom padding). Phones: one
// column, the words centred in the row. Desktop: two columns where two
// 420px columns fit (about 975px wide and up), one below that, never
// three; the words hang from the top so the titles share one line. Every
// row takes the tallest row's height.
function Perks() {
  return (
    <section
      id="perks"
      className={cn(
        SITE_CONTAINER_CLASS,
        "pt-[88px] pb-[88px] md:pt-[clamp(72px,9vw,122px)] md:pb-[clamp(72px,9vw,128px)]",
      )}
    >
      {/* Desktop: the top padding tops out at 122px and the heading's
          bottom margin at 74px, so neither empty band (hero rule to the
          heading's ink, heading's ink to the first title's ink) passes
          128px at any width (RULE-11). */}
      <h2 className="m-0 text-[40px] font-extrabold leading-none tracking-[-0.025em] md:mb-[clamp(48px,6vw,74px)] md:text-[clamp(40px,4.6vw,64px)]">
        Four reasons to <span className={SERIF_ACCENT_CLASS}>leave the office.</span>
      </h2>
      <div className="mt-9 grid grid-cols-1 auto-rows-fr border-t-[1.5px] border-foreground [--perk-slot:clamp(96px,9.5vw,137px)] md:mt-0 md:grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] md:gap-x-[clamp(40px,5.5vw,80px)] md:border-t-0">
        {PERKS.map(({ title, desktop, mobile, Drawing, ink, fit }) => (
          <article
            key={title}
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_var(--perk-slot)] grid-rows-[1fr_auto_auto_1fr] gap-x-4 border-b-[1.5px] border-foreground py-6 md:grid-rows-[auto_auto_1fr] md:gap-x-8 md:py-10"
          >
            <div className="col-start-2 row-span-full -mb-6 flex w-[var(--perk-slot)] items-end justify-center self-end md:-mb-10">
              {/* The slot times this drawing's fit shares (unitless
                  --fit-w and --fit-h); its own stroke (--fit-stroke, grid
                  units) gives every drawing the same rendered line. */}
              <Drawing
                size={PERK_SLOT_MIN * fit.w}
                viewBox={ink.join(" ")}
                width={PERK_SLOT_MIN * fit.w}
                height={PERK_SLOT_MIN * fit.h}
                className="block h-[calc(var(--perk-slot)*var(--fit-h))] w-[calc(var(--perk-slot)*var(--fit-w))] overflow-visible [stroke-width:var(--fit-stroke)]"
                style={{ "--fit-w": fit.w, "--fit-h": fit.h, "--fit-stroke": fit.stroke } as CSSProperties}
              />
            </div>
            <h3 className="m-0 col-start-1 row-start-2 mb-1.5 self-end text-2xl leading-[1.2] font-extrabold tracking-[-0.01em] md:row-start-1 md:mb-2.5 md:self-auto">
              {title}
            </h3>
            {/* Phones: text-wrap: pretty, so no description ends on one
                word; a browser without it wraps as before. */}
            <p className="m-0 col-start-1 row-start-3 self-start text-base leading-[1.45] max-md:[text-wrap:pretty] md:row-start-2 md:max-w-[420px] md:leading-[1.55]">
              <span className="md:hidden">{mobile}</span>
              <span className="hidden md:inline">{desktop}</span>
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

// The example invite card's rows, in order, as [label, value] (Albert,
// 23 Oct). Times in the 24-hour house style. Change a value here to swap
// it; the card is an example, which its figure's aria-label says.
const OPEN_INVITE_EXAMPLE: [label: string, value: string][] = [
  ["When", "Saturday, 10:00"],
  ["Where", "Psycle, Oxford Circus"],
  ["Posted by", "Jasmin"],
];

// A card value breaks only after a comma, never inside a name: where its
// column is too narrow for one line (320 wide, and about 768 to 900) it
// reads "Psycle," then "Oxford Circus", not "Psycle, Oxford" then "Circus".
function CommaBreaks({ text }: { text: string }) {
  const parts = text.split(", ");
  return parts.map((part, i) => (
    <Fragment key={part}>
      {i > 0 && " "}
      <span className="whitespace-nowrap">{i < parts.length - 1 ? `${part},` : part}</span>
    </Fragment>
  ));
}

function OpenInvite() {
  return (
    <section id="open-invite" className="border-y-[3px] border-foreground bg-cream">
      <div
        className={cn(
          SITE_CONTAINER_CLASS,
          "flex flex-col pt-16 pb-[72px] md:flex-row md:flex-nowrap md:items-center md:gap-x-[clamp(40px,5.5vw,80px)] md:py-[clamp(72px,9vw,128px)]",
        )}
      >
        {/* Desktop: the words and the example card side by side at every
            width from 768 (never wrapped, so the card never falls under
            the words and leaves half the band empty). */}
        <div className="flex min-w-0 flex-col gap-[18px] md:flex-[1_1_360px] md:gap-7">
          <h2
            className={cn(
              "m-0 text-[84px] leading-[0.9] md:text-[clamp(72px,8.6vw,128px)] md:leading-[0.88]",
              SERIF_ACCENT_CLASS,
              "tracking-[-0.02em]",
            )}
          >
            Open Invite
          </h2>
          <p className="m-0 text-[17px] leading-normal md:max-w-[520px] md:text-[19px]">
            <span className="md:hidden">
              A marketplace for plans, run by members. Fancy a Saturday class and brunch, but your friends
              are busy? Post it and find members who want to do the same.
            </span>
            <span className="hidden md:inline">
              A marketplace for plans, run by members. Fancy a Saturday class and brunch, but your friends
              are busy? Post it and find members who want to do the same, or browse what others are planning
              and say you’re in.
            </span>
          </p>
          {/* Desktop: the steps under the lead. Phones: one row of three
              under the lead, so the example card closes the section. */}
          <div className="hidden md:block">
            <StepList steps={OPEN_INVITE_STEPS} className="md:mt-1 md:max-w-[560px]" />
          </div>
          <StepRow steps={OPEN_INVITE_STEPS} className="mt-4 md:hidden" />
        </div>

        {/* The trainer and the cup stand on the card's top edge: `top` is
            minus the box height times 189.5/200, the ink's bottom, so it
            sits on the 2px top border (RULE-07). They are inset 24px (48px
            from 768) so they stand on the straight edge, clear of the 20px
            corner radius. */}
        <div className="relative mt-[68px] min-w-0 md:mt-0 md:max-w-[440px] md:flex-[1_1_300px] md:pt-14 md:pr-6">
          <TrainerAndCoffeeDrawing
            size={168}
            className="absolute top-[-91px] right-6 z-10 block size-[96px] md:top-[-103.2px] md:right-12 md:size-[168px]"
          />
          {/* An example invite, not a real one: the "I'm in" pill is part
              of the picture, so it isn't a button. It is the small 44px
              pill sized to its word (the header Apply pill's height and
              15px type), so it never looks like the page's real Apply
              buttons. The `!`s are needed because cn() is a plain join:
              without them PRIMARY_BUTTON_CLASS's min-h-14, px-7 and
              text-[17px] come later in the CSS and win. */}
          <figure
            aria-label="Example Open Invite"
            className="relative m-0 mr-1.5 flex flex-col rounded-[20px] border-2 border-foreground bg-background px-[22px] pt-6 pb-[22px] shadow-[6px_6px_0_var(--foreground)] md:mr-0 md:gap-5 md:p-[clamp(28px,3vw,40px)] md:shadow-[8px_8px_0_var(--foreground)]"
          >
            <span className="inline-flex min-h-6 items-center self-start rounded-full bg-foreground px-2.5 text-xs font-bold text-background md:min-h-[26px] md:px-3">
              Open Invite
            </span>
            <h3 className="m-0 mt-3.5 mb-4 text-2xl font-extrabold leading-[1.1] tracking-[-0.015em] md:m-0 md:text-[28px]">
              Saturday morning class + brunch
            </h3>
            <dl className="m-0 mb-5 grid grid-cols-[96px_1fr] gap-x-0 gap-y-2 text-[15px] md:mb-0 md:grid-cols-[auto_1fr] md:gap-x-5 md:gap-y-2.5 md:text-[15px]">
              {OPEN_INVITE_EXAMPLE.map(([label, value]) => (
                <Fragment key={label}>
                  <dt className="font-bold">{label}</dt>
                  <dd className="m-0">
                    <CommaBreaks text={value} />
                  </dd>
                </Fragment>
              ))}
            </dl>
            <span
              aria-hidden
              className={cn(PRIMARY_BUTTON_CLASS, "hover:opacity-100 min-h-11! self-start px-5! text-[15px]!")}
            >
              I’m in
            </span>
          </figure>
        </div>
      </div>
    </section>
  );
}

// The deal: the first half of the page's one ending (the closing band in
// SiteFooter is the second). No Apply button here: the page asks once,
// after the price and the rope. Phones: centred, the card under the words.
// Desktop: the words on the left, the £10 card on the right, its 8px
// shadow ending on the container's right edge. The card is the section's
// first and last ink, so the bottom padding is the top padding plus the
// shadow: equal gaps above the card and below its shadow (RULE-10).
// Phones: 72px above the headline's box (its ink starts about 4px lower)
// and 76px below the card's 6px shadow, so the ink gaps match (RULE-10);
// the headline shrinks below 375 so "One membership." stays one line, and
// the card stops at 460px and centres (from 506px wide).
function Membership() {
  return (
    <section
      id="membership"
      className={cn(
        SITE_CONTAINER_CLASS,
        "flex flex-col items-center gap-3.5 pt-[72px] pb-[82px] text-center md:grid md:grid-cols-2 md:grid-rows-[auto_auto] md:items-center md:gap-x-[clamp(40px,5.5vw,80px)] md:gap-y-0 md:pt-[clamp(72px,9vw,128px)] md:pb-[calc(clamp(72px,9vw,128px)+8px)] md:text-left",
      )}
    >
      <h2 className="m-0 text-[clamp(32px,calc(11.9vw-4.8px),40px)] font-extrabold leading-none tracking-[-0.03em] md:col-start-1 md:row-start-1 md:self-end md:text-[clamp(40px,4.6vw,64px)] md:tracking-[-0.025em]">
        One membership. <br />
        <span className={HEADLINE_ACCENT_CLASS}>No catch.</span>
      </h2>
      <p className="m-0 text-[17px] md:col-start-1 md:row-start-2 md:mt-5 md:self-start md:text-lg">
        Cancel whenever life gets too fun.
      </p>
      <div className="mt-[22px] box-border flex w-full flex-col max-md:w-[calc(100%-6px)] max-md:max-w-[460px] max-md:self-start max-md:ml-[max(0px,calc((100%-466px)/2))] rounded-[20px] border-2 border-foreground bg-background-muted px-[22px] pt-[26px] pb-[26px] text-left shadow-[6px_6px_0_var(--foreground)] md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0 md:mr-2 md:w-[calc(100%-8px)] md:max-w-[460px] md:justify-self-end md:gap-[18px] md:p-[clamp(28px,3vw,40px)] md:shadow-[8px_8px_0_var(--foreground)]">
        <p className="m-0 flex items-baseline gap-2 md:gap-1.5">
          <span className="text-[72px] font-extrabold leading-none tracking-[-0.04em] md:text-[60px] md:leading-[0.9] md:tracking-[-0.03em]">
            £10
          </span>
          <span className="text-[17px] text-site-muted">/month</span>
        </p>
        <p className="m-0 mt-3 mb-[18px] text-[15.5px] leading-[1.45] text-site-muted md:m-0 md:text-base md:leading-normal">
          Basically, a skeleton key to the city’s <span className="max-md:whitespace-nowrap">social scene.</span>
        </p>
        <ul className="m-0 flex list-none flex-col gap-3 border-t-[1.5px] border-foreground p-0 pt-[18px] text-base md:gap-2.5 md:border-t-0 md:pt-0 md:text-[15px]">
          {MEMBERSHIP_INCLUDES.map((item) => (
            <li key={item} className="flex items-center gap-2.5">
              <CheckIcon />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// The rope's viewBox cropped to its ink, strokes included (measured at
// x 16.5-183.5, y 52.5-177.5 of the 200-unit grid), so the post bases sit
// on the SVG's bottom edge and the right-hand post on its right edge.
const ROPE_VIEWBOX = "16.5 52.5 167 125";

// The footer wordmark, cropped to its ink: the PNG (1942x641) has
// transparent padding round the lettering, so the image is drawn slightly
// wider than its box and shifted, and the box clips it. The crop is the
// ink's 50%-opacity edge (x 16-1927, y 16-626 of the file; its faint
// antialiased fringe starts 3px further out), so the visible ink runs
// exactly edge to edge of the container. The file itself is shared
// (header, /apply, the app's sign-in watermark, emails), so it isn't
// trimmed.
const WORDMARK_INK = { left: 16, top: 16, width: 1911, height: 610 };
const WORDMARK_FILE = { width: 1942, height: 641 };

const FOOTER_COLUMN_HEADING_CLASS = cn(SERIF_ACCENT_CLASS, "m-0 mb-3.5 text-2xl leading-none md:text-[26px]");
// The phone footer's headings sit on its 44px row rhythm.
const PHONE_FOOTER_HEADING_CLASS = cn(SERIF_ACCENT_CLASS, "m-0 flex h-11 items-center text-2xl leading-none");
const FOOTER_LINK_CLASS = cn(
  "flex min-h-11 items-center text-base font-bold text-foreground no-underline hover:opacity-70 md:min-h-9",
  FOCUS_UNDERLINE_CLASS,
);

// whitespace-nowrap: a label and its "Soon" tag never break across a row
// (at 320 "Google Play" used to wrap inside its 44px row). The footer
// columns grow to fit them instead (minmax(max-content, 1fr)).
function ExternalLinkItem({ link, className }: { link: { label: string; url: string | null }; className?: string }) {
  if (!link.url) {
    return (
      <span
        className={cn(
          "flex min-h-11 items-center gap-2 whitespace-nowrap text-base font-bold text-foreground md:min-h-9",
          className,
        )}
      >
        {link.label}
        <span className="inline-flex min-h-[22px] items-center rounded-full border-[1.5px] border-foreground px-2 text-[11px] font-bold uppercase tracking-[0.04em]">
          Soon
        </span>
      </span>
    );
  }
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(FOOTER_LINK_CLASS, "whitespace-nowrap", className)}
    >
      {link.label}
    </a>
  );
}

function FooterColumn({ heading, className, children }: { heading: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <h3 className={FOOTER_COLUMN_HEADING_CLASS}>{heading}</h3>
      {children}
    </div>
  );
}

function legalLine(year: number) {
  return COMPANY.name && COMPANY.number
    ? `© ${year} ${COMPANY.name}. Registered in England and Wales, company no. ${COMPANY.number}. Registered office: ${REGISTERED_OFFICE}.`
    : `© ${year} Club Yuppie. All rights reserved.`;
}

// Homepage only: the other public pages have no footer.
//
// The closing band is the door, the second half of the page's one ending:
// its own band between full-bleed 3px rules, like the hero and the Open
// Invite band, with the sign-off headline in the serif closing voice (like
// ApplyBand on FAQ and Contact). Phones, centred: the sign-off on two
// lines (it shrinks below 390 to fit), the committee line, the one Apply
// button, then the rope standing on the bottom rule. Desktop: the sign-off,
// committee line and button on the left, the velvet rope on the right
// standing on the bottom rule, its right post on the container's edge.
function SiteFooter() {
  return (
    <footer>
      <section data-rhythm="art-on-rule" className="border-y-[3px] border-foreground">
        <div className={cn(SITE_CONTAINER_CLASS, "grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-12")}>
          <div className="pt-16 text-center md:pt-[clamp(56px,6vw,88px)] md:pb-[clamp(56px,6vw,88px)] md:text-left">
            <h2
              className={cn(
                "m-0 text-[clamp(30px,calc(11.5vw-4.6px),40px)] leading-[1.05] max-md:[text-wrap:balance] md:text-[clamp(40px,4.6vw,64px)] md:leading-none",
                HEADLINE_ACCENT_CLASS,
              )}
            >
              This isn’t for everyone.
              <br />
              <span className={SERIF_ACCENT_CLASS}>
                Might be for <span className="max-md:whitespace-nowrap">you though.</span>
              </span>
            </h2>
            <p className="m-0 mt-4 text-[17px] leading-[1.45] [text-wrap:balance] md:mt-5 md:max-w-[520px] md:text-[19px] md:leading-normal">
              Every application is reviewed by our membership committee.
            </p>
            {/* Phones: full width, 28px under the committee line, then the
                rope 36px below it. */}
            <div className="mt-7 md:mt-8">
              <ApplyButton className="w-full md:w-auto">Apply for membership</ApplyButton>
            </div>
          </div>
          <div className="mt-9 flex justify-center md:mt-0 md:justify-end md:self-end">
            <VelvetRopeDrawing
              size={300}
              viewBox={ROPE_VIEWBOX}
              width={300}
              height={(300 * 125) / 167}
              className="block h-auto w-[190px] md:w-[300px]"
            />
          </div>
        </div>
      </section>
      {/* Phones: two columns on one 44px row rhythm (every heading and
          item exactly 44px, no gaps between groups), so the rows line up
          across both columns and both end on the same line. The columns
          are equal wherever both fit (360 and up); below that each is at
          least as wide as its widest label, so nothing wraps at 320. */}
      <nav
        aria-label="Footer"
        className={cn(
          SITE_CONTAINER_CLASS,
          "grid grid-cols-[minmax(max-content,1fr)_minmax(max-content,1fr)] gap-x-4 py-16 md:hidden",
        )}
      >
        <div className="flex min-w-0 flex-col">
          <h3 className={PHONE_FOOTER_HEADING_CLASS}>Explore</h3>
          <Link href="/member-login" className={cn(FOOTER_LINK_CLASS, "h-11")}>
            Members Area
          </Link>
          <Link href="/apply" className={cn(FOOTER_LINK_CLASS, "h-11")}>
            Apply
          </Link>
          <Link href="/faq" className={cn(FOOTER_LINK_CLASS, "h-11")}>
            FAQs
          </Link>
          <Link href="/contact" className={cn(FOOTER_LINK_CLASS, "h-11")}>
            Contact
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className={cn(FOOTER_LINK_CLASS, "h-11")}>
            Email us
          </a>
        </div>
        <div className="flex min-w-0 flex-col">
          <h3 className={PHONE_FOOTER_HEADING_CLASS}>Follow</h3>
          <ExternalLinkItem link={EXTERNAL_LINKS.instagram} className="h-11" />
          <ExternalLinkItem link={EXTERNAL_LINKS.tiktok} className="h-11" />
          <h3 className={PHONE_FOOTER_HEADING_CLASS}>Get the app</h3>
          <ExternalLinkItem link={EXTERNAL_LINKS.appStore} className="h-11" />
          <ExternalLinkItem link={EXTERNAL_LINKS.googlePlay} className="h-11" />
        </div>
      </nav>

      <nav
        aria-label="Footer"
        className={cn(
          SITE_CONTAINER_CLASS,
          "hidden pb-16 md:grid md:grid-cols-[repeat(4,minmax(max-content,1fr))] md:gap-10 md:pt-14",
        )}
      >
        <FooterColumn heading="Explore">
          <Link href="/member-login" className={FOOTER_LINK_CLASS}>
            Members Area
          </Link>
          <Link href="/apply" className={FOOTER_LINK_CLASS}>
            Apply
          </Link>
          <Link href="/faq" className={FOOTER_LINK_CLASS}>
            FAQs
          </Link>
          <Link href="/contact" className={FOOTER_LINK_CLASS}>
            Contact
          </Link>
        </FooterColumn>
        <FooterColumn heading="Say hello">
          <a href={`mailto:${CONTACT_EMAIL}`} className={FOOTER_LINK_CLASS}>
            {CONTACT_EMAIL}
          </a>
        </FooterColumn>
        <FooterColumn heading="Follow">
          <ExternalLinkItem link={EXTERNAL_LINKS.instagram} />
          <ExternalLinkItem link={EXTERNAL_LINKS.tiktok} />
        </FooterColumn>
        <FooterColumn heading="Get the app">
          <ExternalLinkItem link={EXTERNAL_LINKS.appStore} />
          <ExternalLinkItem link={EXTERNAL_LINKS.googlePlay} />
        </FooterColumn>
      </nav>

      <div className={cn(SITE_CONTAINER_CLASS, "mt-2")}>
        <div
          aria-hidden
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: `${WORDMARK_INK.width} / ${WORDMARK_INK.height}` }}
        >
          <Image
            src="/yuppie_logo_forte_forward.png"
            alt=""
            width={WORDMARK_FILE.width}
            height={WORDMARK_FILE.height}
            sizes="(min-width: 1240px) 1180px, 100vw"
            className="absolute block max-w-none"
            style={{
              width: `${(WORDMARK_FILE.width / WORDMARK_INK.width) * 100}%`,
              height: `${(WORDMARK_FILE.height / WORDMARK_INK.height) * 100}%`,
              left: `${(-WORDMARK_INK.left / WORDMARK_INK.width) * 100}%`,
              top: `${(-WORDMARK_INK.top / WORDMARK_INK.height) * 100}%`,
            }}
          />
        </div>
      </div>

      <div
        className={cn(
          SITE_CONTAINER_CLASS,
          "flex flex-row items-baseline justify-between gap-1 gap-x-6 pt-7 pb-[calc(32px+env(safe-area-inset-bottom))] text-[13px] leading-normal text-site-muted md:flex-row md:items-baseline md:justify-between md:gap-x-10 md:text-sm",
        )}
      >
        <p className="m-0">{legalLine(new Date().getFullYear())}</p>
        <Link
          href="/privacy"
          className={cn("inline-flex min-h-11 shrink-0 items-center self-baseline text-site-muted no-underline hover:opacity-70 max-md:-ml-2 max-md:pl-2 max-md:justify-end md:min-h-0 md:self-start", FOCUS_UNDERLINE_CLASS)}
        >
          Privacy
        </Link>
      </div>
    </footer>
  );
}
