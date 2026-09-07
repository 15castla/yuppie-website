"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  almarai,
  instrumentSerif,
} from "@/components/templates/creative-studio/fonts";
import { SiteNav } from "@/components/templates/creative-studio/site-nav";
import { WordsPullUpMultiStyle } from "@/components/templates/creative-studio/primitives";

// Same curve/pattern as Hero's entrance animation
// (components/templates/creative-studio/hero.tsx) — reused here so the
// FAQ page's arrival reads as the same transition as the rest of the site.
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

const HEADING_SEGMENTS = [
  { text: "Got questions?" },
  {
    text: "We've got answers.",
    className: "italic [font-family:var(--font-instrument-serif)]",
  },
];

type FaqEntry = { question: string; answer: string };

const FAQ_ITEMS: FaqEntry[] = [
  {
    question: "How does membership work? Can I cancel at any time?",
    answer:
      "Yes, it's completely flexible. £10/month gets you in, and you can cancel whenever you like, no lock-in, no faff.",
  },
  {
    question: "How will I know if my application's been approved?",
    answer:
      "Every application is reviewed by our membership committee, so it's not instant. Once you're approved, you'll get a text from Yuppie letting you know.",
  },
  {
    question: "Will I be charged when I apply?",
    answer:
      "No, your card details are saved securely with Stripe when you apply, but you're not charged anything. We only take payment once your application's approved, and you can cancel any time after that.",
  },
  {
    question:
      "Do I have to pay for events, or are they included in membership?",
    answer:
      "Membership covers your discounts, access and entry to events. Most events do have their own cost on top, but we run them at cost, so you're only ever paying what it actually costs to put on, never a markup. We also run free members only events regularly.",
  },
  {
    question: "What additional perks do I get, beyond access to events?",
    answer:
      "Real discounts with partners across London, from restaurants and bars to barbers, gyms and sports clubs. Plus access to things that aren't open to the public, like skip the queue entry at partner venues, invite only parties and first dibs before things sell out.",
  },
  {
    question: "How do I book onto events?",
    answer:
      "You can book through your Members Area or the Yuppie app, downloadable from the App Store and Google Play. Everything happening that month is listed there, so you just pick what you fancy.",
  },
];

function FaqAccordionItem({ item }: { item: FaqEntry }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  return (
    <div className="rounded-2xl border border-foreground/10 bg-background-muted">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 p-6 text-left sm:p-8"
      >
        <span className="text-sm font-bold text-foreground sm:text-base">
          {item.question}
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background">
          {open ? (
            <Minus className="h-4 w-4 text-foreground" />
          ) : (
            <Plus className="h-4 w-4 text-foreground" />
          )}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="px-6 pb-6 text-sm leading-relaxed text-foreground-muted sm:px-8 sm:pb-8 sm:text-base">
              {item.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FaqPage() {
  const reduce = useReducedMotion();
  const fade = (delay: number) => ({
    initial: reduce ? false : { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.8, delay, ease: EASE_OUT_EXPO },
  });

  return (
    <div
      className={cn(
        almarai.variable,
        instrumentSerif.variable,
        "flex flex-1 flex-col bg-background text-foreground antialiased",
      )}
      style={{
        fontFamily: "var(--font-almarai), ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <section className="relative flex flex-1 flex-col overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 bottom-0 select-none"
        >
          <Image
            src="/yuppie_logo_forte_forward.png"
            alt=""
            width={1942}
            height={641}
            className="h-auto w-full opacity-10"
          />
        </div>

        <SiteNav />

        <main className="relative z-10 flex flex-1 flex-col items-center px-4 pt-28 pb-20 sm:px-6 sm:pt-32 sm:pb-28 md:pb-32">
          <div className="flex w-full max-w-3xl flex-col items-center gap-6 text-center">
            <motion.span
              {...fade(0.15)}
              className="text-[10px] font-bold uppercase tracking-[0.24em] text-foreground sm:text-xs optical-trim"
            >
              FAQ&apos;S
            </motion.span>

            <motion.h1
              {...fade(0.3)}
              className="text-xl leading-[0.95] text-foreground sm:text-2xl sm:leading-[0.9] md:text-3xl lg:text-4xl font-extrabold optical-trim"
            >
              <WordsPullUpMultiStyle segments={HEADING_SEGMENTS} />
            </motion.h1>

            <motion.p
              {...fade(0.45)}
              className="max-w-md text-sm text-foreground-muted sm:text-base"
            >
              Can&apos;t find what you&apos;re looking for?
              <br />
              Get in touch at{" "}
              <a
                href="mailto:hello@clubyuppie.com"
                className="text-foreground/70 underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                hello@clubyuppie.com
              </a>
            </motion.p>
          </div>

          <div className="mt-12 flex w-full max-w-3xl flex-col gap-4">
            {FAQ_ITEMS.map((item, index) => (
              <motion.div key={item.question} {...fade(0.6 + index * 0.08)}>
                <FaqAccordionItem item={item} />
              </motion.div>
            ))}
          </div>
        </main>
      </section>
    </div>
  );
}
