import { MEMBERS_MAIN_CLASS } from "@/components/members/ui";

export default function EventsLoading() {
  return (
    <>
      {/* The events list's own plain-background loading state, same as
          app/members/loading.tsx: an empty <main> until the list arrives.
          The iOS app's splash (mobile/ios/App/App/SceneDelegate.swift)
          hides once a <main> exists and no "animate-spin" element is
          present, so it hides onto this plain yellow, the same colour as
          the splash. */}
      <main className={MEMBERS_MAIN_CLASS} aria-busy="true">
        <span className="sr-only">Loading</span>
      </main>

      {/* Same strip, for the same reason, as app/members/loading.tsx: this
          file now shows instead of that one on a cold navigation straight
          into /members/events, before MembersBottomBar has rendered, which
          is when Safari's white-bar bug appears. */}
      <div
        aria-hidden
        className="fixed inset-x-0 bottom-0 z-20 h-[max(1rem,env(safe-area-inset-bottom))] bg-background md:hidden"
      />
    </>
  );
}
