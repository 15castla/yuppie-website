"use client";

// While a part of the page loads (the list beside the card, or the card), the page's own <main> is marked
// aria-busy, as the members area does (B-D6, QA2-09), and screen readers hear "Loading". Several parts can be
// loading at once: each one counts itself in and out, and the last one out clears it.

import { useLayoutEffect, useRef } from "react";

export function MainBusy() {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const main = ref.current?.closest("main");
    if (!main) return;
    const count = Number(main.dataset.loading ?? "0") + 1;
    main.dataset.loading = String(count);
    main.setAttribute("aria-busy", "true");
    return () => {
      const left = Number(main.dataset.loading ?? "1") - 1;
      if (left > 0) {
        main.dataset.loading = String(left);
        return;
      }
      delete main.dataset.loading;
      main.removeAttribute("aria-busy");
    };
  }, []);
  return (
    <span ref={ref} className="ad-sr">
      Loading
    </span>
  );
}
