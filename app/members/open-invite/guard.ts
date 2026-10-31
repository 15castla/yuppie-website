import "server-only";

import { notFound } from "next/navigation";

import type { ShellMode } from "@/components/members/shell/types";
import { flags, openInviteOn } from "@/lib/members/flags";
import { detectShellMode } from "@/lib/members/shell-mode";
import { paidPlansLive } from "@/lib/server/config";

// Open Invite's door, for its pages and its server actions: a 404 when the flag is off, and in the app also when
// the app's own switch is off (Open Invite decision 6: hidden in the app until the feed is busier).
export async function requireOpenInvite(): Promise<ShellMode> {
  if (!flags.openInvite) notFound();
  const mode = await detectShellMode();
  if (!openInviteOn(mode)) notFound();
  return mode;
}

/**
 * Paid plans show only when the public flag AND the server-only switch MEMBERS_PAID_PLANS_LIVE=on (never in
 * stage 2): with the flag on alone, the post form offers free plans only and no paid plan page appears.
 */
export function paidPlansShown(): boolean {
  return flags.paidPlans && paidPlansLive();
}
