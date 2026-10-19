"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { almarai, instrumentSerif } from "@/components/templates/creative-studio/fonts";
import { CONTACT_EMAIL } from "@/components/site/links";
import {
  PAGE_H1_CLASS,
  HEADLINE_ACCENT_CLASS,
  SITE_CONTAINER_CLASS,
  SITE_FONT_STYLE,
  SITE_MAIN_PADDING_CLASS,
  SITE_PAGE_CLASS,
  TEXT_LINK_CLASS,
} from "@/components/site/ui";

type FaqEntry = { question: string; answer: string };

// Copy from the approved board (design-ref/boards/DFaq.dc.html).
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
    question: "Do I have to pay for events, or are they included in membership?",
    answer:
      "Membership covers your discounts, access and entry to events. Most events do have their own cost on top, but we run them at cost, so you're only ever paying what it actually costs to put on, never a markup. We also run free members only events regularly.",
  },
  {
    question: "What additional perks do I get, beyond access to events?",
    answer:
      "Real discounts with partners across the city, from restaurants and bars to barbers, gyms and sports clubs. Plus access to things that aren't open to the public, like skip the queue entry at partner venues, invite only parties and first dibs before things sell out.",
  },
  {
    question: "How do I book onto events?",
    answer:
      "You can book through your Members Area or the Yuppie app, downloadable from the App Store and Google Play. Everything happening that month is listed there, so you just pick what you fancy.",
  },
];

// One answer open at a time, the first to start with (as on the board).
export default function FaqPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const reduce = useReducedMotion();
  const idPrefix = useId();

  return (
    <div className={cn(almarai.variable, instrumentSerif.variable, SITE_PAGE_CLASS)} style={SITE_FONT_STYLE}>
      <main className={cn(SITE_CONTAINER_CLASS, SITE_MAIN_PADDING_CLASS)}>
        {/* The rows run the full container width (their rules and +/-
            circles end on its right edge, in line with the header's Apply
            pill); the heading keeps its 860px measure and the answers
            their 700px reading width. */}
        <div className="flex flex-col gap-8 md:gap-[clamp(40px,5vw,64px)]">
          <h1 className={cn(PAGE_H1_CLASS, "max-w-[860px] [text-wrap:balance]")}>
            Got questions? <span className={HEADLINE_ACCENT_CLASS}>We&apos;ve got answers.</span>
          </h1>

          <div className="border-t-[1.5px] border-foreground">
            {FAQ_ITEMS.map((item, index) => {
              const open = openIndex === index;
              const answerId = `${idPrefix}-answer-${index}`;
              return (
                <div key={item.question} className="border-b-[1.5px] border-foreground">
                  <h2 className="m-0">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={answerId}
                      onClick={() => setOpenIndex(open ? null : index)}
                      className="flex min-h-16 w-full items-center justify-between gap-4 border-0 bg-transparent py-[18px] text-left text-foreground md:min-h-[72px] md:gap-6 md:py-[22px]"
                    >
                      <span className="text-[17px] font-bold leading-[1.3] md:text-[clamp(19px,1.8vw,22px)]">
                        {item.question}
                      </span>
                      <span
                        aria-hidden
                        className="flex size-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground text-lg font-bold leading-none md:size-9 md:text-xl"
                      >
                        {open ? "–" : "+"}
                      </span>
                    </button>
                  </h2>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        id={answerId}
                        initial={reduce ? false : { height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={reduce ? undefined : { height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <p className="m-0 pb-[22px] text-base leading-[1.6] md:max-w-[700px] md:pr-[60px] md:pb-[26px] md:text-[17px]">
                          {item.answer}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          <p className="m-0 text-base leading-[1.55] md:text-[17px]">
            Can&apos;t find what you&apos;re looking for? Get in touch at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className={TEXT_LINK_CLASS}>
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
