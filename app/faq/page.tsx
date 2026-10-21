"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { almarai, instrumentSerif } from "@/components/templates/creative-studio/fonts";
import { CONTACT_EMAIL } from "@/components/site/links";
import { ArrowRightIcon, BrickPhoneDrawing } from "@/components/site/icons";
import {
  CARD_CLASS,
  INNER_PAGE_H1_CLASS,
  INNER_MAIN_PADDING_CLASS,
  HEADLINE_ACCENT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SERIF_ACCENT_CLASS,
  SITE_CONTAINER_CLASS,
  SITE_FONT_STYLE,
  SITE_PAGE_CLASS,
  TEXT_LINK_CLASS,
} from "@/components/site/ui";

type FaqEntry = { question: string; answer: string };

// Copy from the approved board (design-ref/boards/DFaq.dc.html).
const FAQ_ITEMS: FaqEntry[] = [
  {
    question: "How does membership work? Can I cancel at any time?",
    answer:
      "Yes. It’s £10 a month, cancel whenever you like. No lock-in, no faff.",
  },
  {
    question: "How will I know if my application’s been approved?",
    answer:
      "Every application is reviewed by our membership committee, so it’s not instant. If you’re in, we’ll tell you by text and email.",
  },
  {
    question: "Will I be charged when I apply?",
    answer:
      "No, your card details are saved securely with Stripe when you apply, but you’re not charged anything. We only take payment once your application’s approved, and you can cancel any time after that.",
  },
  {
    question: "Do I have to pay for events, or are they included in membership?",
    answer:
      "Membership covers your discounts and access. Events are run at cost and never marked up, and some are free for members.",
  },
  {
    question: "What additional perks do I get, beyond access to events?",
    answer:
      "Discounts at partner restaurants, bars, barbers, gyms and sports clubs. Plus access to things that aren’t open to the public: skip-the-queue entry at partner venues, guest lists and first dibs before things sell out.",
  },
  {
    question: "How do I book onto events?",
    answer:
      "You can book through your Members Area or the Club Yuppie app, downloadable from the App Store and Google Play. Everything happening that month is listed there, so you just pick what you fancy.",
  },
];

// One answer open at a time, the first to start with (as on the board).
export default function FaqPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const reduce = useReducedMotion();
  const idPrefix = useId();

  return (
    <div className={cn(almarai.variable, instrumentSerif.variable, SITE_PAGE_CLASS)} style={SITE_FONT_STYLE}>
      <main className={cn(SITE_CONTAINER_CLASS, INNER_MAIN_PADDING_CLASS)}>
        {/* The rows run the full container width (their rules and +/-
            circles end on its right edge, in line with the header's Apply
            pill); the heading keeps its 860px measure and the answers
            their 700px reading width. */}
        <div className="flex flex-col gap-8 md:gap-[clamp(40px,5vw,64px)]">
          <h1 className={cn(INNER_PAGE_H1_CLASS, "max-w-[860px] [text-wrap:balance]")}>
            Got questions? <br className="md:hidden" />
            <span className={HEADLINE_ACCENT_CLASS}>We’ve got answers.</span>
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
                      className="flex min-h-[72px] w-full items-center justify-between gap-4 border-0 bg-transparent py-3.5 text-left text-foreground md:gap-6 md:py-[22px]"
                    >
                      <span className="text-[17px] font-bold leading-[1.3] md:text-[clamp(19px,1.8vw,22px)]">
                        {item.question}
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground text-xl font-bold leading-none",
                          // Phones: filled ink with a yellow minus while open.
                          open && "max-md:bg-foreground max-md:text-background",
                        )}
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
                        <p className="m-0 pr-11 pb-[22px] text-base leading-[1.55] md:max-w-[700px] md:pr-[60px] md:pb-[26px] md:text-[17px] md:leading-[1.6]">
                          {item.answer}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          <p className="m-0 text-base leading-[1.55] max-md:hidden md:text-[17px]">
            Can’t find what you’re looking for? Get in touch at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className={TEXT_LINK_CLASS}>
              {CONTACT_EMAIL}
            </a>
          </p>
          {/* Phones: the same line in a card, with the brick phone. */}
          <div className={cn(CARD_CLASS, "mt-2 mr-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 md:hidden")}>
            <div>
              <h2 className={cn(SERIF_ACCENT_CLASS, "m-0 text-[28px] leading-[1.05]")}>Still stuck?</h2>
              <p className="m-0 mt-2 text-[15px] leading-[1.45]">
                Can’t find what you’re looking for? Get in touch at{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className={cn(TEXT_LINK_CLASS, "break-all")}>
                  {CONTACT_EMAIL}
                </a>
              </p>
            </div>
            <BrickPhoneDrawing size={30} viewBox="66.5 10.5 67 177" width={30} height={80} className="block" />
          </div>
          {/* Phones: one way to act at the foot of the page. */}
          <Link href="/apply" className={cn(PRIMARY_BUTTON_CLASS, "mt-2 w-full md:hidden")}>
            Apply for membership
            <ArrowRightIcon />
          </Link>
        </div>
      </main>
    </div>
  );
}
