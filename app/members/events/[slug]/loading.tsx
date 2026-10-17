import { cn } from "@/lib/utils";

const BLOCK = "rounded-lg bg-foreground/[0.06]";

export default function EventDetailLoading() {
  return (
    <>
      {/* Shaped like the event page: a 16:9 hero (edge to edge from the
          top on phones, the inset rounded hero from md:), the title row
          and the details card. animate-pulse rather than animate-spin; see
          app/members/loading.tsx. */}
      <main
        className="relative z-10 flex flex-1 flex-col px-4 pt-[calc(2rem+var(--safe-top))] pb-[150px] sm:px-6 md:flex-none md:pt-28 md:pb-16 loading-reveal"
        aria-busy="true"
      >
        <span className="sr-only">Loading</span>
        <div className="flex animate-pulse flex-col" aria-hidden>
          <div className={cn(BLOCK, "-mx-4 -mt-[calc(2rem+var(--safe-top))] aspect-[16/9] rounded-none sm:-mx-6 md:mx-auto md:mt-6 md:w-full md:max-w-3xl md:rounded-2xl")} />
          <div className="mx-auto mt-6 flex w-full max-w-2xl flex-col gap-6 md:max-w-3xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-3">
                <div className={cn(BLOCK, "h-6 w-20 rounded-full")} />
                <div className={cn(BLOCK, "h-8 w-56")} />
              </div>
              <div className={cn(BLOCK, "h-14 w-14 shrink-0 rounded-2xl")} />
            </div>
            <div className={cn(BLOCK, "h-[150px] rounded-2xl")} />
          </div>
        </div>
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
