import "server-only";

// Blocks (messages decision 6 A). The blocker no longer sees the other member's messages, even in a plan chat
// they share, and never sees their plans in the feed; the other member cannot start a question with the
// blocker or join the blocker's plans, and never sees the blocker's plans either. The other member is not
// told and still sees the blocker's messages. Enforced here and in the database functions, in every read and
// write, not only on the page.

import type { BlockedMember } from "@/lib/members/messages/types";
import { serviceDb } from "./db";
import { peopleRefs } from "./people";
import { planIdFromAsk } from "./questions";

export type BlockSets = {
  /** Members this member blocked. */
  blocked: Set<string>;
  /** Members who blocked this member (never shown to them; used to hide plans and refuse questions). */
  blockedBy: Set<string>;
};

export async function blockSets(memberId: string): Promise<BlockSets> {
  const { data, error } = await serviceDb()
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${memberId},blocked_id.eq.${memberId}`);
  if (error) throw error;
  const blocked = new Set<string>();
  const blockedBy = new Set<string>();
  for (const row of data ?? []) {
    if (row.blocker_id === memberId) blocked.add(row.blocked_id);
    else blockedBy.add(row.blocker_id);
  }
  return { blocked, blockedBy };
}

/** Either way round. */
export function eitherBlocked(sets: BlockSets, otherId: string): boolean {
  return sets.blocked.has(otherId) || sets.blockedBy.has(otherId);
}

export type BlockResult = { ok: true } | { ok: false; error: string };

/**
 * The one answer for an id this member may not block (QR-01): the same for a stranger, an id that does not
 * exist and one that is not an id at all, so the answer says nothing about anyone. The design blocks only from
 * a chat (chat info, report sent, a question), where this never shows.
 */
export const CANNOT_BLOCK = "That member couldn’t be found.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = (rows: { [key: string]: unknown }[] | null | undefined, key: string) => new Set((rows ?? []).map((r) => String(r[key])));
const meets = (a: Set<string>, b: Set<string>) => [...a].some((id) => b.has(id));

/**
 * A real reason to know the other member (QR-01): a chat the two are or were in together (a plan chat, a question),
 * or a plan the two are or were in (going, gone, or hosting). Left chats and withdrawn places count: someone who
 * made a plan unpleasant can still be blocked after they left it. Read from the database, never from the page.
 */
async function sharedHistory(memberId: string, otherId: string): Promise<boolean> {
  const db = serviceDb();
  const [chatRows, placeRows, hostRows] = await Promise.all([
    db.from("chat_members").select("chat_id, member_id").in("member_id", [memberId, otherId]),
    db.from("plan_members").select("plan_id, member_id").in("member_id", [memberId, otherId]),
    db.from("plans").select("id, host_id").in("host_id", [memberId, otherId]),
  ]);
  for (const r of [chatRows, placeRows, hostRows]) if (r.error) throw r.error;
  const chatsOf = (id: string) => ids((chatRows.data ?? []).filter((r) => r.member_id === id), "chat_id");
  if (meets(chatsOf(memberId), chatsOf(otherId))) return true;
  const plansOf = (id: string) =>
    new Set([...ids((placeRows.data ?? []).filter((r) => r.member_id === id), "plan_id"), ...ids((hostRows.data ?? []).filter((r) => r.host_id === id), "id")]);
  return meets(plansOf(memberId), plansOf(otherId));
}

/**
 * "Block Tom" in a question not asked yet (the thread is the placeholder ask-<plan id>): the host of a plan this
 * member can see. The plan page already shows them the host.
 */
async function hostOfVisiblePlan(memberId: string, otherId: string, chatId: string | null | undefined): Promise<boolean> {
  const planId = typeof chatId === "string" ? planIdFromAsk(chatId) : null;
  if (!planId || !UUID.test(planId)) return false;
  const { canSeePlan, PLAN_COLUMNS } = await import("./plans");
  const { data: plan } = await serviceDb().from("plans").select(PLAN_COLUMNS).eq("id", planId).maybeSingle();
  if (!plan || plan.host_id !== otherId) return false;
  return canSeePlan(memberId, plan as Parameters<typeof canSeePlan>[1]);
}

/**
 * Block a member (messages decision 6 A). Only someone this member has a real reason to know (QR-01): a chat or a
 * plan the two share or shared, or the host of the plan they are about to ask about. Anyone else, and any id that
 * is not a member's, gets CANNOT_BLOCK and nothing is written.
 */
export async function blockMember(memberId: string, otherId: string, chatId?: string | null): Promise<BlockResult> {
  if (otherId === memberId) return { ok: false, error: "You can’t block yourself." };
  if (typeof otherId !== "string" || !UUID.test(otherId)) return { ok: false, error: CANNOT_BLOCK };
  const db = serviceDb();
  const { data: other } = await db.from("members").select("id").eq("id", otherId).maybeSingle();
  if (!other || !((await sharedHistory(memberId, otherId)) || (await hostOfVisiblePlan(memberId, otherId, chatId)))) {
    return { ok: false, error: CANNOT_BLOCK };
  }
  const { error } = await db.from("blocks").upsert({ blocker_id: memberId, blocked_id: otherId }, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true });
  if (error) {
    console.error(`blocks: ${memberId} blocking ${otherId} failed:`, error);
    return { ok: false, error: "We couldn’t block them. Try again." };
  }
  return { ok: true };
}

export async function unblockMember(memberId: string, otherId: string): Promise<BlockResult> {
  const { error } = await serviceDb().from("blocks").delete().eq("blocker_id", memberId).eq("blocked_id", otherId);
  if (error) {
    console.error(`blocks: ${memberId} unblocking ${otherId} failed:`, error);
    return { ok: false, error: "We couldn’t unblock them. Try again." };
  }
  return { ok: true };
}

/**
 * Of `others`, the members this member shares a chat or a plan with now (both still in it): where the pages show
 * them each other's photo anyway (a plan chat's people, a plan's going list, a question).
 */
async function sharedNow(memberId: string, others: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!others.length) return out;
  const db = serviceDb();
  const everyone = [memberId, ...others];
  const [chatRows, placeRows, hostRows] = await Promise.all([
    db.from("chat_members").select("chat_id, member_id").in("member_id", everyone).is("left_at", null),
    db.from("plan_members").select("plan_id, member_id").in("member_id", everyone).eq("status", "going"),
    db.from("plans").select("id, host_id").in("host_id", everyone),
  ]);
  for (const r of [chatRows, placeRows, hostRows]) if (r.error) throw r.error;
  const chatsOf = (id: string) => ids((chatRows.data ?? []).filter((r) => r.member_id === id), "chat_id");
  const plansOf = (id: string) =>
    new Set([...ids((placeRows.data ?? []).filter((r) => r.member_id === id), "plan_id"), ...ids((hostRows.data ?? []).filter((r) => r.host_id === id), "id")]);
  const myChats = chatsOf(memberId);
  const myPlans = plansOf(memberId);
  for (const id of others) if (meets(myChats, chatsOf(id)) || meets(myPlans, plansOf(id))) out.add(id);
  return out;
}

/**
 * You > Blocked members, newest first. The name, and the photo only while the two still share a chat or a plan
 * (QR-01): this list never hands out a photo the member could not see anywhere else. Otherwise the row shows the
 * initial, as for a member with no photo.
 */
export async function listBlockedMembers(memberId: string): Promise<BlockedMember[]> {
  const { data, error } = await serviceDb().from("blocks").select("blocked_id, created_at").eq("blocker_id", memberId).order("created_at", { ascending: false });
  if (error) throw error;
  const blocked = (data ?? []).map((r) => r.blocked_id as string);
  const [refs, shared] = await Promise.all([peopleRefs(blocked), sharedNow(memberId, blocked)]);
  return (data ?? []).map((r) => {
    const ref = refs.get(r.blocked_id)!;
    return { member: shared.has(r.blocked_id) ? ref : { ...ref, photoUrl: null }, blockedAt: new Date(r.created_at).toISOString() };
  });
}

export async function blockedCount(memberId: string): Promise<number> {
  const { count } = await serviceDb().from("blocks").select("blocked_id", { count: "exact", head: true }).eq("blocker_id", memberId);
  return count ?? 0;
}
