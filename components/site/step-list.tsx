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

// Phones only: the same kind of numbered steps as one row of three
// (mobile boards). Each has a 1.5px top rule, a 30px serif numeral and a
// 15px label. The homepage's Open Invite steps and /apply's, each shown
// in place of StepList below md.
export function StepRow({ steps, className }: { steps: string[]; className?: string }) {
  return (
    <ol className={cn("m-0 grid list-none grid-cols-3 gap-3.5 p-0", className)}>
      {steps.map((step, index) => (
        <li key={step} className="border-t-[1.5px] border-foreground pt-2.5">
          <span className={cn("mb-1.5 block text-[30px] leading-none", SERIF_ACCENT_CLASS)}>{index + 1}</span>
          <span className="block text-[15px] font-bold leading-[1.25]">{step}</span>
        </li>
      ))}
    </ol>
  );
}
