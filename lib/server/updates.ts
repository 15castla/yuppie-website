import "server-only";

// The Updates tab (messages spec 3.3): what happened on the plans a member hosts or is in, Open Invite only,
// 30 days. Rows are written only by the notification dispatcher (lib/server/notify); this file reads them and
// marks them read. An update about a member the reader blocked is left out.

import type { ChatPlan, UpdateItem, UpdateKind } from "@/lib/members/messages/types";
import { blockSets } from "./blocks";
import { UPDATES_KEEP_DAYS } from "./config";
import { serviceDb } from "./db";
import { peopleRefs, type PersonRef } from "./people";
import { isUuid, PLAN_COLUMNS, type PlanRow } from "./plans";

type UpdateRow = {
  id: string;
  kind: UpdateKind;
  plan_id: string;
  actor_id: string | null;
  role: "host" | "going";
  reminder_hours: 24 | 2 | null;
  previous_starts_at: string | null;
  refund_pence: number | null;
  going_count: number | null;
  read_at: string | null;
  created_at: string;
};

const HOUR = 3600000;
const iso = (v: string) => new Date(v).toISOString();

export async function listUpdates(viewerId: string, now: Date = new Date()): Promise<UpdateItem[]> {
  const db = serviceDb();
  const since = new Date(now.getTime() - UPDATES_KEEP_DAYS * 24 * HOUR).toISOString();
  const { data, error } = await db
    .from("updates")
    .select("id, kind, plan_id, actor_id, role, reminder_hours, previous_starts_at, refund_pence, going_count, read_at, created_at")
    .eq("member_id", viewerId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const sets = await blockSets(viewerId);
  const rows = ((data ?? []) as UpdateRow[]).filter((r) => !r.actor_id || !sets.blocked.has(r.actor_id));
  if (!rows.length) return [];
  const planIds = [...new Set(rows.map((r) => r.plan_id))];
  const [plansRes, goingRes, chatsRes, mineRes] = await Promise.all([
    db.from("plans").select(PLAN_COLUMNS).in("id", planIds),
    db.from("plan_members").select("plan_id, member_id, joined_at").in("plan_id", planIds).eq("status", "going").order("joined_at", { ascending: true }),
    db.from("chats").select("id, plan_id").in("plan_id", planIds).eq("kind", "plan"),
    db.from("chat_members").select("chat_id").eq("member_id", viewerId).is("left_at", null),
  ]);
  const plans = new Map(((plansRes.data ?? []) as PlanRow[]).map((p) => [p.id, p]));
  const going = new Map<string, string[]>();
  for (const g of (goingRes.data ?? []) as { plan_id: string; member_id: string }[]) going.set(g.plan_id, [...(going.get(g.plan_id) ?? []), g.member_id]);
  const myChats = new Set((mineRes.data ?? []).map((r) => r.chat_id as string));
  const planChat = new Map(((chatsRes.data ?? []) as { id: string; plan_id: string }[]).filter((c) => myChats.has(c.id)).map((c) => [c.plan_id, c.id]));
  const refs = await peopleRefs([...rows.map((r) => r.actor_id), ...[...plans.values()].map((p) => p.host_id), ...[...going.values()].flat()]);
  const ref = (id: string): PersonRef => refs.get(id) ?? { id, firstName: "Member", photoUrl: null };

  const items: UpdateItem[] = [];
  for (const r of rows) {
    const plan = plans.get(r.plan_id);
    if (!plan) continue;
    const people = (going.get(plan.id) ?? []).map(ref);
    const chatPlan: ChatPlan = {
      id: plan.id,
      title: plan.title,
      startsAt: iso(plan.starts_at),
      place: plan.place,
      host: ref(plan.host_id),
      going: people,
      placesLeft: Math.max(0, plan.places - people.length),
      priceMinor: plan.price_pence,
      status: plan.status === "cancelled" ? "cancelled" : now.getTime() >= new Date(plan.starts_at).getTime() + 24 * HOUR ? "finished" : "open",
    };
    items.push({
      id: r.id,
      kind: r.kind,
      at: iso(r.created_at),
      read: Boolean(r.read_at),
      actor: r.actor_id ? ref(r.actor_id) : null,
      plan: chatPlan,
      chatId: planChat.get(plan.id) ?? null,
      role: r.role,
      reminderHours: r.reminder_hours,
      previousStartsAt: r.previous_starts_at ? iso(r.previous_starts_at) : null,
      refundMinor: r.refund_pence,
      goingCount: r.going_count,
    });
  }
  return items;
}

/** Opening an update reads it (messages spec 3.1). */
export async function markUpdateRead(viewerId: string, updateId: string): Promise<boolean> {
  if (!isUuid(updateId)) return false;
  const { data, error } = await serviceDb().from("updates").update({ read_at: new Date().toISOString() }).eq("id", updateId).eq("member_id", viewerId).is("read_at", null).select("id");
  if (error) throw error;
  return Boolean(data?.length);
}

/** "Mark all as read". Returns how many were unread. */
export async function markAllUpdatesRead(viewerId: string): Promise<number> {
  const { data, error } = await serviceDb().from("updates").update({ read_at: new Date().toISOString() }).eq("member_id", viewerId).is("read_at", null).select("id");
  if (error) throw error;
  return data?.length ?? 0;
}
