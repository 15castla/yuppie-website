import "server-only";

import { notFound } from "next/navigation";

import { messagesOn } from "@/lib/members/flags";
import { detectShellMode } from "@/lib/members/shell-mode";

// Messages' door, for its pages and its server actions: a 404 when the flag is off, and in the app also while Open
// Invite is hidden there (lib/members/flags.ts messagesOn: every chat belongs to an Open Invite, and its back row,
// pins and Updates lead to Open Invite pages the app does not have yet).
export async function requireMessages(): Promise<void> {
  if (!messagesOn(await detectShellMode())) notFound();
}
