import { MEMBERS_MAIN_CLASS } from "@/components/members/ui";

export default function MembersLoading() {
  return (
    <>
      {/* Plain-background loading state: an empty <main>, so a tab that
          isn't ready yet shows just the yellow page background (and the tab
          bar) until the real page arrives, rather than a layout outline or
          a spinner. aria-busy and the sr-only text tell screen readers. The
          iOS app's splash (mobile/ios/App/App/SceneDelegate.swift) hides
          once a <main> exists and no "animate-spin" element is present, so
          it hides onto this plain yellow, the same colour as the splash. */}
      <main className={MEMBERS_MAIN_CLASS} aria-busy="true">
        <span className="sr-only">Loading</span>
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
