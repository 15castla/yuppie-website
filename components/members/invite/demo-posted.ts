"use client";

// LOCAL DEMO STATE. With no backend, "Post Open Invite" cannot save a plan, so
// the plan the member just posted is kept in this browser tab's
// sessionStorage for the "Posted." page to show, and nothing else. With a
// backend, the post becomes a server action that returns the new plan's id and
// the "Posted." page loads the plan by that id; this file then goes.

import { useMemo, useSyncExternalStore } from "react";

import type { OpenInvite } from "@/lib/members/invite/types";

const KEY = "yuppie-demo-posted-invite";

/** The example adapter has no write, so a posted plan links to the example plan of the same kind. */
export const DEMO_POSTED_ID = "climbing-pint";
export const DEMO_POSTED_PAID_ID = "polo-match";

export function savePosted(invite: OpenInvite): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(invite));
  } catch {
    // Private windows can refuse storage: the page then sends the member back to the form.
  }
}

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function subscribe(): () => void {
  return () => {};
}

/** The plan just posted, null when there is none, undefined while the page is still on the server. */
export function usePosted(): OpenInvite | null | undefined {
  const raw = useSyncExternalStore(subscribe, read, () => undefined);
  return useMemo(() => {
    if (raw === undefined) return undefined;
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as OpenInvite;
    } catch {
      return null;
    }
  }, [raw]);
}
