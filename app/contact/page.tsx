import { cn } from "@/lib/utils";
import { almarai, instrumentSerif } from "@/components/templates/creative-studio/fonts";
import { BrickPhoneDrawing } from "@/components/site/icons";
import { CONTACT_EMAIL } from "@/components/site/links";
import {
  PAGE_H1_CLASS,
  HEADLINE_ACCENT_CLASS,
  SITE_CONTAINER_CLASS,
  SITE_FONT_STYLE,
  SITE_MAIN_PADDING_CLASS,
  SITE_PAGE_CLASS,
} from "@/components/site/ui";

const ROW_CLASS =
  "flex flex-col gap-2 border-b-[1.5px] border-foreground py-[22px] md:flex-row md:flex-wrap md:items-baseline md:gap-x-8 md:py-7";
const TERM_CLASS =
  "text-xs font-bold uppercase tracking-[0.18em] text-site-muted md:flex-[0_0_120px] md:text-[13px]";

export default function ContactPage() {
  return (
    <div className={cn(almarai.variable, instrumentSerif.variable, SITE_PAGE_CLASS)} style={SITE_FONT_STYLE}>
      <main className={cn(SITE_CONTAINER_CLASS, SITE_MAIN_PADDING_CLASS, "flex flex-col gap-8 md:gap-[clamp(36px,4vw,56px)]")}>
        {/* The phone sits at the right of the heading row (96px on mobile,
            180px from md); the rows below run the full container width. */}
        <div className="flex items-start justify-between gap-3 md:items-center md:gap-12">
          <h1 className={PAGE_H1_CLASS}>
            Get in <span className={HEADLINE_ACCENT_CLASS}>touch.</span>
          </h1>
          <BrickPhoneDrawing
            size={96}
            strokeWidth={3.5}
            label="Line drawing of an 80s brick phone"
            className="block shrink-0 rotate-[14deg] md:hidden"
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
            <dd className="m-0 text-2xl font-extrabold tracking-[-0.015em] md:text-[clamp(24px,2.4vw,32px)]">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="inline-flex min-h-11 items-center break-all no-underline hover:opacity-70"
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
      </main>
    </div>
  );
}
