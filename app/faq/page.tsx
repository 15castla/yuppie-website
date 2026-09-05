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

const HEADING_SEGMENTS = [
  { text: "Got questions?" },
  {
    text: "We've got answers.",
    className: "italic [font-family:var(--font-instrument-serif)]",
  },
];

type FaqEntry = { question: string; answer: string };

// Placeholder copy — swap for the real FAQ content when ready.
const FAQ_ITEMS: FaqEntry[] = [
  {
    question: "How does membership work? Can I cancel at any time?",
    answer:
      "Yes, it's completely flexible. £10/month gets you in, and you can cancel whenever you like — no lock-in, no faff.",
  },
  {
    question: "Is Yuppie worth it if I don't go out that often?",
    answer:
      "Even if you only make it to one or two things a month, the discounts and access alone tend to cover the membership cost — the events are the bonus on top.",
  },
  {
    question: "What do I actually get as a member?",
    answer:
      "Regular events across London (dinners, wellness, sport, nights out), real discounts with partner restaurants, bars, gyms and more, plus access to things that aren't open to the public — skip-the-queue entry, invite-only parties, first dibs before things sell out.",
  },
  {
    question: "How do I find out what's on and book a spot?",
    answer:
      "Once you're a member, everything happening that month lives in your Members Area — you just show up.",
  },
  {
    question:
      "What makes Yuppie different from other social apps or membership clubs?",
    answer:
      "We handle the planning. No group chats that go nowhere, no scrolling through options — just things worth doing, with people worth meeting, every time you show up.",
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
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-foreground sm:text-xs optical-trim">
              FAQ&apos;S
            </span>

            <h1 className="text-xl leading-[0.95] text-foreground sm:text-2xl sm:leading-[0.9] md:text-3xl lg:text-4xl font-extrabold optical-trim">
              <WordsPullUpMultiStyle segments={HEADING_SEGMENTS} />
            </h1>

            <p className="max-w-md text-sm text-foreground-muted sm:text-base">
              Can&apos;t find what you&apos;re looking for? Get in touch —{" "}
              <a
                href="mailto:hello@clubyuppie.com"
                className="font-bold text-foreground underline underline-offset-2"
              >
                hello@clubyuppie.com
              </a>
            </p>
          </div>

          <div className="mt-12 flex w-full max-w-3xl flex-col gap-4">
            {FAQ_ITEMS.map((item) => (
              <FaqAccordionItem key={item.question} item={item} />
            ))}
          </div>
        </main>
      </section>
    </div>
  );
}
