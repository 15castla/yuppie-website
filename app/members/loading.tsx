import { MEMBERS_MAIN_CLASS } from "@/components/members/ui";
import { cn } from "@/lib/utils";

const BLOCK = "rounded-lg bg-foreground/[0.06]";

export default function MembersLoading() {
  return (
    <>
      {/* A neutral, page-shaped skeleton (eyebrow, title, a few cards)
          rather than a spinner, laid out like the real pages. animate-pulse,
          not animate-spin: the iOS app's splash (mobile/ios/App/App/
          SceneDelegate.swift) waits for no "animate-spin" element before
          hiding, so it now hides onto this skeleton instead of waiting for
          the page itself. */}
      <main className={MEMBERS_MAIN_CLASS} aria-busy="true">
        <span className="sr-only">Loading</span>
        <div className="mx-auto flex w-full max-w-3xl animate-pulse flex-col gap-8" aria-hidden>
          <div className="flex flex-col gap-3">
            <div className={cn(BLOCK, "h-2.5 w-28")} />
            <div className={cn(BLOCK, "h-8 w-52")} />
          </div>
          <div className={cn(BLOCK, "h-12 rounded-2xl")} />
          <div className={cn(BLOCK, "h-36 rounded-2xl")} />
          <div className={cn(BLOCK, "h-36 rounded-2xl")} />
        </div>
      </main>

      {/* Covers the cold-navigation window into the members area, before
          the layout's own requireMember() has resolved and nothing,
          including MembersBottomBar, has rendered yet: this is the actual
          trigger for the white-bar bug, confirmed to reproduce only on a
          reload or a first navigation in, never between already-mounted
          /members/* pages. Height matches the real safe area (not a flat
          16px) for the same reason as MembersBottomBar's own strip: see
          the matching comment there and in
          app/members/events/[slug]/loading.tsx. */}
      <div
        aria-hidden
        className="fixed inset-x-0 bottom-0 z-20 h-[max(1rem,env(safe-area-inset-bottom))] bg-background md:hidden"
      />
    </>
  );
}
