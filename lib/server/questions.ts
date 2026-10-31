import "server-only";

// Questions to the host (a question chat per plan and asker). What the plan page needs about them: for the host,
// who asked what and how much is unread; for a guest, where "Ask {name}" goes and the host's last reply. The
// chat itself is made on the first send (open_question, through lib/server/chats.ts), so before that a guest's
// "Ask" thread is the placeholder id ASK_PREFIX + plan id, which the Messages pages understand.

import type { InviteQuestion } from "@/lib/members/invite/types";
import { serviceDb } from "./db";
import type { PersonRef } from "./people";

/** "ask-<plan id>": a question thread that does not exist yet (types: askThreadId "exists as an id before the first message"). */
export const ASK_PREFIX = "ask-";
export const askPlaceholder = (planId: string) => `${ASK_PREFIX}${planId}`;
export const planIdFromAsk = (chatId: string) => (chatId.startsWith(ASK_PREFIX) ? chatId.slice(ASK_PREFIX.length) : null);

export type QuestionChatRow = { id: string; plan_id: string; asker_id: string; last_message_at: string | null; created_at: string };

type MessageRow = { id: string; chat_id: string; sender_id: string | null; body: string | null; created_at: string };

/** The latest text message per chat from a given sender (or from anyone but `notFrom`), visible (not removed). */
export async function latestTexts(chatIds: string[], pick: (row: MessageRow) => boolean): Promise<Map<string, MessageRow>> {
  const out = new Map<string, MessageRow>();
  if (!chatIds.length) return out;
  const { data } = await serviceDb()
    .from("messages")
    .select("id, chat_id, sender_id, body, created_at")
    .in("chat_id", chatIds)
    .eq("kind", "text")
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(Math.max(50, chatIds.length * 20));
  for (const row of (data ?? []) as MessageRow[]) {
    if (!out.has(row.chat_id) && pick(row)) out.set(row.chat_id, row);
  }
  return out;
}

/**
 * The host's questions on each plan, newest first: from whom, their latest question, unread for the host.
 * Questions from members the host blocked are left out (they cannot ask, and the host does not see them).
 */
export async function hostQuestions(
  planIds: string[],
  unread: Map<string, number>,
  refs: Map<string, PersonRef>,
  blocked: Set<string>,
): Promise<Map<string, InviteQuestion[]>> {
  const out = new Map<string, InviteQuestion[]>();
  if (!planIds.length) return out;
  const { data } = await serviceDb()
    .from("chats")
    .select("id, plan_id, asker_id, last_message_at, created_at")
    .in("plan_id", planIds)
    .eq("kind", "question");
  const chats = ((data ?? []) as QuestionChatRow[]).filter((c) => !blocked.has(c.asker_id));
  const askerOf = new Map(chats.map((c) => [c.id, c.asker_id]));
  // The asker's own latest question (the newest message overall may be the host's reply).
  const fromAsker = await latestTexts(
    chats.map((c) => c.id),
    (row) => row.sender_id === askerOf.get(row.chat_id),
  );
  for (const chat of chats.sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at))) {
    const question = fromAsker.get(chat.id);
    if (!question) continue; // opened but nothing asked yet
    const from = refs.get(chat.asker_id);
    if (!from) continue;
    const list = out.get(chat.plan_id) ?? [];
    list.push({ threadId: chat.id, from, text: question.body ?? "", unread: unread.get(chat.id) ?? 0 });
    out.set(chat.plan_id, list);
  }
  return out;
}

/** A guest's question chat on each plan (if they asked), and the host's latest reply in it. */
export async function guestQuestions(memberId: string, plans: { id: string; host_id: string }[]): Promise<Map<string, { chatId: string; hostReply: string | null }>> {
  const out = new Map<string, { chatId: string; hostReply: string | null }>();
  if (!plans.length) return out;
  const { data } = await serviceDb()
    .from("chats")
    .select("id, plan_id, asker_id, last_message_at, created_at")
    .in("plan_id", plans.map((p) => p.id))
    .eq("kind", "question")
    .eq("asker_id", memberId);
  const chats = (data ?? []) as QuestionChatRow[];
  const hostOf = new Map(plans.map((p) => [p.id, p.host_id]));
  const planOf = new Map(chats.map((c) => [c.id, c.plan_id]));
  const replies = await latestTexts(
    chats.map((c) => c.id),
    (row) => row.sender_id === hostOf.get(planOf.get(row.chat_id) ?? ""),
  );
  for (const chat of chats) out.set(chat.plan_id, { chatId: chat.id, hostReply: replies.get(chat.id)?.body ?? null });
  return out;
}

/** Collect the asker ids of the plans' question chats (so the caller can fetch their names and photos in one go). */
export async function questionAskers(planIds: string[]): Promise<string[]> {
  if (!planIds.length) return [];
  const { data } = await serviceDb().from("chats").select("asker_id").in("plan_id", planIds).eq("kind", "question");
  return (data ?? []).map((r: { asker_id: string }) => r.asker_id);
}
