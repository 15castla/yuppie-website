// Mirrors event-detail-view.tsx's actual layout (same wrapper classes,
// same block sizes/positions) so nothing shifts when real content swaps
// in — a placeholder for the hero image, bars where the title/meta rows
// go, and an empty pill where the price/RSVP bar goes, instead of a blank
// page with just a spinner.
function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-full bg-background-muted ${className}`} />;
}

export default function EventDetailLoading() {
  return (
    <>
      <main className="relative z-10 flex flex-1 flex-col px-4 pt-8 pb-[150px] sm:px-6 md:pt-28 md:pb-16">
        <div className="relative h-[220px] w-full overflow-hidden rounded-2xl border border-foreground/10 bg-background-muted md:mx-auto md:h-[320px] md:max-w-3xl md:mt-6">
          <div className="absolute left-4 top-4 h-9 w-9 rounded-full bg-cream shadow-[0_8px_20px_-8px_rgba(27,21,18,0.5)]" />
          <div className="absolute right-4 top-4 h-[52px] w-[52px] rounded-2xl bg-cream shadow-[0_8px_20px_-8px_rgba(27,21,18,0.5)]" />
        </div>

        <div className="relative mx-auto -mt-4 flex w-full max-w-2xl flex-col gap-6 md:max-w-3xl">
          <SkeletonBlock className="h-[26px] w-24" />

          <div className="flex flex-col gap-2">
            <SkeletonBlock className="h-6 w-3/4 rounded-lg" />
            <SkeletonBlock className="h-6 w-1/2 rounded-lg" />
          </div>

          <div className="flex flex-col gap-4">
            {["h-5 w-48", "h-5 w-40", "h-5 w-32"].map((size, i) => (
              <div key={i} className="flex items-center gap-3">
                <SkeletonBlock className="h-5 w-5 shrink-0" />
                <SkeletonBlock className={`${size} rounded-md`} />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <SkeletonBlock className="h-4 w-full rounded-md" />
            <SkeletonBlock className="h-4 w-5/6 rounded-md" />
            <SkeletonBlock className="h-4 w-2/3 rounded-md" />
          </div>

          <div className="rounded-2xl border border-foreground/10 bg-background-muted/60 p-5">
            <SkeletonBlock className="h-4 w-32 rounded-md" />
            <div className="mt-3 flex flex-col gap-2">
              <SkeletonBlock className="h-4 w-full rounded-md" />
              <SkeletonBlock className="h-4 w-4/5 rounded-md" />
            </div>
          </div>
        </div>
      </main>

      <div
        aria-hidden
        className="fixed left-3.5 right-3.5 bottom-[max(0.875rem,env(safe-area-inset-bottom))] z-20 h-16 rounded-[26px] bg-cream shadow-[0_10px_20px_-12px_rgba(27,21,18,0.18)] md:hidden"
      />
    </>
  );
}
