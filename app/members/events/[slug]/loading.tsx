export default function EventDetailLoading() {
  return (
    <>
      <main className="relative z-10 flex min-h-dvh flex-1 items-center justify-center px-4 pt-8 pb-8 sm:px-6 md:pt-28 md:pb-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
      </main>

      {/* Event detail pages hide the standard MembersBottomBar (see
          isEventDetailPath in members-nav.tsx), which is what normally
          supplies this same strip for every other members route. Without
          it here, Safari 26's toolbar finds no qualifying background-color
          element near the bottom edge during this loading state and falls
          back to a plain white bar. See the matching strip/comment in
          event-detail-view.tsx and members-nav.tsx's MembersBottomBar. */}
      <div aria-hidden className="fixed inset-x-0 bottom-0 z-20 h-4 bg-background md:hidden" />
    </>
  );
}
