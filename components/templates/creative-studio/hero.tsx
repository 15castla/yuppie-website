"use client";

import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

// "#" for FAQ's, which doesn't have a page yet — the other three link to
// their real, already-built routes rather than sitting dead, matching how
// the footer's matching labels are wired.
const NAV_ITEMS: { label: string; href: string }[] = [
  { label: "Members Area", href: "/member-login" },
  { label: "Membership", href: "/apply" },
  { label: "FAQ's", href: "#" },
  { label: "Contact", href: "/contact" },
];

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

const TOP_MARQUEE_ITEMS = ["London's Social Club", "Launching Q1 2027", "Apply Now"];
const BOTTOM_MARQUEE_ITEMS = ["Dinners", "Padel & Pints", "Wellness Retreats", "New Faces"];

function Marquee({ items, reverse }: { items: string[]; reverse?: boolean }) {
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-foreground/10">
      <div
        className={`flex w-max items-center gap-10 whitespace-nowrap py-3 ${
          reverse ? "animate-marquee-reverse" : "animate-marquee"
        }`}
      >
        {doubled.map((item, i) => (
          <span key={i} className="flex items-center gap-10">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground/60">
              {item}
            </span>
            <span className="text-[6px] text-foreground/30">●</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Hero({
  videoSrc,
  posterSrc,
}: {
  videoSrc?: string;
  posterSrc?: string;
}) {
  const reduce = useReducedMotion();

  const fade = (delay: number) => ({
    initial: reduce ? false : { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.8, delay, ease: EASE_OUT_EXPO },
  });

  return (
    <section className="relative h-dvh w-full bg-background p-4 md:p-6">
      <div className="relative flex h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl bg-background md:h-[calc(100dvh-3rem)] md:rounded-[2rem]">
        {videoSrc ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={videoSrc}
            poster={posterSrc}
            autoPlay
            loop
            muted
            playsInline
          />
        ) : null}

        <nav className="absolute left-1/2 top-0 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-b-2xl bg-background md:max-w-none md:rounded-b-3xl">
          <ul
            className="flex items-center gap-5 overflow-x-auto whitespace-nowrap px-5 py-2.5 sm:gap-7 md:gap-9 md:px-9 lg:gap-11 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none" }}
          >
            {NAV_ITEMS.map((item) =>
              item.href.startsWith("/") ? (
                <li key={item.label} className="shrink-0">
                  <Link
                    href={item.href}
                    className="text-xs text-foreground/80 transition-colors hover:text-foreground md:text-sm"
                  >
                    {item.label}
                  </Link>
                </li>
              ) : (
                <li key={item.label} className="shrink-0">
                  <a
                    href={item.href}
                    className="text-xs text-foreground/80 transition-colors hover:text-foreground md:text-sm"
                  >
                    {item.label}
                  </a>
                </li>
              ),
            )}
          </ul>
        </nav>

        <div className="relative z-10 flex flex-1 flex-col">
          <div className="mt-14 sm:mt-16 md:mt-20">
            <Marquee items={TOP_MARQUEE_ITEMS} />
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center sm:gap-7 md:gap-8">
            <motion.div {...fade(0.2)} className="w-[46%] min-w-[220px] max-w-[500px]">
              <Image
                src="/yuppie_logo_forte_forward.png"
                alt="Yuppie"
                width={1942}
                height={641}
                priority
                className="h-auto w-full"
              />
            </motion.div>

            <motion.p
              {...fade(0.4)}
              className="max-w-md text-base text-foreground/70 sm:text-lg"
              style={{ lineHeight: 1.5 }}
            >
              Calendars full of meetings. Group chats that never land on a
              plan. Weekends on repeat. We got fed up, so we built Yuppie.
            </motion.p>

            <motion.div {...fade(0.6)}>
              <Link
                href="/apply"
                className="group inline-flex w-fit items-center gap-2 rounded-full bg-background-muted py-2 pe-2 ps-6 text-base font-bold text-foreground transition-all duration-300 hover:gap-3"
              >
                Membership
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background transition-transform duration-300 group-hover:scale-110">
                  <ArrowRight className="h-4 w-4 text-foreground rtl:rotate-180" />
                </span>
              </Link>
            </motion.div>
          </div>

          <div className="mb-4 sm:mb-6">
            <Marquee items={BOTTOM_MARQUEE_ITEMS} reverse />
          </div>
        </div>
      </div>
    </section>
  );
}
