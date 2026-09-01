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
    <section className="relative w-full bg-background p-4 md:p-6">
      <div className="relative flex w-full flex-col overflow-hidden rounded-2xl bg-background md:rounded-[2rem]">
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

        <div className="relative z-10 p-4 pt-16 sm:p-6 sm:pt-20 md:p-8 md:pt-24 lg:p-10 lg:pt-16">
          <div className="grid grid-cols-12 items-end gap-6 md:gap-8">
            {/* lg:mb-* only — below lg the columns stack into separate rows
                (both col-span-12), where items-end has no effect anyway and
                the existing row gap already spaces them correctly. At lg+,
                where they sit side by side in one items-end row, this pulls
                the image's bottom edge up off the shared row-bottom line by
                roughly the paragraph+gap+button block's height, landing it
                at the paragraph's top instead — the right column itself is
                untouched, so the button stays exactly where it was. */}
            <div className="col-span-12 flex flex-col items-center gap-3 lg:col-span-8 lg:mb-36">
              <motion.div {...fade(0.2)} className="w-full">
                <Image
                  src="/yuppie_logo_forte_forward.png"
                  alt="Yuppie"
                  width={1942}
                  height={641}
                  priority
                  className="h-auto w-full"
                />
              </motion.div>

              <motion.span
                {...fade(0.4)}
                className="text-center text-xs font-bold uppercase tracking-wider text-foreground/55"
              >
                Launching Q1 2027
              </motion.span>
            </div>

            <div className="col-span-12 flex flex-col gap-4 md:gap-6 lg:col-span-4">
              <motion.p
                {...fade(0.5)}
                className="max-w-md text-sm text-foreground/70 sm:text-base"
                style={{ lineHeight: 1.3 }}
              >
                Calendars full of meetings. Group chats that never land on a
                plan. Nights lost scrolling for something to do. We got fed
                up, so we built Yuppie.
              </motion.p>

              <motion.div {...fade(0.7)}>
                <Link
                  href="/apply"
                  className="group inline-flex w-fit items-center gap-2 rounded-full bg-background-muted py-1.5 pe-1.5 ps-5 text-sm font-bold text-foreground transition-all duration-300 hover:gap-3 sm:text-base"
                >
                  Membership
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-background transition-transform duration-300 group-hover:scale-110 sm:h-10 sm:w-10">
                    <ArrowRight className="h-4 w-4 text-foreground rtl:rotate-180" />
                  </span>
                </Link>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
