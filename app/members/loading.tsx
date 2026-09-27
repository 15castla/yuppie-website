export default function MembersLoading() {
  return (
    <>
      <main className="relative z-10 flex min-h-dvh flex-1 items-center justify-center px-4 pt-8 pb-8 sm:px-6 md:pt-28 md:pb-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
      </main>

      {/* Defensive only: MembersBottomBar (in app/members/layout.tsx,
          rendered as a sibling of {children} rather than inside it) already
          carries this same strip and stays mounted while this fallback
          shows, in the normal case of navigating between /members/* pages.
          This only matters for the narrow window on a cold navigation into
          the members area where the layout's own requireMember() hasn't
          resolved yet and nothing, including MembersBottomBar, has rendered.
          See the matching strip/comment in members-nav.tsx's
          MembersBottomBar and app/members/events/[slug]/loading.tsx. */}
      <div aria-hidden className="fixed inset-x-0 bottom-0 z-20 h-4 bg-background md:hidden" />
    </>
  );
}
