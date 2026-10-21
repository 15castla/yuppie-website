// The "For venues" page: unlisted, for the letters posted to restaurant and
// hospitality managers. Nothing on the site links here, it is in no sitemap,
// and its metadata says noindex, nofollow. Do not add it to the menu, the
// footer, proxy.ts or a robots file (a Disallow line would publish the path
// and stop crawlers reading the noindex).
//
// A server component with no state. The Perks grid, the Open Invite band and
// the closing band are the home page's patterns with this page's copy; their
// classes are copied from components/site/home.tsx, where they are
// module-local.

import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";
import { almarai, instrumentSerif } from "@/components/templates/creative-studio/fonts";
import {
  ArrowRightIcon,
  BrickPhoneDrawing,
  CheckIcon,
  CoupesDrawing,
  PriceTagDrawing,
  VelvetRopeDrawing,
} from "@/components/site/icons";
import { CONTACT_EMAIL } from "@/components/site/links";
import {
  CARD_CLASS,
  HEADLINE_ACCENT_CLASS,
  INNER_PAGE_H1_CLASS,
  PRIMARY_BUTTON_CLASS,
  SERIF_ACCENT_CLASS,
  SITE_CONTAINER_CLASS,
  SITE_FONT_STYLE,
  SITE_PAGE_CLASS,
} from "@/components/site/ui";

// No openGraph or twitter here on purpose: a page that sets its own replaces
// the root's, share image included. Left unset, a pasted link shows the
// club's standard card.
export const metadata: Metadata = {
  title: "Club Yuppie: for venues",
  description:
    "Club Yuppie is a club for full diaries and empty weekends. See how a restaurant or bar can be a partner.",
  robots: { index: false, follow: false },
};

const MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Club Yuppie venue partnership")}`;

type DrawingComponent = typeof CoupesDrawing;
// A drawing's ink box in its 200-unit grid, as [x, y, width, height]; the
// same boxes the home Perks use.
type InkBox = [number, number, number, number];

// Each cell's copy is shorter on phones, as the home Perks' is.
const WAYS: { title: string; desktop: string; mobile: string; Drawing: DrawingComponent; ink: InkBox }[] = [
  {
    title: "Discounts",
    desktop: "Money off, or a drink on the house. We agree the offer with you and list it for members.",
    mobile: "Money off, or a drink on the house. Listed for members.",
    Drawing: PriceTagDrawing,
    ink: [30.25, 28.5, 140.875, 125.875],
  },
  {
    title: "Access",
    desktop: "Skip-the-queue entry, a guest list or first dibs on a night, for members at your door.",
    mobile: "Skip-the-queue entry, a guest list or first dibs on a night.",
    Drawing: VelvetRopeDrawing,
    ink: [16.5, 52.5, 167, 125],
  },
  {
    title: "Events",
    desktop: "Nights run by us, at cost, never marked up. If your room would suit one, tell us.",
    mobile: "Nights run by us, at cost. Does your room suit one?",
    Drawing: CoupesDrawing,
    ink: [15.25, 22.5, 169.5, 147.5],
  },
  {
    title: "Your idea",
    desktop: "Tell us what would suit the room. We are open to ideas.",
    mobile: "Tell us what suits the room.",
    Drawing: BrickPhoneDrawing,
    ink: [66.5, 10.5, 67, 177],
  },
];

const IN_BRIEF: [string, string][] = [
  ["Joining", "By application"],
  ["Reviewed by", "Our membership committee"],
  ["Price", "£10 a month"],
  ["Launch", "Early Q1 2027, iPhone app first"],
];

const WHAT_YOU_GET = [
  "Your offer, listed for members.",
  "Members our membership committee has said yes to.",
  "A say in the offer. We agree it together.",
];

