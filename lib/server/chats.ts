import "server-only";

// Messages (specs/messages.md): the inbox (Chats), threads, sending, read state, mute, leave, the safety note and
// the number on the messages icon. Returns the shapes in lib/members/messages/types.ts for one viewer.
//
// Server rules (the brief, section 4): send only in a chat you are in and that is open; 500 characters with
// control characters stripped; no links (lib/members/messages/link-check.ts is the rule, run here on every
// message); 20 messages a minute; a client id makes a retry a no-op. Blocks: the blocker never sees the
// blocked member's messages (here and in RLS), and in a question chat neither of them can send to the other.
// Delivery is polling (the thread page asks again every few seconds); nothing here assumes it, so Supabase
// Realtime can be added later on the same tables.

import { containsLink } from "@/lib/members/messages/link-check";
import { LINK_BLOCKED_LINE } from "@/lib/members/messages/thread-copy";
import type {
  Chat,
  ChatItem,
  ChatMessage,
  ChatParticipant,
  ChatPlan,
  ChatPreview,
  ChatThread,
  UnreadCounts,
} from "@/lib/members/messages/types";
import { MESSAGE_MAX_LENGTH } from "@/lib/members/messages/types";
import { blockSets, eitherBlocked, type BlockSets } from "./blocks";
import { MESSAGE_RATE_LIMIT, THREAD_ITEM_LIMIT, UPDATES_KEEP_DAYS } from "./config";
import { serviceDb } from "./db";
import { notify } from "./notify";
import { peopleRefs, type PersonRef } from "./people";
import { cancelledBy, canSeePlan, isUuid, PLAN_COLUMNS, type PlanRow, type Viewer } from "./plans";
import { askPlaceholder, planIdFromAsk } from "./questions";

const HOUR = 3600000;

type ChatRow = { id: string; plan_id: string; kind: "plan" | "question"; asker_id: string | null; last_message_at: string | null; created_at: string };
type ChatMemberRow = { chat_id: string; member_id: string; role: "host" | "member"; left_at: string | null; left_reason: string | null; last_read_at: string | null; muted: boolean };
type MessageRow = {
  id: string;
  chat_id: string;
  kind: "text" | "system";
  sender_id: string | null;
  body: string | null;
  system_event: "opened" | "joined" | "paid" | "cancelled" | "closed" | null;
  about_member_id: string | null;
  client_id: string | null;
  removed_at: string | null;
  created_at: string;
};
const MESSAGE_COLUMNS = "id, chat_id, kind, sender_id, body, system_event, about_member_id, client_id, removed_at, created_at";
const iso = (value: string) => new Date(value).toISOString();

// ---------------------------------------------------------------------------- open or closed

/** A plan chat closes when the plan is cancelled or 24 hours after it starts; a question when the plan is cancelled or starts. */
export function chatState(kind: ChatRow["kind"], plan: Pick<PlanRow, "status" | "starts_at">, now: Date): Pick<Chat, "status" | "closedReason"> {
  if (plan.status === "cancelled") return { status: "closed", closedReason: kind === "plan" ? "host_cancelled" : "invite_closed" };
  const start = new Date(plan.starts_at).getTime();
  if (kind === "plan" && now.getTime() >= start + 24 * HOUR) return { status: "closed", closedReason: "plan_finished" };
  if (kind === "question" && now.getTime() >= start) return { status: "closed", closedReason: "invite_closed" };
  return { status: "open", closedReason: null };
}

function chatPlanStatus(plan: Pick<PlanRow, "status" | "starts_at">, now: Date): ChatPlan["status"] {
  if (plan.status === "cancelled") return "cancelled";
  return now.getTime() >= new Date(plan.starts_at).getTime() + 24 * HOUR ? "finished" : "open";
}

// ---------------------------------------------------------------------------- building chats

type Context = {
  plans: Map<string, PlanRow>;
  going: Map<string, string[]>;
  members: Map<string, ChatMemberRow[]>;
  unread: Map<string, number>;
  last: Map<string, MessageRow>;
  refs: Map<string, PersonRef>;
  sets: BlockSets;
};

