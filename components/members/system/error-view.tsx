"use client";

// "That didn’t load." (r2b section 2, decision B-D11 A). Says what happened in four words, what to do, and
// lets the member leave. The reference is the error's digest: the same number is in the server's log
// (instrumentation.ts), so a member can quote it and the club can find the error. An error thrown in the
// browser has no digest and nothing on the server to find, so it shows no reference.
//
// Try again keeps its size and stays the full ink pill; only the label changes to "Trying…" (no fade, no
// spinner). It stays "Trying…" until the page recovers (this unmounts) or the retry fails with a new error.

import { useState, type ReactNode } from "react";

import { Button } from "@/components/members/kit";
import { CONTACT_EMAIL } from "@/components/site/links";
import { SystemHelp, SystemScreen } from "./system-screen";

export function TryAgainLabel({ trying }: { trying: boolean }) {
  return (
    <span className="sy-try">
      <span aria-hidden={trying || undefined}>Try again</span>
      <span aria-hidden={!trying || undefined}>Trying…</span>
    </span>
  );
}

export function ErrorView({
  variant,
  error,
  retry,
  reference,
  back,
  titleActions = null,
  initialTrying = false,
}: {
  variant: "members" | "public";
  /** The error being shown: a retry that fails hands over a new one, which ends "Trying…". */
  error: unknown;
  retry: () => void;
  /** error.digest. */
  reference: string | null;
  /** Where the quiet link goes: the landing page ("Back to Events") or the home page ("Back to home"). */
  back: { href: string; label: string };
  titleActions?: ReactNode | null;
  /** Preview only: draw the Trying… state. */
  initialTrying?: boolean;
}) {
  const [retried, setRetried] = useState<unknown>(initialTrying ? error : null);
  const trying = retried === error;
  return (
    <SystemScreen
      title="That didn’t"
      accent="load."
      lead="Check your connection and try again."
      floor={variant === "members" ? "dock" : "own"}
      art="phone"
      titleActions={titleActions}
      actions={
        <>
          <Button
            blockPhone
            pending={trying}
            className={trying ? "sy-trying" : undefined}
            onClick={() => {
              if (trying) return;
              setRetried(error);
              retry();
            }}
          >
            <TryAgainLabel trying={trying} />
          </Button>
          <Button variant="quiet" href={back.href}>
            {back.label}
          </Button>
        </>
      }
      help={<SystemHelp lead="Still stuck? Email" email={CONTACT_EMAIL} reference={reference} />}
    />
  );
}
