import Link from "next/link";

import { cn } from "@/lib/utils";
import { almarai, instrumentSerif } from "@/components/templates/creative-studio/fonts";
import { ArrowRightIcon, BrickPhoneDrawing } from "@/components/site/icons";
import { CONTACT_EMAIL } from "@/components/site/links";
import { ApplyBand } from "@/components/site/apply-band";
import {
  INNER_PAGE_H1_CLASS,
  HEADLINE_ACCENT_CLASS,
  NO_BOX_CLASS,
  SITE_CONTAINER_CLASS,
  SITE_FONT_STYLE,
  SITE_PAGE_CLASS,
  TERM_LABEL_CLASS,
} from "@/components/site/ui";

// <main> on pages that end with the ApplyBand: the inner pages' padding
// (INNER_MAIN_PADDING_CLASS) with the desktop bottom padding cut to 88px
// at most, so the gap above the band's rule stays under 128px (RULE-11).
// Defined here because ui.ts is not this file's to edit; the same value is
// on /faq.
const BAND_MAIN_PADDING_CLASS =
  "pt-9 pb-16 md:pt-[clamp(48px,7vw,104px)] md:pb-[clamp(56px,6vw,88px)]";

// One whole-row link: label and arrow on the first line, the value under
// them across both columns (phones); label, value, then the arrow on the
// right edge on one line (768 and up, where the arrow is moved to the end
// with `order`). The arrow ends on the container edge (RULE-05).
const ROW_CLASS = cn(
  "group grid min-h-[68px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b-[1.5px] border-foreground pt-[18px] pb-5 text-foreground no-underline hover:opacity-70 md:flex md:items-baseline md:gap-x-8 md:py-7",
  NO_BOX_CLASS,
);
const LABEL_CLASS = cn(TERM_LABEL_CLASS, "md:flex-[0_0_120px] md:tracking-[0.18em]");
const ARROW_CLASS = "flex md:order-3 md:ml-auto md:self-center";
// Keyboard focus is a 3px underline on the value (RULE-35); no box.
const VALUE_CLASS =
  "col-span-2 text-[26px] font-extrabold leading-[1.25] tracking-[-0.02em] [overflow-wrap:anywhere] group-focus-visible:underline group-focus-visible:decoration-[3px] group-focus-visible:underline-offset-[6px] md:order-2 md:text-[clamp(24px,2.4vw,32px)] md:tracking-[-0.015em]";

function RowContent({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className={LABEL_CLASS}>{label}</span>
      <span aria-hidden className={ARROW_CLASS}>
        <ArrowRightIcon width={20} height={14} />
      </span>
      <span className={VALUE_CLASS}>{value}</span>
    </>
  );
}

export default function ContactPage() {
  return (
    <div className={cn(almarai.variable, instrumentSerif.variable, SITE_PAGE_CLASS)} style={SITE_FONT_STYLE}>
      <main className={cn(SITE_CONTAINER_CLASS, BAND_MAIN_PADDING_CLASS, "flex flex-col gap-9 md:gap-[clamp(36px,4vw,56px)]")}>
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
        {/* Two whole-row links at every width: the address (the page's
            job) and the FAQs (most questions are answered there). */}
        <nav aria-label="Contact" className="border-t-[1.5px] border-foreground">
          <a href={`mailto:${CONTACT_EMAIL}`} className={ROW_CLASS}>
            <RowContent label="Email" value={CONTACT_EMAIL} />
          </a>
          <Link href="/faq" className={ROW_CLASS}>
            <RowContent label="FAQs" value="Got questions?" />
          </Link>
        </nav>
      </main>
      <ApplyBand />
    </div>
  );
}
