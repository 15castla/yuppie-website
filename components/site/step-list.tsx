import { cn } from "@/lib/utils";

import { CheckIcon } from "./icons";
import { SERIF_ACCENT_CLASS } from "./ui";

// Progress through the steps, when a caller passes `current` (0-based):
// the steps before it are done (label, then a check), the step at it is
// current (a 3px rule instead of 1.5px, with 1.5px less padding so the
// numeral does not move, and aria-current="step"), the steps after it are
// next (muted text; the rule stays ink, RULE-06). Without `current` every
// step is plain, exactly as before: the homepage's Open Invite and the
// apply form's steps. /apply's sent view passes current={1}.
type StepState = "plain" | "done" | "current" | "next";

function stepState(index: number, current: number | undefined): StepState {
  if (current === undefined) return "plain";
  if (index < current) return "done";
  if (index === current) return "current";
  return "next";
}

// The check after a done step's label, on the label's first line: the
// wrapper's top margin centres the 16px icon in the line box (20.8px for
// StepList's 16px/1.3 progress label, 18.75px for StepRow's 15px/1.25).
function DoneCheck({ className }: { className: string }) {
  return (
    <span className={cn("flex", className)}>
      <CheckIcon />
    </span>
  );
}

// Numbered steps on a 1.5px rule each: rows on mobile, three columns from
// md. Both callers show three steps (the homepage's Open Invite and
// /apply's), so the steps never wrap 2 + 1.
export function StepList({
  steps,
  current,
  className,
}: {
  steps: string[];
  current?: number;
  className?: string;
}) {
  return (
    <ol
      className={cn(
        "m-0 flex list-none flex-col border-b-[1.5px] border-foreground p-0 md:grid md:grid-cols-3 md:gap-x-8 md:gap-y-5 md:border-b-0",
        className,
      )}
    >
      {steps.map((step, index) => {
        const state = stepState(index, current);
        return (
          <li
            key={step}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "flex items-baseline gap-3.5 border-foreground md:flex-col md:items-start md:gap-1.5 md:pb-0",
              state === "current" ? "border-t-[3px] pt-[10.5px] pb-3 md:pt-[12.5px]" : "border-t-[1.5px] py-3 md:pt-3.5",
              state === "next" && "text-site-muted",
            )}
          >
            <span className={cn("min-w-3.5 text-2xl leading-none md:text-[26px]", SERIF_ACCENT_CLASS)}>
              {index + 1}
            </span>
            {/* As progress, the labels are set at 1.3 (as approved, spec
                D3.1), so a two-line label stays close under its numeral. */}
            <span
              className={cn(
                "text-base font-bold",
                state !== "plain" && "leading-[1.3]",
                state === "done" && "inline-flex items-start gap-1",
              )}
            >
              {step}
              {state === "done" && <DoneCheck className="mt-0.5" />}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// Phones only: the same kind of numbered steps as one row of three
// (mobile boards). Each has a 1.5px top rule, a 30px serif numeral and a
// 15px label. The homepage's Open Invite steps and /apply's, each shown
// in place of StepList below md.
export function StepRow({
  steps,
  current,
  className,
}: {
  steps: string[];
  current?: number;
  className?: string;
}) {
  return (
    <ol className={cn("m-0 grid list-none grid-cols-3 gap-3.5 p-0", className)}>
      {steps.map((step, index) => {
        const state = stepState(index, current);
        return (
          <li
            key={step}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "border-foreground",
              state === "current" ? "border-t-[3px] pt-[8.5px]" : "border-t-[1.5px] pt-2.5",
              state === "next" && "text-site-muted",
            )}
          >
            <span className={cn("mb-1.5 block text-[30px] leading-none", SERIF_ACCENT_CLASS)}>{index + 1}</span>
            <span
              className={cn(
                "text-[15px] font-bold leading-[1.25]",
                state === "done" ? "flex items-start gap-1" : "block",
              )}
            >
              {step}
              {state === "done" && <DoneCheck className="mt-px" />}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
