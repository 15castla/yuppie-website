export default function EventDetailLoading() {
  return (
    <>
      {/* The event page's plain-background loading state, same as
          app/members/loading.tsx: an empty <main> (with the event page's
          own main classes) until the event arrives. Kept as its own
          boundary so going from the events list to an event shows this
          rather than leaving the list on screen. The iOS app's splash
          (mobile/ios/App/App/SceneDelegate.swift) hides once a <main>
          exists and no "animate-spin" element is present, so it hides onto
          this plain yellow, the same colour as the splash. */}
      <main
        className="relative z-10 flex flex-1 flex-col px-4 pt-[calc(2rem+var(--safe-top))] pb-[150px] sm:px-6 md:flex-none md:pt-28 md:pb-16"
        aria-busy="true"
      >
        <span className="sr-only">Loading</span>
      </main>

      {/* Event detail pages hide the standard MembersBottomBar (see
          isEventDetailPath in members-nav.tsx), which is what normally
          supplies this same strip for every other members route. Without
          it here, Safari 26's toolbar finds no qualifying background-color
          element near the bottom edge during this loading state and falls
          back to a plain white bar. Height matches the real safe area (not
          a flat 16px), see the matching comment in members-nav.tsx's
          MembersBottomBar. */}
      <div
        aria-hidden
        className="fixed inset-x-0 bottom-0 z-20 h-[max(1rem,env(safe-area-inset-bottom))] bg-background md:hidden"
      />
    </>
  );
}
