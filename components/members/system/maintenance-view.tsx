"use client";

// "Back in a moment." (r2b section 6). The page the members area shows while the club deploys something
// big (MAINTENANCE_MODE=on; see proxy.ts). No tab bar and no links: nothing to click into while the site
// is being changed. Try again reloads the page the member asked for. The time line is optional
// (MAINTENANCE_UNTIL, "14:00"); without it the line is left out, as r2b allows.

import { useState } from "react";

import { Button } from "@/components/members/kit";
import type { ShellMode } from "@/components/members/shell/types";
import { TryAgainLabel } from "./error-view";
import { SystemScreen } from "./system-screen";

export function MaintenanceView({ mode, until, initialTrying = false }: { mode: ShellMode; until: string | null; initialTrying?: boolean }) {
  const [trying, setTrying] = useState(initialTrying);
  return (
    <SystemScreen
      title="Back in a"
      accent="moment."
      lead="We’re making a quick update. Try again in a few minutes."
      floor="own"
      art="trainer"
      wordmarkInHead={mode === "app"}
      actions={
        <Button
          blockPhone
          pending={trying}
          className={trying ? "sy-trying" : undefined}
          onClick={() => {
            if (trying) return;
            setTrying(true);
            window.location.reload();
          }}
        >
          <TryAgainLabel trying={trying} />
        </Button>
      }
      help={until ? <p className="sy-help">We expect to be back by {until}.</p> : null}
    />
  );
}
