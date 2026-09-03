"use client";

import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

import { SiteNav } from "./site-nav";

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

        <SiteNav />

        <div className="relative z-10 mt-auto p-4 sm:p-6 md:p-8 lg:p-10">
          <div className="grid grid-cols-12 items-end gap-6 md:gap-8">
            {/* lg:mb-* only — below lg the columns stack into separate rows
                (both col-span-12), where items-end has no effect anyway and
                the existing row gap already spaces them correctly. At lg+,
                where they sit side by side in one items-end row, this pulls
                the image's bottom edge up off the shared row-bottom line by
                roughly the paragraph+gap+button block's height, landing it
                at the paragraph's top instead — the right column itself is
                untouched, so the button stays exactly where it was. */}
            <div className="col-span-12 flex flex-col items-center lg:col-span-8 lg:mb-32">
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
            </div>

            <div className="col-span-12 flex flex-col gap-4 md:gap-6 lg:col-span-4">
              <motion.p
                {...fade(0.5)}
                className="max-w-md text-sm text-foreground/70 sm:text-base"
                style={{ lineHeight: 1.3 }}
              >
                Calendars full of meetings. Group chats that never land on a
                plan. Weekends on repeat. We got fed up, so we built Yuppie.
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
