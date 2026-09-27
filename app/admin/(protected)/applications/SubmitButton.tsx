"use client";

import { useFormStatus } from "react-dom";

// useFormStatus only reports pending state for the <form> it's rendered
// inside, and only works in a client component, which is why this
// wraps just the button rather than the page itself needing to be a
// client component. Same spinner style as AdminSpinner.tsx, scaled down
// to fit inline and using currentColor for the border so it reads
// correctly on both the solid Approve button and the outlined Reject
// button without needing a color prop.
export function SubmitButton({
  pendingLabel,
  className,
  children,
}: {
  pendingLabel: string;
  className: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
          {pendingLabel}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
