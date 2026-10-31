"use server";

// You > Blocked members: the list, and Unblock (the block itself is made in a chat: app/members/messages/actions.ts
// blockMember). Unblocking gives them back the chats and questions blocking took away.

import { revalidatePath } from "next/cache";

import type { BlockedMember } from "@/lib/members/messages/types";
import { listBlockedMembers, unblockMember as unblock, type BlockResult } from "@/lib/server/blocks";
import type { SessionEnded } from "@/components/members/session-ended";
import { asMember, type Failed } from "../../action-kit";
import { requireMessages } from "../../messages/guard";

export async function getBlockedMembers(): Promise<BlockedMember[] | SessionEnded | Failed> {
  await requireMessages();
  return asMember("getBlockedMembers", (m) => listBlockedMembers(m.id));
}

export async function unblockMember(memberId: string): Promise<BlockResult | SessionEnded | Failed> {
  await requireMessages();
  const result = await asMember("unblockMember", (m) => unblock(m.id, memberId));
  if ("ok" in result && result.ok) revalidatePath("/members", "layout");
  return result;
}