// Same scale and row height as the home Perks: 0.48 on phones, 112/200 from
// md, every drawing standing on the bottom of a box as tall as the tallest.
const PERK_SCALE = { mobile: 0.48, desktop: 112 / 200 };
const PERK_ROW_HEIGHT = Math.max(...WAYS.map(({ ink }) => ink[3])) * PERK_SCALE.desktop;

// The rope's viewBox cropped to its ink, as the home page's closing band.
const ROPE_VIEWBOX = "16.5 52.5 167 125";

const SECTION_H2_CLASS = "m-0 text-[40px] font-extrabold leading-none tracking-[-0.025em] md:text-[clamp(40px,4.6vw,64px)]";

function MailtoButton({ className, children }: { className?: string; children: string }) {
  return (
    <a href={MAILTO} className={cn(PRIMARY_BUTTON_CLASS, className)}>
      {children}
      <ArrowRightIcon />
    </a>
  );
}

export default function VenuesPage() {
  return (
    <div className={cn(almarai.variable, instrumentSerif.variable, SITE_PAGE_CLASS)} style={SITE_FONT_STYLE}>
      <main>
        {/* 1. The line, the ask and the facts. */}
        <section data-rhythm="asymmetric:inner-page padding" className="border-b-[3px] border-foreground">
          <div
            className={cn(
              SITE_CONTAINER_CLASS,
              "flex flex-col gap-[22px] pt-9 pb-16 md:flex-row md:flex-wrap md:items-start md:gap-x-20 md:gap-y-14 md:pt-[clamp(48px,7vw,104px)] md:pb-[clamp(72px,9vw,128px)]",
            )}
          >
            <div className="flex min-w-0 flex-col gap-[18px] md:flex-[1_1_480px] md:gap-7">
              <h1 className={cn(INNER_PAGE_H1_CLASS, "[text-wrap:balance]")}>
                We plan the evenings. <br className="md:hidden" />
                <span className={HEADLINE_ACCENT_CLASS}>You’ve got <span className="max-md:whitespace-nowrap">the room.</span></span>
              </h1>
              <p data-measure className="m-0 text-[17px] leading-normal md:max-w-[460px] md:text-[19px]">
                Club Yuppie is a club for full diaries and empty weekends. We’d like you as a partner.
              </p>
              <div>
                <MailtoButton className="w-full md:w-auto">Email us</MailtoButton>
              </div>
            </div>

            {/* mr-1.5 makes the card's 6px shadow end on the container edge,
                as the Open Invite, FAQ and Contact cards do. */}
            <div className="mt-3.5 mr-1.5 min-w-0 md:mt-0 md:mr-0 md:max-w-[440px] md:flex-[1_1_380px]">
              <div className={cn(CARD_CLASS, "flex flex-col gap-4 max-md:py-6 md:gap-5")}>
                <h2 className={cn(SERIF_ACCENT_CLASS, "m-0 text-[30px] leading-[1.05] md:text-[34px]")}>In brief.</h2>
                {/* The label column is 104px because "Reviewed by" is wider
                    than the Open Invite card's 96px. */}
                <dl className="m-0 grid grid-cols-[104px_1fr] gap-x-0 gap-y-3 text-base leading-[1.4] md:grid-cols-[auto_1fr] md:gap-x-6">
                  {IN_BRIEF.map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="font-bold">{label}</dt>
                      <dd className="m-0 [text-wrap:balance]">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </section>

        {/* 2. What we ask: the home Perks grid with venue copy. Two columns
            up to 1099px, four from 1100px: four need about 1,020px of
            content width, and an auto-fit grid would leave one cell alone
            on a second row at 1024. This is the page's one width query
            besides md (a RULE-45 annotated exception). */}
        <section className={cn(SITE_CONTAINER_CLASS, "pt-[72px] pb-[72px] md:py-[clamp(72px,9vw,128px)]")}>
          <h2 className={cn(SECTION_H2_CLASS, "md:mb-[clamp(24px,3vw,40px)]")}>
            What we ask. <br className="md:hidden" />
            <span className={SERIF_ACCENT_CLASS}>An offer <span className="max-md:whitespace-nowrap">for members.</span></span>
          </h2>
          <p
            data-measure
            className="m-0 mt-4 text-[17px] leading-normal md:mt-0 md:mb-[clamp(32px,4vw,56px)] md:max-w-[520px] md:text-[19px]"
          >
            Pick one way in. We agree the details together.
          </p>
          <div className="mt-9 grid grid-cols-2 border-t-[1.5px] border-foreground md:mt-0 md:gap-x-10 md:gap-y-12 md:border-t-0 min-[1100px]:grid-cols-4">
            {WAYS.map(({ title, desktop, mobile, Drawing, ink }) => (
              <article
                key={title}
                className="flex min-w-0 flex-col border-b-[1.5px] border-foreground pt-[22px] pb-[26px] odd:pr-4 even:border-l-[1.5px] even:pl-4 md:gap-3.5 md:border-b-0 md:py-0 md:odd:pr-0 md:even:border-l-0 md:even:pl-0"
              >
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
                <p className="m-0 text-[14.5px] leading-[1.45] max-md:[text-wrap:balance] md:text-base md:leading-[1.55]">
                  <span className="md:hidden">{mobile}</span>
                  <span className="hidden md:inline">{desktop}</span>
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* 3. What a partner gets: the Open Invite band's pattern. */}
        <section data-rhythm="asymmetric:matches the Open Invite band" className="border-y-[3px] border-foreground bg-cream">
          <div
            className={cn(
              SITE_CONTAINER_CLASS,
              "flex flex-col gap-9 pt-16 pb-[72px] md:flex-row md:flex-wrap md:items-center md:gap-x-20 md:gap-y-14 md:py-[clamp(72px,9vw,128px)]",
            )}
          >
            <h2 className={cn(SECTION_H2_CLASS, "min-w-0 md:flex-[1_1_480px]")}>
              What you get.
              <br />
              <span className={SERIF_ACCENT_CLASS}>In plain terms.</span>
            </h2>
            <div className="min-w-0 max-md:mr-1.5 md:max-w-[440px] md:flex-[1_1_380px]">
              <ul className="m-0 flex list-none flex-col gap-4 rounded-[20px] border-2 border-foreground bg-background px-[22px] py-6 text-base shadow-[6px_6px_0_var(--foreground)] md:gap-5 md:p-[clamp(28px,3vw,40px)] md:text-[17px] md:shadow-[8px_8px_0_var(--foreground)]">
                {WHAT_YOU_GET.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 leading-[1.4]">
                    <span className="mt-[3px]">
                      <CheckIcon />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 4. How to get in touch: the home closing band with this page's
            line. Section 3 supplies the rule above it. */}
        <section className="border-b-[3px] border-foreground">
          <div className={cn(SITE_CONTAINER_CLASS, "grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-12")}>
            <div className="pt-14 text-center md:pt-[clamp(72px,9vw,128px)] md:pb-[clamp(56px,6vw,88px)] md:text-left">
              <h2 className={cn(SECTION_H2_CLASS, "max-md:[text-wrap:balance]")}>
                Let’s talk.
                <br />
                <span className={SERIF_ACCENT_CLASS}>We’ll bring <span className="max-md:whitespace-nowrap">the evening.</span></span>
              </h2>
              <p data-measure className="m-0 mt-4 text-[17px] leading-normal md:mt-5 md:max-w-[460px] md:text-[19px]">
                Tell us about the room and what you’d like to offer. A few lines is plenty.
              </p>
              {/* break-all is a safety net only: the address fits the
                  280px pill at 320. */}
              <div className="mt-7 md:mt-8">
                <MailtoButton className="w-full break-all md:w-auto">{CONTACT_EMAIL}</MailtoButton>
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
      </main>
    </div>
  );
}
