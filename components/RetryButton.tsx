"use client";

import { useState } from "react";

// "Try again" for the error screens (app/error.tsx, app/members/error.tsx).
// Calls the error boundary's retry(), which re-fetches and re-renders the
// failed segment. It shows "Trying…" and can't be pressed again from the
// click until either the page recovers (this unmounts) or the retry fails
// with a fresh error, which arrives as a new `error` object and so ends
// the pending state without an effect. Same ink pill as "Book my spot".
export function RetryButton({ error, retry }: { error: Error; retry: () => void }) {
  const [retriedError, setRetriedError] = useState<Error | null>(null);
  const retrying = retriedError === error;

  return (
    <button
      type="button"
      disabled={retrying}
      aria-busy={retrying || undefined}
      onClick={() => {
        setRetriedError(error);
        retry();
      }}
      className="inline-grid shrink-0 whitespace-nowrap rounded-full bg-foreground px-8 py-3.5 text-sm font-bold text-background transition-transform duration-200 ease-out hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
    >
      {/* Both labels in one grid cell so the pill doesn't resize. */}
      <span className={retrying ? "invisible [grid-area:1/1]" : "[grid-area:1/1]"}>Try again</span>
      <span className={retrying ? "[grid-area:1/1]" : "invisible [grid-area:1/1]"}>Trying…</span>
    </button>
  );
}
