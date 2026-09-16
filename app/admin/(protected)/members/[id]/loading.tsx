import { SkeletonBar } from "../../skeleton";

export default function MemberDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonBar className="h-4 w-32" />

      <div className="flex items-center gap-4">
        <div className="h-14 w-14 animate-pulse rounded-full bg-foreground/10" />
        <SkeletonBar className="h-8 w-56" />
      </div>

      <div className="rounded-2xl border border-foreground/10 bg-cream p-6 sm:p-8">
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <SkeletonBar className="h-2.5 w-20" />
              <SkeletonBar className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
