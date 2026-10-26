// EXAMPLE DATA: invented people and places, never shown to real members (flag off, 404 in production)
//
// The summaries on You's Settings rows (Notifications, Payments, Blocked
// members), standing in for the real notification channels, Get paid status
// and blocked list until those areas have a backend. Returns the types in
// lib/members/you/types.ts.

import type { ShellMode } from "@/components/members/shell/types";
import type { SettingsSummaries } from "@/lib/members/you/types";

export function exampleSettingsSummaries(mode: ShellMode): SettingsSummaries {
  return {
    // The web has no push, so the row says "Email" there and never promises what the web cannot do.
    notifications: { summary: mode === "app" ? "Push, email" : "Email" },
    payments: { lines: ["Get paid: not set up"] },
    blocked: 0,
  };
}
