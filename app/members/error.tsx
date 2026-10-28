"use client";

// What members see when a members page fails to render (r2b section 2): "That didn’t load.", Try again,
// Back to the landing page, and the reference (B-D11 A: the error's digest, which instrumentation.ts logs on
// the server next to the error). Renders inside the members layout, so the shell stays around it (no tab is
// lit); on a page that draws its own docked bar the tab bar is put back. redirect() and notFound() never
// land here: Next's error boundary rethrows them to the boundaries that handle them.

import { useEffect } from "react";

import { TopActions } from "@/components/members/shell/top-actions";
import { ErrorView } from "@/components/members/system/error-view";
import { OwnDockTabs } from "@/components/members/system/own-dock-tabs";
import { landingLabel, landingPath } from "@/lib/members/routes";

export default function MembersError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // The browser's console; the server logged the same digest when it caught the error.
    console.error("Members page error:", error, error.digest ? `(reference ${error.digest})` : "");
  }, [error]);

  return (
    <>
      <ErrorView
        variant="members"
        error={error}
        retry={retry}
        reference={error.digest ?? null}
        back={{ href: landingPath(), label: `Back to ${landingLabel()}` }}
        titleActions={<TopActions />}
      />
      <OwnDockTabs />
    </>
  );
}
