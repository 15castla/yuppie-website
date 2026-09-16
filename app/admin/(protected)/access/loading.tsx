import { SkeletonBar, SkeletonCard } from "../skeleton";

export default function AccessLoading() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Access</h1>

      <div className="rounded-2xl border border-foreground/10 bg-cream p-6">
        <SkeletonBar className="h-4 w-56" />
        <SkeletonBar className="mt-3 h-9 w-full sm:w-80" />
      </div>

      <div className="flex flex-col gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="h-24" />
        ))}
      </div>
    </div>
  );
}