async function context(viewerId: string, chats: ChatRow[], sets?: BlockSets): Promise<Context> {
  const db = serviceDb();
  const chatIds = chats.map((c) => c.id);
  const planIds = [...new Set(chats.map((c) => c.plan_id))];
  const [plansRes, goingRes, membersRes, unreadRes, lastRes, givenSets] = await Promise.all([
    planIds.length ? db.from("plans").select(PLAN_COLUMNS).in("id", planIds) : Promise.resolve({ data: [], error: null }),
    planIds.length ? db.from("plan_members").select("plan_id, member_id, joined_at").in("plan_id", planIds).eq("status", "going").order("joined_at", { ascending: true }) : Promise.resolve({ data: [], error: null }),
    chatIds.length ? db.from("chat_members").select("chat_id, member_id, role, left_at, left_reason, last_read_at, muted").in("chat_id", chatIds) : Promise.resolve({ data: [], error: null }),
    db.rpc("chat_unread", { p_member: viewerId }),
    chatIds.length
      ? db.from("messages").select(MESSAGE_COLUMNS).in("chat_id", chatIds).is("removed_at", null).order("created_at", { ascending: false }).limit(Math.max(60, chatIds.length * 15))
      : Promise.resolve({ data: [], error: null }),
    sets ? Promise.resolve(sets) : blockSets(viewerId),
  ]);
  for (const r of [plansRes, goingRes, membersRes, unreadRes, lastRes]) if (r.error) throw r.error;
  const plans = new Map(((plansRes.data ?? []) as PlanRow[]).map((p) => [p.id, p]));
  const going = new Map<string, string[]>();
  for (const g of (goingRes.data ?? []) as { plan_id: string; member_id: string }[]) going.set(g.plan_id, [...(going.get(g.plan_id) ?? []), g.member_id]);
  const members = new Map<string, ChatMemberRow[]>();
  for (const m of (membersRes.data ?? []) as ChatMemberRow[]) members.set(m.chat_id, [...(members.get(m.chat_id) ?? []), m]);
  const unread = new Map(((unreadRes.data ?? []) as { chat_id: string; unread: number }[]).map((r) => [r.chat_id, r.unread]));
  const last = new Map<string, MessageRow>();
  for (const m of (lastRes.data ?? []) as MessageRow[]) {
    if (last.has(m.chat_id)) continue;
    if (m.kind === "text" && m.sender_id && givenSets.blocked.has(m.sender_id)) continue;
    last.set(m.chat_id, m);
  }
  const people = new Set<string>();
  for (const p of plans.values()) people.add(p.host_id);
  for (const list of going.values()) list.forEach((id) => people.add(id));
  for (const list of members.values()) list.forEach((m) => people.add(m.member_id));
  for (const m of last.values()) {
    if (m.sender_id) people.add(m.sender_id);
    if (m.about_member_id) people.add(m.about_member_id);
  }
  const refs = await peopleRefs([...people]);
  return { plans, going, members, unread, last, refs, sets: givenSets };
}

const refOf = (ctx: Context, id: string | null): PersonRef => (id && ctx.refs.get(id)) || { id: id ?? "", firstName: "Member", photoUrl: null };

function chatPlan(ctx: Context, plan: PlanRow, now: Date): ChatPlan {
  const going = (ctx.going.get(plan.id) ?? []).map((id) => refOf(ctx, id));
  return {
    id: plan.id,
    title: plan.title,
    startsAt: iso(plan.starts_at),
    place: plan.place,
    host: refOf(ctx, plan.host_id),
    going,
    placesLeft: Math.max(0, plan.places - going.length),
    priceMinor: plan.price_pence,
    status: chatPlanStatus(plan, now),
    cancelledBy: cancelledBy(plan),
  };
}

/** The inbox line for a system line ("Sam is in"). The thread draws its own words from the event. */
function systemPreview(ctx: Context, m: MessageRow): string {
  const who = refOf(ctx, m.about_member_id).firstName;
  switch (m.system_event) {
    case "opened":
      return `${who} opened this chat`;
    case "joined":
      return `${who} is in`;
    case "paid":
      return `${who} paid and is in`;
    case "cancelled":
      return m.about_member_id ? `${who} cancelled this plan.` : "This plan was cancelled.";
    default:
      return "This chat closed.";
  }
}

