"use server";

// Messages' server actions for the inbox (Chats | Updates), the messages icon's number, and block and report
// (from chat info, the report sheets and You > Blocked members). They return the shapes in
// lib/members/messages/types.ts, so the screens swap their stand-ins (lib/members/mock/messages.ts,
// components/members/messages/read-state.ts) for these. Polling, not sockets: the inbox and the icon refresh on
// navigation and on a slow timer by calling these again; the thread's own actions are in [chatId]/actions.ts.

import { revalidatePath } from "next/cache";

import type { BlockAction, Chat, ReportDraft, UnreadCounts, UpdateItem } from "@/lib/members/messages/types";
import { requireFlag } from "@/lib/members/flags";
import { blockMember as block, unblockMember as unblock, type BlockResult } from "@/lib/server/blocks";
import { listChats, unreadCounts } from "@/lib/server/chats";
import { createReport, type CreateReportResult } from "@/lib/server/reports";
import { listUpdates, markAllUpdatesRead as markAll, markUpdateRead as markOne } from "@/lib/server/updates";
import type { SessionEnded } from "@/components/members/session-ended";
import { asMember, type Failed } from "../action-kit";

const fresh = () => revalidatePath("/members", "layout");

export async function getChats(): Promise<Chat[] | SessionEnded | Failed> {
  requireFlag("messages");
  return asMember("getChats", (m) => listChats(m.id));
}

export async function getUpdates(): Promise<UpdateItem[] | SessionEnded | Failed> {
  requireFlag("messages");
  return asMember("getUpdates", (m) => listUpdates(m.id));
}

/** Unread chats and unread updates (the tab numbers). The icon's number is their sum, "9+" over 9. */
export async function getUnreadCounts(): Promise<UnreadCounts | SessionEnded | Failed> {
  requireFlag("messages");
  return asMember("getUnreadCounts", (m) => unreadCounts(m.id));
}

/** Opening an update reads it. */
export async function markUpdateRead(updateId: string): Promise<{ ok: true; changed: boolean } | SessionEnded | Failed> {
  requireFlag("messages");
  return asMember("markUpdateRead", async (m) => ({ ok: true as const, changed: await markOne(m.id, updateId) }));
}

/** "Mark all as read". */
export async function markAllUpdatesRead(): Promise<{ ok: true; count: number } | SessionEnded | Failed> {
  requireFlag("messages");
  return asMember("markAllUpdatesRead", async (m) => ({ ok: true as const, count: await markAll(m.id) }));
}

/**
 * "Block {name}" (chat info, report sent, a question): they can't message you or ask you questions, you won't
 * see their messages even in a plan chat you share, and they aren't told. `chatId` is where it was done (kept
 * for the screen; the block covers everywhere).
 */
export async function blockMember(action: BlockAction): Promise<BlockResult | SessionEnded | Failed> {
  requireFlag("messages");
  const result = await asMember("blockMember", (m) => block(m.id, action?.memberId));
  if ("ok" in result && result.ok) fresh();
  return result;
}

/** "Unblock" (You > Blocked members). */
export async function unblockMember(memberId: string): Promise<BlockResult | SessionEnded | Failed> {
  requireFlag("messages");
  const result = await asMember("unblockMember", (m) => unblock(m.id, memberId));
  if ("ok" in result && result.ok) fresh();
  return result;
}

/**
 * Report a message, a member or a photo (lib/members/messages/report-reasons.ts reasons by id), or a plan. The
 * member must be able to see what they report (in the chat; the plan visible to them). Every new report emails
 * the club; a repeat while the first is open is the same report (`duplicate: true`, no second email).
 */
export async function sendReport(draft: ReportDraft): Promise<CreateReportResult | SessionEnded | Failed> {
  requireFlag("messages");
  return asMember("sendReport", (_m, viewer) => createReport(viewer, draft));
}
