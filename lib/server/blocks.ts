import "server-only";

// Blocks (messages decision 6 A). The blocker no longer sees the other member's messages, even in a plan chat
// they share, and never sees their plans in the feed; the other member cannot start a question with the
// blocker or join the blocker's plans, and never sees the blocker's plans either. The other member is not
// told and still sees the blocker's messages. Enforced here and in the database functions, in every read and
// write, not only on the page.

import type { BlockedMember } from "@/lib/members/messages/types";
import { serviceDb } from "./db";
import { peopleRefs } from "./people";

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

export async function blockMember(memberId: string, otherId: string): Promise<BlockResult> {
  if (!otherId || otherId === memberId) return { ok: false, error: "You can’t block yourself." };
  const db = serviceDb();
  const { data: other } = await db.from("members").select("id").eq("id", otherId).maybeSingle();
  if (!other) return { ok: false, error: "That member couldn’t be found." };
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

/** You > Blocked members, newest first. */
export async function listBlockedMembers(memberId: string): Promise<BlockedMember[]> {
  const { data, error } = await serviceDb().from("blocks").select("blocked_id, created_at").eq("blocker_id", memberId).order("created_at", { ascending: false });
  if (error) throw error;
  const refs = await peopleRefs((data ?? []).map((r) => r.blocked_id));
  return (data ?? []).map((r) => ({ member: refs.get(r.blocked_id)!, blockedAt: new Date(r.created_at).toISOString() }));
}

export async function blockedCount(memberId: string): Promise<number> {
  const { count } = await serviceDb().from("blocks").select("blocked_id", { count: "exact", head: true }).eq("blocker_id", memberId);
  return count ?? 0;
}
