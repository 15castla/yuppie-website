import { MEMBERS_MAIN_CLASS } from "@/components/members/ui";
import { cn } from "@/lib/utils";

const BLOCK = "rounded-lg bg-foreground/[0.06]";

// One placeholder card of agenda rows: date column, two text lines and the
// 88x50 thumbnail, with the same 66px inset dividers as EventRowList.
function RowsPlaceholder({ rows }: { rows: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-foreground/10">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index}>
          {index > 0 && <div className="ml-[66px] h-px bg-foreground/[0.08]" />}
          <div className="flex items-center gap-3.5 py-3.5 pl-3 pr-3.5">
            <div className="flex w-10 shrink-0 flex-col items-center gap-1.5">
              <div className={cn(BLOCK, "h-2.5 w-7")} />
              <div className={cn(BLOCK, "h-5 w-6")} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className={cn(BLOCK, "h-4 w-3/4")} />
              <div className={cn(BLOCK, "h-3 w-1/2")} />
            </div>
            <div className={cn(BLOCK, "h-[50px] w-[88px] shrink-0 rounded-[10px]")} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function EventsLoading() {
  return (
    <>
      {/* Shaped like the events list: header, filter pills and two month
          groups of rows. animate-pulse rather than animate-spin; see
          app/members/loading.tsx. */}
      <main className={MEMBERS_MAIN_CLASS} aria-busy="true">
        <span className="sr-only">Loading</span>
        <div className="mx-auto flex w-full max-w-3xl animate-pulse flex-col gap-6" aria-hidden>
          <div className="flex flex-col gap-3">
            <div className={cn(BLOCK, "h-2.5 w-24")} />
            <div className={cn(BLOCK, "h-8 w-32")} />
          </div>
          <div className="flex gap-2 overflow-hidden">
            {["w-12", "w-24", "w-20", "w-16", "w-28"].map((width) => (
              <div key={width} className={cn(BLOCK, "h-8 shrink-0 rounded-full", width)} />
            ))}
          </div>
          {[2, 3].map((rows) => (
            <div key={rows} className="flex flex-col gap-2.5">
              <div className="flex justify-between px-1">
                <div className={cn(BLOCK, "h-2.5 w-20")} />
                <div className={cn(BLOCK, "h-2.5 w-12")} />
              </div>
              <RowsPlaceholder rows={rows} />
            </div>
          ))}
        </div>
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
