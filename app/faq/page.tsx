"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { almarai, instrumentSerif } from "@/components/templates/creative-studio/fonts";
import { CONTACT_EMAIL } from "@/components/site/links";
import { ApplyBand } from "@/components/site/apply-band";
import { BrickPhoneDrawing } from "@/components/site/icons";
import {
  INNER_PAGE_H1_CLASS,
  HEADLINE_ACCENT_CLASS,
  SERIF_ACCENT_CLASS,
  SITE_CONTAINER_CLASS,
  SITE_FONT_STYLE,
  SITE_PAGE_CLASS,
  TERM_LABEL_CLASS,
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

// The questions in the order people wonder, under two labels (round 2
// inner pages spec 5.1 and D4.1). Numbers index FAQ_ITEMS above, which
// keeps every question and answer exactly as approved and in its original
// order; only the order shown changes. `openIndex` is an index into
// FAQ_ITEMS, so the first answer (question 0, "How does membership work?")
// is still the one open on arrival and is still the first row.
const FAQ_GROUPS: { label: string; items: number[] }[] = [
  { label: "Joining", items: [0, 2, 1] },
  { label: "Once you’re in", items: [3, 5, 4] },
];

// <main> on pages that end with the ApplyBand: the inner pages' padding
// (INNER_MAIN_PADDING_CLASS) with the desktop bottom padding cut to 88px
// at most, so the gap above the band's rule stays under 128px (RULE-11).
// Defined here because ui.ts is not this file's to edit; the same value is
// on /contact.
const BAND_MAIN_PADDING_CLASS =
  "pt-9 pb-16 md:pt-[clamp(48px,7vw,104px)] md:pb-[clamp(56px,6vw,88px)]";

// One answer open at a time, the first to start with (as on the board).
export default function FaqPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const reduce = useReducedMotion();
  const idPrefix = useId();

  return (
    <div className={cn(almarai.variable, instrumentSerif.variable, SITE_PAGE_CLASS)} style={SITE_FONT_STYLE}>
      <main className={cn(SITE_CONTAINER_CLASS, BAND_MAIN_PADDING_CLASS)}>
        {/* The heading keeps its 860px measure. Below the heading: the
            two groups, and the "Still stuck?" help. From 768 they sit side
            by side (the rows read in a 796px column at 1440 instead of
            1,160px, so each toggle is close to its question) and the help
            becomes a card that stays in view while the questions scroll. */}
        <div className="flex flex-col gap-8 md:gap-[clamp(40px,5vw,64px)]">
          <h1 className={cn(INNER_PAGE_H1_CLASS, "max-w-[860px] [text-wrap:balance]")}>
            Got questions? <br className="md:hidden" />
            <span className={HEADLINE_ACCENT_CLASS}>We’ve got answers.</span>
          </h1>

          <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_clamp(240px,24vw,300px)] md:items-start md:gap-x-[clamp(32px,5vw,64px)]">
            <div className="flex flex-col gap-8 md:gap-12">
              {FAQ_GROUPS.map((group) => (
                <div key={group.label} className="flex flex-col gap-3 md:gap-3.5">
                  <h2 className={cn(TERM_LABEL_CLASS, "md:tracking-[0.18em]")}>{group.label}</h2>
                  <div className="border-t-[1.5px] border-foreground">
                    {group.items.map((index) => {
                      const item = FAQ_ITEMS[index];
                      const open = openIndex === index;
                      const answerId = `${idPrefix}-answer-${index}`;
                      return (
                        <div key={item.question} className="border-b-[1.5px] border-foreground">
                          <h3 className="m-0">
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
                          </h3>
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
                </div>
              ))}
            </div>

            {/* "Still stuck?": phones, a plain block under the last row with
                the brick phone beside it. From 768 a pale card (8px hard
                shadow ending on the container edge, so mr-2) beside the
                questions, text first and the phone 18px below, 33px down
                so its top lines up with the first group's rule. It is
                sticky, 128px from the top (the 94px bar plus 34px).
                NEEDS A REAL IPAD / iOS SAFARI CHECK before merge (RULE-19:
                position sticky). */}
            <aside
              aria-labelledby="faq-still-stuck"
              className="-mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 md:sticky md:top-32 md:mt-[33px] md:mr-2 md:box-border md:block md:rounded-[20px] md:border-2 md:border-foreground md:bg-background-muted md:p-[clamp(20px,2vw,28px)] md:shadow-[8px_8px_0_var(--foreground)]"
            >
              <div>
                <h2 id="faq-still-stuck" className={cn(SERIF_ACCENT_CLASS, "m-0 text-[28px] leading-[1.05]")}>
                  Still stuck?
                </h2>
                <p className="m-0 mt-2 text-[15px] leading-[1.45] md:mt-2.5 md:leading-normal">
                  Can’t find what you’re looking for? Get in touch at{" "}
                  <a href={`mailto:${CONTACT_EMAIL}`} className={cn(TEXT_LINK_CLASS, "[overflow-wrap:anywhere]")}>
                    {CONTACT_EMAIL}
                  </a>
                </p>
              </div>
              <BrickPhoneDrawing size={30} viewBox="66.5 10.5 67 177" width={30} height={80} className="block md:mt-[18px]" />
            </aside>
          </div>
        </div>
      </main>
      <ApplyBand />
    </div>
  );
}
