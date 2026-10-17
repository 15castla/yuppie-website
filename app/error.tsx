"use client";

// Shown when a page outside the members area (the public site, admin)
// fails to render. Same title header as /contact and /faq. The members area
// has its own, app/members/error.tsx; a failure in the root layout itself
// falls through to app/global-error.tsx.

import { useEffect } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { almarai, instrumentSerif } from "@/components/templates/creative-studio/fonts";
import { RetryButton } from "@/components/RetryButton";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Page error:", error, error.digest ? `(digest ${error.digest})` : "");
  }, [error]);

  return (
    <div
      className={cn(
        almarai.variable,
        instrumentSerif.variable,
        "flex flex-1 flex-col bg-background text-foreground antialiased",
      )}
      style={{ fontFamily: "var(--font-almarai), ui-sans-serif, system-ui, sans-serif" }}
    >
      <main className="relative z-10 flex flex-1 flex-col items-center px-4 pt-[calc(7rem+var(--safe-top))] pb-20 sm:px-6 sm:pt-[calc(8rem+var(--safe-top))] sm:pb-28 md:pb-32">
        <div className="flex w-full max-w-md flex-col items-center gap-3 text-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-foreground sm:text-xs optical-trim">
            ERROR
          </span>
          <h1 className="text-3xl leading-[0.95] text-foreground sm:text-4xl sm:leading-[0.9] md:text-5xl font-extrabold optical-trim">
            Something went wrong.
          </h1>
          <p className="max-w-sm text-sm text-foreground-muted sm:text-base">
            Check your connection and try again.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-5">
            <RetryButton error={error} retry={retry} />
            <Link
              href="/"
              className="text-sm font-bold text-foreground/70 underline underline-offset-2 hover:text-foreground"
            >
              Back to home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