function buildChat(ctx: Context, row: ChatRow, viewerId: string, now: Date): Chat | null {
  const plan = ctx.plans.get(row.plan_id);
  if (!plan) return null;
  const rows = ctx.members.get(row.id) ?? [];
  const mine = rows.find((m) => m.member_id === viewerId);
  const active = rows.filter((m) => !m.left_at);
  const participants: ChatParticipant[] = active.map((m) => ({
    member: refOf(ctx, m.member_id),
    role: m.role,
    isYou: m.member_id === viewerId,
    blockedByYou: ctx.sets.blocked.has(m.member_id),
  }));
  const otherId = row.kind === "question" ? (row.asker_id === viewerId ? plan.host_id : row.asker_id) : null;
  const last = ctx.last.get(row.id);
  const lastMessage: ChatPreview | null = last
    ? last.kind === "text"
      ? { senderId: last.sender_id, text: last.body ?? "", at: iso(last.created_at) }
      : { senderId: null, text: systemPreview(ctx, last), at: iso(last.created_at) }
    : null;
  // A question whose other member blocked this one (QR-05): closed, as a question is once its invite closes, before
  // they type, so the page never offers a composer whose every send says "This chat is closed". Nothing in it says
  // why (messages decision 6 A: the other isn't told), and no "This chat closed" line is dated for it (getThread).
  const blockedOut = row.kind === "question" && Boolean(otherId) && ctx.sets.blockedBy.has(otherId!);
  const natural = chatState(row.kind, plan, now);
  const state = blockedOut && natural.status === "open" ? { status: "closed" as const, closedReason: "invite_closed" as const } : natural;
  return {
    id: row.id,
    kind: row.kind,
    plan: chatPlan(ctx, plan, now),
    other: otherId ? refOf(ctx, otherId) : null,
    participants,
    ...state,
    muted: Boolean(mine?.muted),
    unreadCount: ctx.unread.get(row.id) ?? 0,
    lastMessage,
    lastActivityAt: iso(row.last_message_at ?? row.created_at),
  };
}

