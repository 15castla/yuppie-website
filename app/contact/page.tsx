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
      <main
        className={cn(
          SITE_CONTAINER_CLASS,
          SITE_MAIN_PADDING_CLASS,
          "flex flex-col gap-8 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-x-20 md:gap-y-12",
        )}
      >
        <div className="flex min-w-0 flex-col gap-8 md:flex-[1_1_560px] md:gap-[clamp(36px,4vw,56px)]">
          {/* On mobile the phone sits beside the heading; on desktop it's on
              the right of the whole block. */}
          <div className="flex items-start justify-between gap-3">
            <h1 className={PAGE_H1_CLASS}>
              Get in <span className={HEADLINE_ACCENT_CLASS}>touch.</span>
            </h1>
            <BrickPhoneDrawing
              size={96}
              strokeWidth={3.5}
              label="Line drawing of an 80s brick phone"
              className="block shrink-0 rotate-[14deg] md:hidden"
            />
          </div>
          <dl className="m-0 border-t-[1.5px] border-foreground md:max-w-[620px]">
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
        </div>
        <BrickPhoneDrawing
          size={180}
          label="Line drawing of an 80s brick phone"
          className="mx-auto hidden shrink-0 rotate-[14deg] md:block"
        />
      </main>
    </div>
  );
}
