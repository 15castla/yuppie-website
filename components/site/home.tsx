// The homepage (option D design: design-ref/boards/DHome and DHomeMobile).
// A server component: nothing on it is interactive beyond links.

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

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
import { CONTACT_EMAIL, EXTERNAL_LINKS } from "./links";
import { StepList } from "./step-list";
import {
  HEADLINE_ACCENT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SERIF_ACCENT_CLASS,
  SITE_CONTAINER_CLASS,
  SITE_FONT_STYLE,
  SITE_PAGE_CLASS,
} from "./ui";

type DrawingComponent = typeof CoupesDrawing;

// Each perk's copy is shorter on mobile (the boards differ).
const PERKS: { title: string; desktop: string; mobile: string; Drawing: DrawingComponent }[] = [
  {
    title: "Events",
    desktop:
      "Supper clubs, Padel & Pints, wellness mornings and nights out, planned and run by our team. At cost, never marked up.",
    mobile: "Supper clubs, Padel & Pints, wellness and nights out, run by our team at cost.",
    Drawing: CoupesDrawing,
  },
  {
    title: "Discounts",
    desktop: "Real savings at restaurants, bars, barbers, gyms and sports clubs across the city.",
    mobile: "Real savings at restaurants, bars, barbers, gyms and sports clubs.",
    Drawing: PriceTagDrawing,
  },
  {
    title: "Access",
    desktop: "Members' clubs, skip-the-queue entry, invite-only parties and first dibs before things sell out.",
    mobile: "Members' clubs, skip-the-queue entry and first dibs.",
    Drawing: VelvetRopeDrawing,
  },
  {
    title: "Concierge",
    desktop: "Built on a top London hotel concierge's black book. Ask it anything, and it learns your taste.",
    mobile: "A top hotel concierge's black book. It learns your taste.",
    Drawing: BrickPhoneDrawing,
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

// Mobile: headline, then the drawing standing on the 3px rule, then the
// intro and button. Desktop: headline, intro and button on the left, the
// drawing on the right, standing on the rule along the section's bottom.
function Hero() {
  return (
    <section className="border-foreground md:border-b-[3px]">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-x-12 md:px-[clamp(20px,4vw,40px)]">
        <h1 className="m-0 px-5 pt-7 text-[60px] font-extrabold leading-[0.93] tracking-[-0.035em] [text-wrap:balance] md:col-start-1 md:row-start-1 md:px-0 md:pt-[clamp(48px,7vw,120px)] md:text-[clamp(56px,7vw,104px)] md:leading-[0.95] md:tracking-[-0.03em]">
          Your social life, <span className={HEADLINE_ACCENT_CLASS}>sorted.</span>
        </h1>
        <div className="mt-5 flex justify-center border-b-[3px] border-foreground px-5 md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0 md:self-end md:border-b-0 md:px-0 md:pt-6">
          <Image
            src="/yuppie-group.svg"
            alt="Line drawing of three young yuppies out together: one on a brick phone, two clinking champagne coupes"
            width={540}
            height={620}
            loading="eager"
            fetchPriority="high"
            className="-mb-0.5 block h-auto w-full max-w-[340px] md:max-w-[500px]"
          />
        </div>
        <div className="flex flex-col gap-5 px-5 pt-6 pb-2 md:col-start-1 md:row-start-2 md:gap-7 md:px-0 md:pt-7 md:pb-[clamp(56px,8vw,136px)]">
          <p className="m-0 text-[17px] leading-normal md:max-w-[460px] md:text-[19px]">
            A members&apos; club for Londoners with full diaries and empty weekends. Dinners, sport,
            parties and perks, all planned for you. You just show up.
          </p>
          <div>
            <ApplyButton className="w-full md:w-auto">Apply for membership</ApplyButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function Perks() {
  return (
    <section
      id="perks"
      className={cn(SITE_CONTAINER_CLASS, "pt-14 pb-16 md:py-[clamp(72px,9vw,128px)]")}
    >
      <h2 className="m-0 text-[40px] font-extrabold leading-none tracking-[-0.025em] md:mb-[clamp(48px,6vw,80px)] md:text-[clamp(40px,4.6vw,64px)]">
        Four reasons to <span className={SERIF_ACCENT_CLASS}>leave the office.</span>
      </h2>
      <div className="mt-8 flex flex-col border-b-[1.5px] border-foreground md:mt-0 md:grid md:grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] md:gap-x-10 md:gap-y-12 md:border-b-0">
        {PERKS.map(({ title, desktop, mobile, Drawing }) => (
          <article
            key={title}
            className="grid grid-cols-[64px_minmax(0,1fr)] grid-rows-[auto_1fr] items-start gap-x-4 gap-y-1 border-t-[1.5px] border-foreground py-5 md:flex md:flex-col md:gap-3.5 md:border-t-0 md:py-0"
          >
            <Drawing
              size={112}
              className="row-span-2 block size-16 stroke-[3.5] md:-ml-3 md:size-28 md:stroke-[3]"
            />
            <h3 className="m-0 text-xl font-extrabold md:text-2xl md:tracking-[-0.01em]">{title}</h3>
            <p className="m-0 text-[15px] leading-normal md:text-base md:leading-[1.55]">
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
          "flex flex-col gap-[22px] pt-14 pb-16 md:flex-row md:flex-wrap md:items-center md:gap-x-20 md:gap-y-14 md:py-[clamp(72px,9vw,128px)]",
        )}
      >
        <div className="flex min-w-0 flex-col gap-[22px] md:flex-[1_1_520px] md:gap-7">
          <span className="inline-flex min-h-[30px] items-center self-start rounded-full border-[1.5px] border-foreground px-3.5 text-[13px] font-bold">
            The members&apos; marketplace
          </span>
          <h2
            className={cn(
              "m-0 text-[76px] leading-[0.88] md:text-[clamp(72px,8.6vw,128px)]",
              SERIF_ACCENT_CLASS,
              "tracking-[-0.02em]",
            )}
          >
            Open Invite
          </h2>
          <p className="m-0 text-[17px] leading-normal md:max-w-[520px] md:text-[19px]">
            A marketplace for plans, run by members. Fancy a Saturday class and brunch, but your friends
            are busy? Post it and find members who want to do the same, or browse what others are planning
            and say you&apos;re in.
          </p>
          <StepList steps={OPEN_INVITE_STEPS} className="md:mt-1 md:max-w-[560px]" />
        </div>

        <div className="relative mt-9 min-w-0 md:mt-0 md:max-w-[440px] md:flex-[1_1_380px] md:pt-14 md:pr-6">
          <TennisRacketsDrawing
            clipId="open-invite-racket-strings"
            size={140}
            className="absolute top-[-44px] right-[-10px] z-10 block size-24 rotate-[14deg] md:top-[-40px] md:right-[-28px] md:size-[140px]"
          />
          {/* An example invite, not a real one: the "I'm in" pill is part
              of the picture, so it isn't a button. */}
          <figure
            aria-label="Example Open Invite"
            className="relative m-0 mr-2 flex flex-col gap-4 rounded-[20px] border-2 border-foreground bg-background px-5 py-[22px] shadow-[6px_6px_0_var(--foreground)] md:mr-0 md:gap-5 md:p-[clamp(28px,3vw,40px)] md:shadow-[8px_8px_0_var(--foreground)]"
          >
            <span className="inline-flex min-h-[26px] items-center self-start rounded-full bg-foreground px-3 text-xs font-bold text-background">
              Open Invite
            </span>
            <h3 className="m-0 text-2xl font-extrabold leading-[1.1] tracking-[-0.015em] md:text-[28px]">
              Saturday morning class + brunch
            </h3>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-[18px] gap-y-2 text-[14.5px] md:gap-x-5 md:gap-y-2.5 md:text-[15px]">
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
        "flex flex-col items-center gap-3.5 pt-16 pb-14 text-center md:gap-5 md:pt-[clamp(80px,10vw,136px)] md:pb-[clamp(64px,8vw,104px)]",
      )}
    >
      <h2 className="m-0 text-[42px] font-extrabold leading-[0.96] tracking-[-0.03em] md:text-[clamp(44px,5.6vw,80px)] md:leading-[0.95]">
        One membership. <br className="md:hidden" />
        <span className={HEADLINE_ACCENT_CLASS}>No catch.</span>
      </h2>
      <p className="m-0 text-base md:text-lg">Cancel whenever life gets too fun.</p>
      <div className="mt-[18px] box-border flex w-full flex-col gap-4 rounded-[20px] border-2 border-foreground bg-background-muted px-5 py-[22px] text-left shadow-[6px_6px_0_var(--foreground)] md:mt-6 md:max-w-[460px] md:gap-[18px] md:p-[clamp(28px,3vw,40px)] md:shadow-[8px_8px_0_var(--foreground)]">
        <p className="m-0 flex items-baseline gap-1.5">
          <span className="text-[52px] font-extrabold leading-[0.9] tracking-[-0.03em] md:text-[60px]">£10</span>
          <span className="text-base text-site-muted md:text-[17px]">/month</span>
        </p>
        <p className="m-0 text-[15px] leading-normal text-site-muted md:text-base">
          Basically, a skeleton key to London&apos;s social scene.
        </p>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[14.5px] md:text-[15px]">
          {MEMBERSHIP_INCLUDES.map((item) => (
            <li key={item} className="flex items-center gap-2.5">
              <CheckIcon />
              {item}
            </li>
          ))}
        </ul>
        <ApplyButton className="mt-1 w-full md:mt-1.5">Apply for membership</ApplyButton>
      </div>
    </section>
  );
}

const FOOTER_HEADING_CLASS = "text-[11px] font-bold uppercase tracking-[0.18em] text-site-muted";
const FOOTER_LINK_CLASS = "flex min-h-11 items-center text-[15px] no-underline hover:opacity-70 md:min-h-0";

function ExternalLinkItem({ link }: { link: { label: string; url: string | null } }) {
  if (!link.url) {
    return (
      <span className="inline-flex min-h-11 items-center gap-2 text-[15px] text-site-muted md:min-h-0">
        {link.label}
        <span className="rounded-full bg-foreground/10 px-[7px] py-0.5 text-[10px] font-bold">SOON</span>
      </span>
    );
  }
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer" className={FOOTER_LINK_CLASS}>
      {link.label}
    </a>
  );
}

// Homepage only: the other public pages have no footer.
function SiteFooter() {
  return (
    <footer className={cn(SITE_CONTAINER_CLASS, "pb-7 md:pb-8")}>
      <div className="flex flex-col gap-5 border-y-[1.5px] border-foreground py-10 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-x-10 md:gap-y-7 md:py-12">
        <h2 className="m-0 text-[32px] font-extrabold leading-none tracking-[-0.02em] md:text-[clamp(32px,3.6vw,48px)]">
          This isn&apos;t for everyone.
          <br />
          <span className={SERIF_ACCENT_CLASS}>Might be for you though.</span>
        </h2>
        <ApplyButton className="self-start md:self-auto">Apply</ApplyButton>
      </div>

      <nav
        aria-label="Footer"
        className="grid grid-cols-2 gap-x-4 gap-y-8 py-9 md:flex md:flex-wrap md:justify-between md:gap-x-12 md:gap-y-8 md:py-11"
      >
        <div className="flex flex-col gap-2.5 md:gap-3">
          <span className={FOOTER_HEADING_CLASS}>Yuppie</span>
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
        </div>
        <div className="flex flex-col gap-2.5 md:gap-3">
          <span className={FOOTER_HEADING_CLASS}>Connect</span>
          <ExternalLinkItem link={EXTERNAL_LINKS.instagram} />
          <ExternalLinkItem link={EXTERNAL_LINKS.tiktok} />
        </div>
        <div className="flex min-w-0 flex-col gap-2.5 md:gap-3">
          <span className={FOOTER_HEADING_CLASS}>Contact</span>
          <a href={`mailto:${CONTACT_EMAIL}`} className={cn(FOOTER_LINK_CLASS, "break-all md:break-normal")}>
            {CONTACT_EMAIL}
          </a>
          <span className="hidden text-[15px] md:inline">Westminster, London W1G 8TN</span>
        </div>
        <div className="flex flex-col gap-2.5 md:gap-3">
          <span className={FOOTER_HEADING_CLASS}>Get the app</span>
          <ExternalLinkItem link={EXTERNAL_LINKS.appStore} />
          <ExternalLinkItem link={EXTERNAL_LINKS.googlePlay} />
        </div>
      </nav>

      <div aria-hidden className="border-t-[1.5px] border-foreground pt-6 md:pt-8">
        <Image
          src="/yuppie_logo_forte_forward.png"
          alt=""
          width={1942}
          height={641}
          sizes="(min-width: 1240px) 1160px, 100vw"
          className="block h-auto w-full opacity-10"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-5 text-[13px] text-site-muted md:pt-6">
        <span>© {new Date().getFullYear()} Yuppie. All rights reserved.</span>
        <Link href="/privacy" className="inline-flex min-h-11 items-center text-site-muted no-underline hover:opacity-70">
          Privacy
        </Link>
      </div>
    </footer>
  );
}
