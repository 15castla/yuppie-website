"use client";

import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { WordsPullUpMultiStyle } from "./primitives";

const HEADLINE = [
  { text: "This isn't for everyone." },
  {
    text: "Might be for you though.",
    className: "italic [font-family:var(--font-instrument-serif)]",
  },
];

type FooterLink = { label: string; href: string; comingSoon?: boolean };

// "FAQ's" doesn't have a page yet, so it stays the same "#" placeholder
// used by the hero nav; the other two already exist elsewhere in this app,
// so they're wired to the real routes rather than left dead when a working
// destination is right there.
const YUPPIE_LINKS: FooterLink[] = [
  { label: "Members Area", href: "/member-login" },
  { label: "Membership", href: "/apply" },
  { label: "FAQ's", href: "#" },
];

// Social handles aren't wired up yet — rendered as visibly disabled with a
// "Soon" tag rather than live-looking dead links.
const CONNECT_LINKS: FooterLink[] = [
  { label: "Instagram", href: "#", comingSoon: true },
  { label: "TikTok", href: "#", comingSoon: true },
];

const LINK_COLUMNS: { heading: string; links: FooterLink[] }[] = [
  { heading: "Yuppie", links: YUPPIE_LINKS },
  { heading: "Connect", links: CONNECT_LINKS },
];

function FooterLinkItem({ link }: { link: FooterLink }) {
  if (link.comingSoon) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex cursor-not-allowed items-center gap-2 text-sm text-foreground/40"
      >
        {link.label}
        <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-foreground-muted">
          Soon
        </span>
      </span>
    );
  }

  if (link.href.startsWith("/")) {
    return (
      <Link
        href={link.href}
        className="text-sm text-foreground/70 transition-colors hover:text-foreground"
      >
        {link.label}
      </Link>
    );
  }

  return (
    <a
      href={link.href}
      className="text-sm text-foreground/70 transition-colors hover:text-foreground"
    >
      {link.label}
    </a>
  );
}

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-background pb-8 pt-0">
      <div className="relative container">
        <div className="flex flex-col gap-8 border-b border-foreground/10 pb-12 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-5">
            <h2 className="max-w-[620px] text-xl leading-[0.95] text-foreground sm:text-2xl sm:leading-[0.9] md:text-3xl lg:text-4xl font-extrabold">
              <WordsPullUpMultiStyle
                segments={HEADLINE}
                className="justify-start"
              />
            </h2>
          </div>

          <Link
            href="/apply"
            className="group inline-flex w-fit shrink-0 items-center gap-2 rounded-full bg-background-muted py-1.5 pe-1.5 ps-5 text-sm font-bold text-foreground transition-all duration-300 hover:gap-3 sm:text-base"
          >
            Membership
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-background transition-transform duration-300 group-hover:scale-110 sm:h-10 sm:w-10">
              <ArrowUpRight className="h-4 w-4 text-foreground rtl:-scale-x-100" />
            </span>
          </Link>
        </div>

        <nav className="flex flex-col gap-x-6 gap-y-10 py-12 sm:flex-row sm:flex-wrap sm:justify-between">
          {LINK_COLUMNS.map((col) => (
            <div key={col.heading} className="flex flex-col gap-3">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground-muted">
                {col.heading}
              </h3>
              <ul className="flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <FooterLinkItem link={link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground-muted">
              Contact
            </h3>
            <a
              href="mailto:hello@clubyuppie.com"
              className="text-sm text-foreground/70 transition-colors hover:text-foreground"
            >
              hello@clubyuppie.com
            </a>
          </div>
        </nav>

        <div
          aria-hidden
          className="pointer-events-none select-none border-t border-foreground/10 pt-8"
        >
          <Image
            src="/yuppie_logo_forte_forward.png"
            alt=""
            width={1942}
            height={641}
            className="h-auto w-full opacity-10"
          />
        </div>

        <div className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-foreground-muted">
            © 2026 Yuppie. All rights reserved.
          </p>
          <div className="flex items-center gap-5">
            <a
              href="#"
              className="text-xs text-foreground-muted transition-colors hover:text-foreground"
            >
              Privacy
            </a>
            <a
              href="#"
              className="text-xs text-foreground-muted transition-colors hover:text-foreground"
            >
              Terms
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
