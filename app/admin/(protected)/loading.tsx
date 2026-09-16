import { SkeletonBar } from "./skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Dashboard</h1>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-foreground/10 bg-cream p-6">
            <SkeletonBar className="h-3 w-2/3" />
            <SkeletonBar className="mt-3 h-9 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
