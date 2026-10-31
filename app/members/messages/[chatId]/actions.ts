"use server";

// One thread's server actions: the thread again (the page polls this every few seconds while it is open), send,
// mark read, mute, leave, and the safety note. The rules are lib/server/chats.ts's: membership of the chat, an
// open chat, 500 characters, no links (link-check.ts, on the server), 20 a minute, a clientId so a retry never
// double posts, and blocks.

import { revalidatePath } from "next/cache";

import type { ChatThread } from "@/lib/members/messages/types";
import { requireFlag } from "@/lib/members/flags";
import {
  getThread as loadThread,
  leaveChat as leave,
  markChatRead as markRead,
  markSafetyNoteSeen as markSafety,
  sendChatMessage,
  setChatMuted as setMuted,
  type LeaveChatResult,
  type SendMessageResult,
} from "@/lib/server/chats";
import type { SessionEnded } from "@/components/members/session-ended";
import { asMember, type Failed } from "../../action-kit";

/**
 * The thread as it is now, or null when it is not the member's (or not found). Polling: call it again every few
 * seconds while the thread is open; `markRead` marks it read on the server's clock at the same time, and `poll`
 * says it is the open thread asking again: a member who left the chat (in another tab, or a moment ago) is not
 * put back by a poll, only by opening the chat (lib/server/chats.ts getThread).
 */
export async function getThread(
  chatId: string,
  options: { markRead?: boolean; poll?: boolean } = {},
): Promise<ChatThread | null | SessionEnded | Failed> {
  requireFlag("messages");
  return asMember("getThread", async (_m, viewer) => {
    const thread = await loadThread(viewer, chatId, new Date(), { rejoin: !options.poll });
    if (thread && options.markRead && !thread.chat.id.startsWith("ask-")) await markRead(viewer.id, thread.chat.id);
    return thread;
  });
}

/**
 * Send. `chatId` may be a question not asked yet ("ask-<plan id>", InviteViewer.askThreadId): the chat is made on
 * this first send and `chatId` in the answer is the real one (move the address there). A refusal says why
 * (`reason`) in the composer's words (`error`): empty, too_long, link, rate_limited, blocked, closed,
 * not_in_chat, not_found. Sending the same clientId again answers the message already stored.
 */
export async function sendMessage(input: { chatId: string; text: string; clientId: string }): Promise<SendMessageResult | SessionEnded | Failed> {
  requireFlag("messages");
  const result = await asMember("sendMessage", (_m, viewer) => sendChatMessage(viewer, input));
  if ("ok" in result && result.ok && input?.chatId?.startsWith("ask-")) revalidatePath("/members", "layout");
  return result;
}

/** Opening a chat reads it (no read receipts: nobody else sees this). */
export async function markChatRead(chatId: string): Promise<{ ok: boolean } | SessionEnded | Failed> {
  requireFlag("messages");
  return asMember("markChatRead", async (m) => ({ ok: await markRead(m.id, chatId) }));
}

/** "Mute notifications" in chat info: no chat email (and no push) for this chat; messages still show here. */
export async function setChatMuted(chatId: string, muted: boolean): Promise<{ ok: boolean } | SessionEnded | Failed> {
  requireFlag("messages");
  return asMember("setChatMuted", async (m) => ({ ok: await setMuted(m.id, chatId, muted) }));
}

/**
 * "Leave chat": the place in the plan stays; opening the chat from the invite puts them back. No revalidatePath
 * here: it would draw the page the member is on (this chat) again inside the answer, and drawing a chat is
 * opening it, so it would put them straight back. The screen goes to the inbox and refreshes it instead.
 */
export async function leaveChat(chatId: string): Promise<LeaveChatResult | SessionEnded | Failed> {
  requireFlag("messages");
  return asMember("leaveChat", (m) => leave(m.id, chatId));
}

/** The safety note was shown ("Got it"): once ever, then it lives in chat info (decision 5 A). */
export async function markSafetyNoteSeen(): Promise<{ ok: true } | SessionEnded | Failed> {
  requireFlag("messages");
  return asMember("markSafetyNoteSeen", async (m) => {
    await markSafety(m.id);
    return { ok: true as const };
  });
}
