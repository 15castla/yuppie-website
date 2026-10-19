import Link from "next/link";

import { cn } from "@/lib/utils";
import { almarai, instrumentSerif } from "@/components/templates/creative-studio/fonts";
import { ArrowRightIcon, BrickPhoneDrawing } from "@/components/site/icons";
import { CONTACT_EMAIL } from "@/components/site/links";
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
} from "@/components/site/ui";

const ROW_CLASS =
  "flex flex-col gap-2 border-b-[1.5px] border-foreground pt-[18px] pb-5 md:flex-row md:flex-wrap md:items-baseline md:gap-x-8 md:py-7";
const TERM_CLASS =
  "text-[13px] font-bold uppercase tracking-[0.14em] text-site-muted md:flex-[0_0_120px] md:tracking-[0.18em]";

export default function ContactPage() {
  return (
    <div className={cn(almarai.variable, instrumentSerif.variable, SITE_PAGE_CLASS)} style={SITE_FONT_STYLE}>
      <main className={cn(SITE_CONTAINER_CLASS, INNER_MAIN_PADDING_CLASS, "flex flex-col gap-9 md:gap-[clamp(36px,4vw,56px)]")}>
        {/* The phone sits at the right of the heading row (46x122, cropped
            to its ink, on phones; 180px from md); the rows below run the
            full container width. */}
        <div className="flex items-start justify-between gap-3 md:items-center md:gap-12">
          <h1 className={INNER_PAGE_H1_CLASS}>
            Get in <br className="md:hidden" />
            <span className={HEADLINE_ACCENT_CLASS}>touch.</span>
          </h1>
          <BrickPhoneDrawing
            size={46}
            viewBox="66.5 10.5 67 177"
            width={46}
            height={122}
            label="Line drawing of an 80s brick phone"
            className="mt-1 mr-1.5 block shrink-0 rotate-[14deg] md:hidden"
          />
          <BrickPhoneDrawing
            size={180}
            label="Line drawing of an 80s brick phone"
            className="hidden shrink-0 rotate-[14deg] md:block"
          />
        </div>
        <dl className="m-0 border-t-[1.5px] border-foreground">
          <div className={ROW_CLASS}>
            <dt className={TERM_CLASS}>Email</dt>
            <dd className="m-0 text-[26px] leading-[calc(2/1.5)] font-extrabold tracking-[-0.02em] md:text-[clamp(24px,2.4vw,32px)] md:tracking-[-0.015em]">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="inline-flex min-h-11 items-center break-all no-underline hover:opacity-70 max-md:-my-[5px]"
              >
                {CONTACT_EMAIL}
              </a>
            </dd>
          </div>
          <div className={ROW_CLASS}>
            <dt className={TERM_CLASS}>Address</dt>
            <dd className="m-0 text-lg leading-[1.45] md:text-xl">
              Club Yuppie
              <br />1 Westmoreland Mansions
              <br />
              Westminster, London W1G 8TN
            </dd>
          </div>
        </dl>

        {/* Phones only. */}
        <div className={cn(CARD_CLASS, "mt-2 mr-1.5 pt-6 md:hidden")}>
          <h2 className={cn(SERIF_ACCENT_CLASS, "m-0 text-[30px] leading-[1.05]")}>Thinking of joining?</h2>
          <p className="m-0 mt-2.5 mb-[18px] text-base leading-[1.45]">
            £10 a month. Cancel any time. Every application is reviewed by our membership committee.
          </p>
          <Link href="/apply" className={cn(PRIMARY_BUTTON_CLASS, "w-full")}>
            Apply for membership
            <ArrowRightIcon />
          </Link>
        </div>
      </main>
    </div>
  );
}
