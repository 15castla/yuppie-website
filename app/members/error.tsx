"use client";

// What members see when a members page fails to render, e.g. a Supabase
// request timing out on a bad connection. Renders inside the members
// layout, so the shell (header, tab bar and its bottom tint strip) stays
// around it. redirect() and notFound() never land here: Next's error
// boundary rethrows them to the boundaries that handle them. No entrance
// animation, like every members page.
//
// Drawn from the kit (title block, buttons) like every other members page. The
// words are the members area's own error voice ("Couldn’t load ...", "Check your
// connection and try again.", as the Messages inbox says them), and the retry
// keeps its "Trying…" state: the button stays pressed until the page recovers
// (this unmounts) or the retry fails with a fresh `error`, which ends the state
// without an effect.

import { useEffect, useState } from "react";

import { Button, Main, Serif, TitleBlock } from "@/components/members/kit";
import { landingLabel, landingPath } from "@/lib/members/routes";

export default function MembersError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const [retriedError, setRetriedError] = useState<Error | null>(null);
  const retrying = retriedError === error;

  useEffect(() => {
    // Shows in the browser console and, via the digest, matches the
    // server-side entry in Vercel's logs.
    console.error("Members page error:", error, error.digest ? `(digest ${error.digest})` : "");
  }, [error]);

  return (
    <Main>
      <TitleBlock
        title={
          <>
            Couldn’t load{" "}
            <span className="mk-nb">
              <Serif>this page.</Serif>
            </span>
          </>
        }
        lead="Check your connection and try again."
      />
      <div className="mk-wrap">
        <div className="mk-empty-act">
          <Button
            blockPhone
            pending={retrying}
            onClick={() => {
              if (retrying) return;
              setRetriedError(error);
              retry();
            }}
          >
            {/* Both labels share one grid cell, so the pill does not resize. */}
            <span style={{ display: "inline-grid" }}>
              <span style={{ gridArea: "1 / 1", visibility: retrying ? "hidden" : "visible" }}>Try again</span>
              <span style={{ gridArea: "1 / 1", visibility: retrying ? "visible" : "hidden" }}>Trying…</span>
            </span>
          </Button>
          <Button variant="quiet" href={landingPath()}>
            Back to {landingLabel()}
          </Button>
        </div>
      </div>
    </Main>
  );
}
