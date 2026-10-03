import { cn } from "@/lib/utils";
import {
  almarai,
  instrumentSerif,
} from "@/components/templates/creative-studio/fonts";
export default function ContactPage() {
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
        <main className="relative z-10 flex flex-1 flex-col items-center px-4 pt-28 pb-20 sm:px-6 sm:pt-32 sm:pb-28 md:pb-32">
          <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-foreground sm:text-xs optical-trim">
              CONTACT
            </span>

            <h1 className="text-xl leading-[0.95] text-foreground sm:text-2xl sm:leading-[0.9] md:text-3xl lg:text-4xl font-extrabold optical-trim">
              Get in touch.
            </h1>

            <p className="max-w-sm text-sm text-foreground-muted sm:text-base">
              Questions about membership, events, or anything else, drop us
              an email and we&apos;ll get back to you.
            </p>
          </div>

          <div className="mt-12 flex w-full max-w-md flex-col gap-4">
            <div className="rounded-2xl border border-foreground/10 bg-background-muted p-6 sm:p-8">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground-muted">
                Email
              </h2>
              <a
                href="mailto:hello@clubyuppie.com"
                className="mt-2 inline-block text-sm font-bold text-foreground underline-offset-2 transition-colors hover:underline sm:text-base"
              >
                hello@clubyuppie.com
              </a>
            </div>

            <div className="rounded-2xl border border-foreground/10 bg-background-muted p-6 sm:p-8">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground-muted">
                Registered address
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-foreground sm:text-base">
                Club Yuppie
                <br />
                1 Westmoreland Mansions
                <br />
                Westminster, London W1G 8TN
              </p>
            </div>
          </div>
        </main>
      </section>
    </div>
  );
}
