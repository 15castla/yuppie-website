"use client";

// Shown when a page outside the members area (the public site, the admin) fails to render (r2b section 2,
// public variant): "That didn’t load.", Try again, Back to home, and the reference (B-D11 A: the error's
// digest, which instrumentation.ts logs on the server). Under the public header the root layout draws. The
// members area has its own (app/members/error.tsx); a failure in the root layout itself falls through to
// app/global-error.tsx.

import { useEffect } from "react";

import { StandaloneScreen } from "@/components/members/system/standalone";
import { ErrorView } from "@/components/members/system/error-view";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Page error:", error, error.digest ? `(reference ${error.digest})` : "");
  }, [error]);

  return (
    <StandaloneScreen>
      <ErrorView variant="public" error={error} retry={retry} reference={error.digest ?? null} back={{ href: "/", label: "Back to home" }} />
    </StandaloneScreen>
  );
}