/** The Chats tab: every chat the member is still in, newest activity first. A question with someone they blocked is left out. */
export async function listChats(viewerId: string, now: Date = new Date()): Promise<Chat[]> {
  const db = serviceDb();
  const { data: mine, error } = await db.from("chat_members").select("chat_id").eq("member_id", viewerId).is("left_at", null);
  if (error) throw error;
  const ids = (mine ?? []).map((m) => m.chat_id as string);
  if (!ids.length) return [];
  const { data: chats, error: chatsError } = await db.from("chats").select("id, plan_id, kind, asker_id, last_message_at, created_at").in("id", ids);
  if (chatsError) throw chatsError;
  const ctx = await context(viewerId, (chats ?? []) as ChatRow[]);
  return ((chats ?? []) as ChatRow[])
    .map((row) => buildChat(ctx, row, viewerId, now))
    .filter((chat): chat is Chat => Boolean(chat))
    .filter((chat) => !(chat.kind === "question" && chat.other && ctx.sets.blocked.has(chat.other.id)))
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

// ---------------------------------------------------------------------------- one thread

async function chatRow(chatId: string): Promise<ChatRow | null> {
  if (!isUuid(chatId)) return null;
  const { data } = await serviceDb().from("chats").select("id, plan_id, kind, asker_id, last_message_at, created_at").eq("id", chatId).maybeSingle<ChatRow>();
  return data ?? null;
}

async function myQuestionChat(viewerId: string, planId: string): Promise<ChatRow | null> {
  const { data } = await serviceDb().from("chats").select("id, plan_id, kind, asker_id, last_message_at, created_at").eq("plan_id", planId).eq("kind", "question").eq("asker_id", viewerId).maybeSingle<ChatRow>();
  return data ?? null;
}

async function safetySeen(viewerId: string): Promise<boolean> {
  const { data } = await serviceDb().from("members").select("chat_safety_seen_at").eq("id", viewerId).maybeSingle();
  return Boolean(data?.chat_safety_seen_at);
}

/**
 * One chat's thread, or null (not found, or not theirs). "ask-<plan id>" is a question not asked yet: the thread
 * is empty and the first send makes the chat. A member who left a plan chat (but is still going) is put back in
 * when they open it from the invite (messages spec 3.6: "you can rejoin from the invite").
 */
export async function getThread(
  viewer: Viewer,
  chatId: string,
  now: Date = new Date(),
  options: {
    /** False for a poll of a thread already open: a member who has left is not put back by it (null instead). */
    rejoin?: boolean;
  } = {},
): Promise<ChatThread | null> {
  const db = serviceDb();
  const askPlan = planIdFromAsk(chatId);
  let row: ChatRow | null = null;
  if (askPlan) {
    if (!isUuid(askPlan)) return null;
    row = await myQuestionChat(viewer.id, askPlan);
    if (!row) return newQuestionThread(viewer, askPlan, now);
  } else {
    row = await chatRow(chatId);
  }
  if (!row) return null;

  const { data: me } = await db.from("chat_members").select("chat_id, member_id, role, left_at, left_reason, last_read_at, muted").eq("chat_id", row.id).eq("member_id", viewer.id).maybeSingle<ChatMemberRow>();
  if (!me) return null;
  if (me.left_at) {
    if (me.left_reason !== "left_chat" || options.rejoin === false) return null;
    const stillIn = row.kind === "question" || (await isHostOrGoing(row.plan_id, viewer.id));
    if (!stillIn) return null;
    await db.from("chat_members").update({ left_at: null, left_reason: null }).eq("chat_id", row.id).eq("member_id", viewer.id);
  }

  const sets = await blockSets(viewer.id);
  const { data: messages, error } = await db.from("messages").select(MESSAGE_COLUMNS).eq("chat_id", row.id).order("created_at", { ascending: false }).limit(THREAD_ITEM_LIMIT);
  if (error) throw error;
  const ctx = await context(viewer.id, [row], sets);
  const chat = buildChat(ctx, row, viewer.id, now);
  if (!chat) return null;
  if (chat.kind === "question" && chat.other && sets.blocked.has(chat.other.id)) return null;
  // Everyone a system line is about, also anyone no longer in the chat (QB1-08).
  const aboutMissing = [...new Set(((messages ?? []) as MessageRow[]).map((m) => m.about_member_id).filter((id): id is string => Boolean(id) && !ctx.refs.has(id!)))];
  if (aboutMissing.length) for (const [id, ref] of await peopleRefs(aboutMissing)) ctx.refs.set(id, ref);

  const items: ChatItem[] = [];
  let firstUnreadId: string | null = null;
  const readAt = me.last_read_at ? new Date(me.last_read_at).getTime() : -Infinity;
  for (const m of ((messages ?? []) as MessageRow[]).reverse()) {
    if (m.kind === "system") {
      // The member it is about, by name, even after they withdrew (QB1-08): they are no longer a participant.
      const member = m.about_member_id ? ctx.refs.get(m.about_member_id) ?? null : null;
      items.push({ kind: "system", id: m.id, at: iso(m.created_at), event: m.system_event ?? "closed", memberId: m.about_member_id, member });
      continue;
    }
    if (m.sender_id && sets.blocked.has(m.sender_id)) continue;
    const removed = Boolean(m.removed_at);
    items.push({
      kind: "text",
      id: m.id,
      clientId: m.client_id ?? m.id,
      chatId: m.chat_id,
      senderId: m.sender_id ?? "",
      text: removed ? "" : m.body ?? "",
      sentAt: iso(m.created_at),
      status: removed ? "removed" : "visible",
    });
    if (!firstUnreadId && !removed && m.sender_id !== viewer.id && new Date(m.created_at).getTime() > readAt) firstUnreadId = m.id;
  }
  // "This chat closed. ..." (types: ChatSystemLine "closed"): drawn at the moment it closed, for a plan chat that
  // finished or a question whose plan started. A cancelled plan has its own "cancelled" line already, and its
  // questions say why in the lock row ("Dan cancelled this plan."): never a "closed" line dated at a start that
  // will not happen.
  const plan = ctx.plans.get(row.plan_id)!;
  if (chatState(row.kind, plan, now).status === "closed" && chat.closedReason !== "host_cancelled" && chat.plan.status !== "cancelled") {
    const at = new Date(new Date(plan.starts_at).getTime() + (row.kind === "plan" ? 24 * HOUR : 0)).toISOString();
    items.push({ kind: "system", id: `closed-${row.id}`, at, event: "closed", memberId: null });
  }
  return { chat, items, firstUnreadId, safetyNoteSeen: await safetySeen(viewer.id) };
}

async function isHostOrGoing(planId: string, memberId: string): Promise<boolean> {
  const db = serviceDb();
  const [{ data: plan }, { data: place }] = await Promise.all([
    db.from("plans").select("host_id").eq("id", planId).maybeSingle(),
    db.from("plan_members").select("status").eq("plan_id", planId).eq("member_id", memberId).maybeSingle(),
  ]);
  return plan?.host_id === memberId || place?.status === "going";
}

/** A question not asked yet: an empty thread with the host, under the placeholder id. */
async function newQuestionThread(viewer: Viewer, planId: string, now: Date): Promise<ChatThread | null> {
  const { data: plan } = await serviceDb().from("plans").select(PLAN_COLUMNS).eq("id", planId).maybeSingle<PlanRow>();
  if (!plan || plan.host_id === viewer.id) return null;
  const sets = await blockSets(viewer.id);
  if (eitherBlocked(sets, plan.host_id) || !(await canSeePlan(viewer.id, plan, sets))) return null;
  const placeholder: ChatRow = { id: askPlaceholder(planId), plan_id: planId, kind: "question", asker_id: viewer.id, last_message_at: null, created_at: now.toISOString() };
  const ctx = await context(viewer.id, [], sets);
  // context() with no chats knows no plan: add this one.
  const { data: going } = await serviceDb().from("plan_members").select("member_id").eq("plan_id", planId).eq("status", "going").order("joined_at", { ascending: true });
  ctx.plans.set(planId, plan);
  ctx.going.set(planId, (going ?? []).map((g) => g.member_id as string));
  const people = await peopleRefs([plan.host_id, viewer.id, ...(ctx.going.get(planId) ?? [])]);
  for (const [id, ref] of people) ctx.refs.set(id, ref);
  ctx.members.set(placeholder.id, [
    { chat_id: placeholder.id, member_id: plan.host_id, role: "host", left_at: null, left_reason: null, last_read_at: null, muted: false },
    { chat_id: placeholder.id, member_id: viewer.id, role: "member", left_at: null, left_reason: null, last_read_at: null, muted: false },
  ]);
  const chat = buildChat(ctx, placeholder, viewer.id, now)!;
  return { chat, items: [], firstUnreadId: null, safetyNoteSeen: await safetySeen(viewer.id) };
}

// ---------------------------------------------------------------------------- sending

export type SendRefusal = "empty" | "too_long" | "link" | "rate_limited" | "blocked" | "closed" | "not_in_chat" | "not_found";
export type SendMessageResult = { ok: true; message: ChatMessage; chatId: string } | { ok: false; reason: SendRefusal; error: string };

/** The words the composer shows for each refusal (messages spec 3.5; "Slow down a moment." is types.ts's). */
export const SEND_WORDS: Record<SendRefusal, string> = {
  empty: "Write a message first.",
  too_long: "500/500 Message is at the limit",
  link: LINK_BLOCKED_LINE,
  rate_limited: "Slow down a moment.",
  blocked: "You can’t send messages in this chat.",
  closed: "This chat is closed",
  not_in_chat: "You’re not in this chat.",
  not_found: "This chat couldn’t be found.",
};
const refuse = (reason: SendRefusal): SendMessageResult => ({ ok: false, reason, error: SEND_WORDS[reason] });

// Control characters (not the new line or the tab), the zero-width space, the line and paragraph separators, the
// direction embeddings, overrides and isolates (text that reads one way and is stored another), the invisible
// operators and the byte order mark. Kept (QB3-13): the zero-width non-joiner and joiner (U+200C, U+200D: emoji
// sequences such as the rainbow flag, and Persian, Hindi and other scripts need them) and the left-to-right and
// right-to-left marks (U+200E, U+200F: Arabic and Hebrew text). Built from code points so no invisible character
// sits in this file.
const INVISIBLE = new RegExp(
  "[" +
    [[0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x9f], [0x200b, 0x200b], [0x2028, 0x202e], [0x2060, 0x2064], [0x2066, 0x2069], [0xfeff, 0xfeff]]
      .map(([a, b]) => `\\u${a.toString(16).padStart(4, "0")}-\\u${b.toString(16).padStart(4, "0")}`)
      .join("") +
    "]",
  "g",
);

/** Control characters out (new lines and tabs stay), outer space trimmed. */
export function cleanMessage(text: string): string {
  return String(text ?? "").replace(INVISIBLE, "").replace(/\r\n?/g, "\n").trim();
}

function toMessage(m: MessageRow): ChatMessage {
  return { kind: "text", id: m.id, clientId: m.client_id ?? m.id, chatId: m.chat_id, senderId: m.sender_id ?? "", text: m.body ?? "", sentAt: iso(m.created_at), status: m.removed_at ? "removed" : "visible" };
}

export async function sendChatMessage(viewer: Viewer, input: { chatId: string; text: string; clientId?: string | null }, now: Date = new Date()): Promise<SendMessageResult> {
  const db = serviceDb();
  const text = cleanMessage(input?.text ?? "");
  if (!text) return refuse("empty");
  if ([...text].length > MESSAGE_MAX_LENGTH) return refuse("too_long");
  if (containsLink(text)) return refuse("link");
  const clientId = typeof input?.clientId === "string" && /^[\w-]{1,64}$/.test(input.clientId) ? input.clientId : null;

  // A question not asked yet: make the chat first (it refuses a host, a closed plan and a block either way).
  let chatId = input?.chatId ?? "";
  const askPlan = planIdFromAsk(chatId);
  if (askPlan) {
    if (!isUuid(askPlan)) return refuse("not_found");
    const { data: plan } = await db.from("plans").select(PLAN_COLUMNS).eq("id", askPlan).maybeSingle<PlanRow>();
    if (!plan || !(await canSeePlan(viewer.id, plan))) return refuse("not_found");
    const { data, error } = await db.rpc("open_question", { p_member: viewer.id, p_plan: askPlan });
    if (error) throw error;
    const r = data as { status: string; chat_id?: string };
    if (r.status === "blocked") return refuse("blocked");
    if (r.status === "closed") return refuse("closed");
    if (r.status !== "ok" || !r.chat_id) return refuse("not_found");
    chatId = r.chat_id;
  }
  const row = await chatRow(chatId);
  if (!row) return refuse("not_found");
  const { data: me } = await db.from("chat_members").select("left_at").eq("chat_id", row.id).eq("member_id", viewer.id).maybeSingle();
  if (!me || me.left_at) return refuse("not_in_chat");

  // The same message again (a retry after a lost answer): hand back the one already stored.
  if (clientId) {
    const { data: same } = await db.from("messages").select(MESSAGE_COLUMNS).eq("chat_id", row.id).eq("sender_id", viewer.id).eq("client_id", clientId).maybeSingle<MessageRow>();
    if (same) return { ok: true, message: toMessage(same), chatId: row.id };
  }

  const { data: plan } = await db.from("plans").select("status, starts_at, host_id").eq("id", row.plan_id).maybeSingle<Pick<PlanRow, "status" | "starts_at" | "host_id">>();
  if (!plan) return refuse("not_found");
  if (chatState(row.kind, plan, now).status === "closed") return refuse("closed");
  if (row.kind === "question") {
    const other = row.asker_id === viewer.id ? plan.host_id : row.asker_id;
    const sets = other ? await blockSets(viewer.id) : null;
    // The member who blocked the other is told plainly; the member who was blocked is not told (messages decision
    // 6 A, QB1-04): their send is refused with the closed chat's own words, which say nothing about a block.
    if (other && sets?.blocked.has(other)) return refuse("blocked");
    if (other && sets?.blockedBy.has(other)) return refuse("closed");
  }

  // The same message again, the rate limit and the insert, under one lock per sender (QB3-09: sixty sends at once
  // store at most the limit), in the database.
  const { data: sent, error } = await db.rpc("send_chat_message", {
    p_chat: row.id,
    p_sender: viewer.id,
    p_body: text,
    p_client_id: clientId,
    p_limit: MESSAGE_RATE_LIMIT.count,
    p_window_seconds: MESSAGE_RATE_LIMIT.perSeconds,
  });
  if (error) throw error;
  const result = sent as { status: "sent" | "duplicate" | "rate_limited"; id?: string };
  if (result.status === "rate_limited") return refuse("rate_limited");
  const { data: inserted, error: readError } = await db.from("messages").select(MESSAGE_COLUMNS).eq("id", result.id!).single<MessageRow>();
  if (readError) throw readError;
  if (result.status === "duplicate") return { ok: true, message: toMessage(inserted), chatId: row.id };
  await db.rpc("mark_chat_read", { p_member: viewer.id, p_chat: row.id });
  await notify({ type: "chat.message", chatId: row.id, messageId: inserted.id, senderId: viewer.id });
  return { ok: true, message: toMessage(inserted), chatId: row.id };
}

// ---------------------------------------------------------------------------- read state, mute, leave, the safety note

export async function markChatRead(viewerId: string, chatId: string): Promise<boolean> {
  if (!isUuid(chatId)) return false;
  const { data, error } = await serviceDb().rpc("mark_chat_read", { p_member: viewerId, p_chat: chatId });
  if (error) throw error;
  return Boolean(data);
}

export async function setChatMuted(viewerId: string, chatId: string, muted: boolean): Promise<boolean> {
  if (!isUuid(chatId)) return false;
  const { data, error } = await serviceDb().from("chat_members").update({ muted: Boolean(muted) }).eq("chat_id", chatId).eq("member_id", viewerId).select("chat_id");
  if (error) throw error;
  return Boolean(data?.length);
}

export type LeaveChatResult = { ok: true } | { ok: false; error: string };

/** Leave a chat (your place in the plan stays; open the chat from the invite to come back). The host keeps their own plan chat. */
export async function leaveChat(viewerId: string, chatId: string): Promise<LeaveChatResult> {
  const row = await chatRow(chatId);
  if (!row) return { ok: false, error: SEND_WORDS.not_found };
  const db = serviceDb();
  const { data: me } = await db.from("chat_members").select("role, left_at").eq("chat_id", row.id).eq("member_id", viewerId).maybeSingle();
  if (!me || me.left_at) return { ok: false, error: SEND_WORDS.not_in_chat };
  if (row.kind === "plan" && me.role === "host") return { ok: false, error: "You host this plan, so its chat stays. Mute it instead." };
  const { error } = await db.from("chat_members").update({ left_at: new Date().toISOString(), left_reason: "left_chat" }).eq("chat_id", row.id).eq("member_id", viewerId);
  if (error) throw error;
  return { ok: true };
}

export async function markSafetyNoteSeen(viewerId: string): Promise<void> {
  await serviceDb().from("members").update({ chat_safety_seen_at: new Date().toISOString() }).eq("id", viewerId).is("chat_safety_seen_at", null);
}

/**
 * The number on the messages icon: unread chats plus unread updates (messages decision 8 A). An update about a
 * member you blocked is left out of the Updates list (updates.ts), so it is not counted here either: otherwise
 * the icon would show a number nothing in the inbox explains, and "Mark all as read" would never show for it.
 */
export async function unreadCounts(viewerId: string): Promise<UnreadCounts> {
  const db = serviceDb();
  const [{ data, error }, sets] = await Promise.all([db.rpc("unread_counts", { p_member: viewerId }), blockSets(viewerId)]);
  if (error) throw error;
  const r = (data ?? {}) as { chats?: number; updates?: number };
  let updates = r.updates ?? 0;
  if (updates > 0 && sets.blocked.size > 0) {
    const since = new Date(Date.now() - UPDATES_KEEP_DAYS * 24 * HOUR).toISOString();
    const { count, error: hiddenError } = await db
      .from("updates")
      .select("id", { count: "exact", head: true })
      .eq("member_id", viewerId)
      .is("read_at", null)
      .gt("created_at", since)
      .in("actor_id", [...sets.blocked]);
    if (hiddenError) throw hiddenError;
    updates = Math.max(0, updates - (count ?? 0));
  }
  return { chats: r.chats ?? 0, updates };
}
