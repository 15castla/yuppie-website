// The homepage (option D design: design-ref/boards/DHome and DHomeMobile).
// A server component: nothing on it is interactive beyond links.

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { almarai, instrumentSerif } from "@/components/templates/creative-studio/fonts";
import {
  ArrowRightIcon,
  BrickPhoneDrawing,
  CheckIcon,
  CoupesDrawing,
  PriceTagDrawing,
  TennisRacketsDrawing,
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
// starts exactly on the title's left edge and ends on the box's bottom;
// the drawings' own 200x200 boxes have different empty margins.
type InkBox = [number, number, number, number];

// Each perk's copy is shorter on mobile (the boards differ).
const PERKS: { title: string; desktop: string; mobile: string; Drawing: DrawingComponent; ink: InkBox }[] = [
  {
    title: "Events",
    desktop:
      "Supper clubs, Padel & Pints, wellness mornings and nights out, planned and run by our team. At cost, never marked up.",
    mobile: "Supper clubs, Padel & Pints and nights out. Run by us, at cost.",
    Drawing: CoupesDrawing,
    ink: [15.25, 22.5, 169.5, 147.5],
  },
  {
    title: "Discounts",
    desktop: "Real savings at restaurants, bars, barbers, gyms and sports clubs across the city.",
    mobile: "Real savings at restaurants, bars, gyms and clubs.",
    Drawing: PriceTagDrawing,
    ink: [30.25, 28.5, 140.875, 125.875],
  },
  {
    title: "Access",
    desktop: "Members' clubs, skip-the-queue entry, invite-only parties and first dibs before things sell out.",
    mobile: "Members' clubs, guest lists and first dibs.",
    Drawing: VelvetRopeDrawing,
    ink: [16.5, 52.5, 167, 125],
  },
  {
    title: "Concierge",
    desktop: "Built on a top hotel concierge's black book. Ask it anything, and it learns your taste.",
    mobile: "A top hotel concierge's black book. It learns your taste.",
    Drawing: BrickPhoneDrawing,
    ink: [66.5, 10.5, 67, 177],
  },
];

const OPEN_INVITE_STEPS = ["Post an invite", "Members say yes", "Go together"];

const MEMBERSHIP_INCLUDES = [
  "Yuppie Events, run at cost",
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
// Phones: exactly the rest of the first screen (100svh less the 72px
// header and the top safe area), with a full-width 3px rule as the
// section's bottom border. Headline, then the intro and button, then the
// whole drawing (never cropped) in the leftover height (at least 200px),
// centred and standing on that bottom rule. On a screen too short for the
// 200px the hero just grows past the fold.
function Hero() {
  return (
    <section className="flex min-h-[calc(100svh-72px-var(--safe-top))] flex-col border-b-[3px] border-foreground md:block md:min-h-0 md:border-b-[3px]">
      <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-x-12 md:px-[clamp(20px,4vw,40px)]">
        <h1 className="m-0 px-5 pt-3.5 text-[62px] font-extrabold leading-[0.92] tracking-[-0.04em] [text-wrap:balance] md:col-start-1 md:row-start-1 md:px-0 md:pt-[clamp(48px,7vw,120px)] md:text-[clamp(56px,7vw,104px)] md:leading-[0.95] md:tracking-[-0.03em]">
          Your social life, <span className={HEADLINE_ACCENT_CLASS}>sorted.</span>
        </h1>
        {/* The SVG's viewBox is trimmed to its ink on the left, top and
            right, so on desktop its right edge (the right-hand figure's
            arm) lands on the container's right edge, in line with the
            header's Apply pill. Max widths are the old 500px / 340px scaled
            by 463.5/540 (the trimmed width), so the drawing keeps its size. */}
        {/* Phones: last (order-2), 28px under the button. The whole drawing
            is sized to the area's height (never wider than the 350px
            container: max-height is that width's matching height) and
            centred. Its viewBox keeps 7.5 units of empty space under the
            feet (bottom of 620, ink ending at 612.5), so it's moved down by
            exactly that, 7.5/615.375 of its own height, and the feet stand
            on the section's bottom rule at any size. */}
        <div className="relative order-2 mx-5 mt-7 min-h-[200px] flex-1 md:order-none md:col-start-2 md:row-span-2 md:row-start-1 md:mx-0 md:mt-0 md:flex md:min-h-0 md:flex-none md:justify-end md:self-end md:pt-6">
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
        {/* Phones: second (order-1), 20px under the headline. */}
        <div className="order-1 mt-5 flex flex-col gap-[18px] px-5 md:order-none md:col-start-1 md:row-start-2 md:mt-0 md:gap-7 md:px-0 md:pt-7 md:pb-[clamp(56px,8vw,136px)]">
          <p className="m-0 text-[17px] leading-[1.45] md:max-w-[460px] md:text-[19px] md:leading-normal">
            <span className="md:hidden">
              A members&apos; club for professionals with full diaries and empty weekends.
            </span>
            <span className="hidden md:inline">
              A members&apos; club for professionals with full diaries and empty weekends. Dinners, sport,
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

// The drawings keep their previous scale (112px per 200 units on desktop,
// 64px on mobile), now applied to the cropped ink box.
const PERK_SCALE = { mobile: 0.48, desktop: 112 / 200 };
// Desktop: every drawing sits at the bottom of a box as tall as the
// tallest (the phone's 177 units), so their bottoms share one line and
// every title starts the same distance below it.
const PERK_ROW_HEIGHT = Math.max(...PERKS.map(({ ink }) => ink[3])) * PERK_SCALE.desktop;

function Perks() {
  return (
    <section
      id="perks"
      className={cn(SITE_CONTAINER_CLASS, "pt-[88px] pb-[88px] md:py-[clamp(72px,9vw,128px)]")}
    >
      <h2 className="m-0 text-[40px] font-extrabold leading-none tracking-[-0.025em] md:mb-[clamp(48px,6vw,80px)] md:text-[clamp(40px,4.6vw,64px)]">
        Four reasons to <span className={SERIF_ACCENT_CLASS}>leave the office.</span>
      </h2>
      {/* Phones: a 2x2 grid ruled top, between the rows, at the bottom
          and down the middle; cells are padded only beside the centre
          rule, so their outer edges sit on the container's. */}
      <div className="mt-9 grid grid-cols-2 border-t-[1.5px] border-foreground md:mt-0 md:grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] md:gap-x-10 md:gap-y-12 md:border-t-0">
        {PERKS.map(({ title, desktop, mobile, Drawing, ink }) => (
          <article
            key={title}
            className="flex min-w-0 flex-col border-b-[1.5px] border-foreground pt-[22px] pb-[26px] odd:pr-4 even:border-l-[1.5px] even:pl-4 md:gap-3.5 md:border-b-0 md:py-0 md:odd:pr-0 md:even:border-l-0 md:even:pl-0"
          >
            {/* Phones: a 72px icon area, the drawing at its bottom and flush
                left (the phone, 85px tall, rises above it). Desktop: the
                row-height box, the drawing at its bottom and flush left on
                the title's edge. */}
            <div
              className="mb-4 flex h-[72px] items-end md:mb-0 md:h-[var(--perk-row-h)] md:w-auto"
              style={{ "--perk-row-h": `${PERK_ROW_HEIGHT}px` } as CSSProperties}
            >
              <Drawing
                size={ink[2] * PERK_SCALE.desktop}
                viewBox={ink.join(" ")}
                width={ink[2] * PERK_SCALE.desktop}
                height={ink[3] * PERK_SCALE.desktop}
                className="block h-[var(--ink-h-mobile)] w-[var(--ink-w-mobile)] overflow-visible stroke-[3.2] md:h-[var(--ink-h-desktop)] md:w-[var(--ink-w-desktop)] md:stroke-[3]"
                style={
                  {
                    "--ink-w-mobile": `${ink[2] * PERK_SCALE.mobile}px`,
                    "--ink-h-mobile": `${ink[3] * PERK_SCALE.mobile}px`,
                    "--ink-w-desktop": `${ink[2] * PERK_SCALE.desktop}px`,
                    "--ink-h-desktop": `${ink[3] * PERK_SCALE.desktop}px`,
                  } as CSSProperties
                }
              />
            </div>
            <h3 className="m-0 mb-1.5 text-[21px] font-extrabold tracking-[-0.01em] md:mb-0 md:text-2xl">{title}</h3>
            <p className="m-0 text-[14.5px] leading-[1.45] md:text-base md:leading-[1.55]">
              <span className="md:hidden">{mobile}</span>
              <span className="hidden md:inline">{desktop}</span>
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function OpenInvite() {
  return (
    <section id="open-invite" className="border-y-[3px] border-foreground bg-cream">
      <div
        className={cn(
          SITE_CONTAINER_CLASS,
          "flex flex-col pt-16 pb-[72px] md:flex-row md:flex-wrap md:items-center md:gap-x-20 md:gap-y-14 md:py-[clamp(72px,9vw,128px)]",
        )}
      >
        <div className="flex min-w-0 flex-col gap-[18px] md:flex-[1_1_520px] md:gap-7">
          <span className="inline-flex min-h-[30px] items-center self-start rounded-full border-[1.5px] border-foreground px-3 text-[13px] font-bold md:px-3.5">
            The members&apos; marketplace
          </span>
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
              and say you&apos;re in.
            </span>
          </p>
          {/* Desktop: the steps under the lead. Phones: one row of three
              below the card (StepRow, after it). */}
          <div className="hidden md:block">
            <StepList steps={OPEN_INVITE_STEPS} className="md:mt-1 md:max-w-[560px]" />
          </div>
        </div>

        <div className="relative mt-11 min-w-0 md:mt-0 md:max-w-[440px] md:flex-[1_1_380px] md:pt-14 md:pr-6">
          <TennisRacketsDrawing
            clipId="open-invite-racket-strings"
            size={140}
            className="absolute top-[-46px] right-0 z-10 block size-[84px] rotate-[14deg] md:top-[-40px] md:right-[-28px] md:size-[140px]"
          />
          {/* An example invite, not a real one: the "I'm in" pill is part
              of the picture, so it isn't a button. */}
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
              <dt className="font-bold">When</dt>
              <dd className="m-0">Saturday morning</dd>
              <dt className="font-bold">Posted by</dt>
              <dd className="m-0">A Yuppie member</dd>
              <dt className="font-bold">Looking for</dt>
              <dd className="m-0">2 more people</dd>
            </dl>
            <span aria-hidden className={cn(PRIMARY_BUTTON_CLASS, "hover:opacity-100")}>
              I&apos;m in
            </span>
          </figure>
        </div>
        <StepRow steps={OPEN_INVITE_STEPS} className="mt-10 md:hidden" />
      </div>
    </section>
  );
}

function Membership() {
  return (
    <section
      id="membership"
      className={cn(
        SITE_CONTAINER_CLASS,
        "flex flex-col items-center gap-3.5 pt-[72px] pb-[72px] text-center md:gap-5 md:pt-[clamp(80px,10vw,136px)] md:pb-[clamp(64px,8vw,104px)]",
      )}
    >
      <h2 className="m-0 text-[40px] font-extrabold leading-none tracking-[-0.03em] md:text-[clamp(44px,5.6vw,80px)] md:leading-[0.95]">
        One membership. <br className="md:hidden" />
        <span className={HEADLINE_ACCENT_CLASS}>No catch.</span>
      </h2>
      <p className="m-0 text-[17px] md:text-lg">Cancel whenever life gets too fun.</p>
      <div className="mt-[22px] box-border flex w-full flex-col rounded-[20px] border-2 border-foreground bg-background-muted px-[22px] pt-[26px] pb-[22px] text-left shadow-[6px_6px_0_var(--foreground)] md:mt-6 md:max-w-[460px] md:gap-[18px] md:p-[clamp(28px,3vw,40px)] md:shadow-[8px_8px_0_var(--foreground)]">
        <p className="m-0 flex items-baseline gap-2 md:gap-1.5">
          <span className="text-[72px] font-extrabold leading-none tracking-[-0.04em] md:text-[60px] md:leading-[0.9] md:tracking-[-0.03em]">
            £10
          </span>
          <span className="text-[17px] text-site-muted">/month</span>
        </p>
        <p className="m-0 mt-3 mb-[18px] text-[15.5px] leading-[1.45] text-site-muted md:m-0 md:text-base md:leading-normal">
          Basically, a skeleton key to the city&apos;s social scene.
        </p>
        <ul className="m-0 mb-6 flex list-none flex-col gap-3 border-t-[1.5px] border-foreground p-0 pt-[18px] text-base md:mb-0 md:gap-2.5 md:border-t-0 md:pt-0 md:text-[15px]">
          {MEMBERSHIP_INCLUDES.map((item) => (
            <li key={item} className="flex items-center gap-2.5">
              <CheckIcon />
              {item}
            </li>
          ))}
        </ul>
        <ApplyButton className="w-full md:mt-1.5">Apply for membership</ApplyButton>
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

function ExternalLinkItem({ link, className }: { link: { label: string; url: string | null }; className?: string }) {
  if (!link.url) {
    return (
      <span className={cn("flex min-h-11 items-center gap-2 text-base font-bold text-foreground md:min-h-9", className)}>
        {link.label}
        <span className="inline-flex min-h-[22px] items-center rounded-full border-[1.5px] border-foreground px-2 text-[11px] font-bold uppercase tracking-[0.04em]">
          Soon
        </span>
      </span>
    );
  }
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer" className={cn(FOOTER_LINK_CLASS, className)}>
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
    : `© ${year} Yuppie. All rights reserved.`;
}

// Homepage only: the other public pages have no footer.
//
// The closing band is framed by full-bleed 3px rules like the hero and
// the Open Invite band. Desktop: heading and button on the left, the
// velvet rope on the right standing on the bottom rule, its right post on
// the container's edge. Mobile, in the hero's order: heading, the rope
// standing on the rule, then the button below the rule.
function SiteFooter() {
  return (
    <footer>
      <section className="border-y-[3px] border-foreground">
        <div className={cn(SITE_CONTAINER_CLASS, "grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-12")}>
          <div className="pt-14 text-center md:pt-[clamp(72px,9vw,128px)] md:pb-[clamp(56px,6vw,88px)] md:text-left">
            <h2 className="m-0 text-[40px] font-extrabold leading-none tracking-[-0.025em] md:text-[clamp(40px,4.6vw,64px)]">
              This isn&apos;t for everyone.
              <br />
              <span className={SERIF_ACCENT_CLASS}>Might be for you though.</span>
            </h2>
            {/* Phones: full width, 28px under the heading, then the rope
                36px below it. */}
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
      {/* Phones: two equal columns on one 44px row rhythm (every heading
          and item exactly 44px, no gaps between groups), so the rows line
          up across both columns and both end on the same line. */}
      <nav aria-label="Footer" className={cn(SITE_CONTAINER_CLASS, "grid grid-cols-2 gap-x-4 py-16 md:hidden")}>
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
        className={cn(SITE_CONTAINER_CLASS, "hidden pb-16 md:grid md:grid-cols-4 md:gap-10 md:pt-14")}
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
          <a href={`mailto:${CONTACT_EMAIL}`} className={cn(FOOTER_LINK_CLASS, "break-all")}>
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
          className={cn("inline-flex min-h-11 shrink-0 items-center self-baseline text-site-muted no-underline hover:opacity-70 md:min-h-0 md:self-start", FOCUS_UNDERLINE_CLASS)}
        >
          Privacy
        </Link>
      </div>
    </footer>
  );
}
