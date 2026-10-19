import { cn } from "@/lib/utils";

import { SERIF_ACCENT_CLASS } from "./ui";

// Numbered steps on a 1.5px rule each: rows on mobile, side-by-side
// columns from md. The homepage's Open Invite steps and /apply's.
export function StepList({ steps, className }: { steps: string[]; className?: string }) {
  return (
    <ol
      className={cn(
        "m-0 flex list-none flex-col border-b-[1.5px] border-foreground p-0 md:grid md:grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] md:gap-x-8 md:gap-y-5 md:border-b-0",
        className,
      )}
    >
      {steps.map((step, index) => (
        <li
          key={step}
          className="flex items-baseline gap-3.5 border-t-[1.5px] border-foreground py-3 md:flex-col md:items-start md:gap-1.5 md:pt-3.5 md:pb-0"
        >
          <span className={cn("min-w-3.5 text-2xl leading-none md:text-[26px]", SERIF_ACCENT_CLASS)}>
            {index + 1}
          </span>
          <span className="text-base font-bold">{step}</span>
        </li>
      ))}
    </ol>
  );
}
