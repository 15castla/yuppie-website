export default function MembersLoading() {
  return (
    <>
      <main className="relative z-10 flex min-h-dvh flex-1 items-center justify-center px-4 pt-8 pb-8 sm:px-6 md:pt-28 md:pb-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
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
