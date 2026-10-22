import Link from "next/link";

import { cn } from "@/lib/utils";
import { ArrowRightIcon } from "@/components/site/icons";
import { PRIMARY_BUTTON_CLASS, SERIF_ACCENT_CLASS, SITE_CONTAINER_CLASS } from "@/components/site/ui";

// The closing band every inner page ends on (/faq and /contact): a
// full-bleed 3px rule, the price, the committee and one Apply pill. One
// component for phone and desktop (round 2, inner pages spec 2.1 and D4).
//
// Phones: left-aligned, the pill full width under the text; 64px under the
// pill clears the home indicator without a safe-area value. From 768 the
// text sits on the left and the pill on the right edge, its bottom on the
// text's last line.
//
// Render it after </main>, as a sibling of the page's <main>, so the rule
// runs edge to edge. The page above it ends with md:pb-[clamp(56px,6vw,88px)]
// (BAND_MAIN_PADDING_CLASS in the page files) so the gap above the rule
// stays under 128px.
export function ApplyBand() {
  return (
    <section aria-labelledby="apply-band-heading" className="border-t-[3px] border-foreground">
      <div
        className={cn(
          SITE_CONTAINER_CLASS,
          "pt-10 pb-16 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-x-12 md:py-[clamp(56px,6vw,88px)]",
        )}
      >
        <div>
          <h2
            id="apply-band-heading"
            className={cn(
              SERIF_ACCENT_CLASS,
              "m-0 text-[30px] leading-[1.05] md:text-[clamp(40px,4.6vw,64px)] md:leading-none md:tracking-[-0.01em]",
            )}
          >
            Thinking of joining?
          </h2>
          <p className="m-0 mt-2.5 mb-6 text-base leading-[1.45] md:mt-4 md:mb-0 md:max-w-[520px] md:text-[19px] md:leading-normal">
            £10 a month. Cancel any time. Every application is reviewed by our membership committee.
          </p>
        </div>
        <Link href="/apply" className={cn(PRIMARY_BUTTON_CLASS, "w-full md:w-auto")}>
          Apply for membership
          <ArrowRightIcon />
        </Link>
      </div>
    </section>
  );
}
