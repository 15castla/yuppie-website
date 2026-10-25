"use client";

// What members see when a members page fails to render, e.g. a Supabase
// request timing out on a bad connection. Renders inside the members
// layout, so the shell (header and tab bar) stays around it. redirect() and notFound()
// never land here: Next's error boundary rethrows them to the boundaries
// that handle them. No entrance animation, like every members page.

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { RetryButton } from "@/components/RetryButton";
import { EYEBROW_CLASS, MEMBERS_MAIN_CLASS } from "@/components/members/ui";
import { isEventDetailPath, landingLabel, landingPath } from "@/lib/members/routes";

export default function MembersError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    // Shows in the browser console and, via the digest, matches the
    // server-side entry in Vercel's logs.
    console.error("Members page error:", error, error.digest ? `(digest ${error.digest})` : "");
  }, [error]);

  return (
    <>
      <main className={MEMBERS_MAIN_CLASS}>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span className={EYEBROW_CLASS}>MEMBERS AREA</span>
            <h1 className="text-2xl font-extrabold leading-[1.05] text-foreground sm:text-3xl optical-trim">
              Something went wrong.
            </h1>
          </div>
          <p className="text-sm text-foreground-muted">Check your connection and try again.</p>
          <div className="flex flex-wrap items-center gap-5">
            <RetryButton error={error} retry={retry} />
            <Link
              href={landingPath()}
              className="text-sm font-bold text-foreground/70 underline underline-offset-2 hover:text-foreground"
            >
              Back to {landingLabel()}
            </Link>
          </div>
        </div>
      </main>

      {/* Only on event pages, where the shell draws no tab bar (the event
          page has its own bar); elsewhere the shell's tab bar, or its own
          bottom tint strip, already covers this. */}
      {isEventDetailPath(pathname) && (
        <>
          {/* Event detail pages draw no tab bar (see isEventDetailPath in
              lib/members/routes.ts), so the shell's own tint strip is what
              covers the bottom edge there. This one stays for the error
              screen, where the page has not drawn its own bar: without a
              solid background-color near the bottom edge, Safari 26's
              toolbar falls back to a plain white bar. Height matches the
              real safe area (not a flat 16px), see components/members/
              shell/dock-bar.tsx. */}
          <div
            aria-hidden
            className="fixed inset-x-0 bottom-0 z-20 h-[max(1rem,env(safe-area-inset-bottom))] bg-background md:hidden"
          />
        </>
      )}
    </>
  );
}
