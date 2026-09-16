// Shared building blocks for this route group's loading.tsx files. None of
// these admin routes had a loading.tsx before, which meant two things: a
// navigation showed nothing until the destination's Supabase query (plus
// requireAdmin()'s own two auth round-trips) fully resolved, and — per
// Next's prefetching rules — a dynamic route with no loading.js boundary
// isn't prefetched at all, so nothing warmed up on hover either. Adding
// these gives every admin nav click instant visual feedback and enables
// prefetching, without changing how fresh the actual data is (unlike the
// member-facing events pages, admin data needs to stay live — an admin
// checking for a new application can't be looking at a 60s-old cache).
export function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-full bg-foreground/10 ${className}`} />;
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-foreground/10 bg-cream p-6 ${className}`}>
      <div className="flex flex-col gap-3">
        <SkeletonBar className="h-4 w-1/3" />
        <SkeletonBar className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export function SkeletonListPage({
  title,
  cardCount = 4,
}: {
  title: string;
  cardCount?: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <div className="flex flex-col gap-6">
        {Array.from({ length: cardCount }).map((_, i) => (
          <SkeletonCard key={i} className="h-24" />
        ))}
      </div>
    </div>
  );
}
