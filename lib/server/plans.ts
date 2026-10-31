import "server-only";

// Open Invite plans (specs/open-invite.md): the feed, Yours, the plan page, post, edit, cancel, join, withdraw,
// and the rows on Your plans. Every function returns the shapes in lib/members/invite/types.ts, built for one
// viewer (their role, their chat, their unread count, the questions they asked or were asked).
//
// Rules kept here and in the database functions (supabase/migrations/20261030090000):
//   - free plans only in stage 2: a plan with a price is never shown or joined, and a cost is refused, unless
//     the server-only switch MEMBERS_PAID_PLANS_LIVE=on (never set in stage 2);
//   - capacity and joins under the plan's row lock (join_plan), no double joins, the host cannot join as a guest;
//   - blocks either way between a member and a host: the plan is not in the feed, its page is not found, and
//     joining or asking is refused (the plan stays visible to members already going);
//   - the feed: upcoming, not cancelled, not removed, the host's membership active, soonest first;
//   - leaving a free plan is open until it starts; a time or place change notifies the people going.

import { INVITE_TYPES } from "@/lib/members/invite/types";
import type {
  GetPaid,
  InviteMember,
  InviteStatus,
  InviteType,
  NewOpenInvite,
  NewOpenInviteContext,
  NewOpenInviteField,
  OpenInvite,
  OpenInviteFeed,
  OpenInvitePage,
  OpenInviteYours,
} from "@/lib/members/invite/types";
import { londonLocalToIso } from "@/lib/members/invite/format";
import type { OpenInvitePlan, PlansWhen } from "@/lib/members/plans/types";
import { openInviteHref } from "@/lib/members/routes";
import { audit } from "./audit";
import { blockSets, eitherBlocked, type BlockSets } from "./blocks";
import { paidPlansLive } from "./config";
import { serviceDb } from "./db";
import { londonWall } from "./format";
import { isGated, membershipState, type MemberStateFields } from "./membership";
import { notify } from "./notify";
import { peopleRefs, type PersonRef } from "./people";
import { askPlaceholder, guestQuestions, hostQuestions, latestTexts, questionAskers } from "./questions";

export const PLAN_COLUMNS =
  "id, host_id, title, type, starts_at, place, note, places, host_going, price_pence, face_value_confirmed, status, cancelled_at, changed_at, removed_at, created_at";

export type PlanRow = {
  id: string;
  host_id: string;
  title: string;
  type: InviteType;
  starts_at: string;
  place: string;
  note: string | null;
  places: number;
  host_going: boolean;
  price_pence: number | null;
  face_value_confirmed: boolean;
  status: "scheduled" | "cancelled";
  cancelled_at: string | null;
  changed_at: string | null;
  removed_at: string | null;
  created_at: string;
};

/** Who is asking: the signed-in member (require-member's Member is enough). */
export type Viewer = { id: string; email: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export function planStatus(row: Pick<PlanRow, "status" | "starts_at">, now: Date): InviteStatus {
  if (row.status === "cancelled") return "cancelled";
  return new Date(row.starts_at).getTime() <= now.getTime() ? "finished" : "scheduled";
}

/** Plans with a price exist only from stage 3: until the switch is on they are never shown. */
const priceAllowed = (row: Pick<PlanRow, "price_pence">) => row.price_pence === null || paidPlansLive();

const iso = (value: string) => new Date(value).toISOString();

// ---------------------------------------------------------------------------- building OpenInvite

async function unreadMap(memberId: string): Promise<Map<string, number>> {
  const { data, error } = await serviceDb().rpc("chat_unread", { p_member: memberId });
  if (error) throw error;
  return new Map(((data ?? []) as { chat_id: string; unread: number }[]).map((r) => [r.chat_id, r.unread]));
}

/** The plans as one viewer sees them. Keeps the order of `rows`. */
export async function buildInvites(rows: PlanRow[], viewer: Viewer, now: Date, givenSets?: BlockSets): Promise<OpenInvite[]> {
  if (!rows.length) return [];
  const db = serviceDb();
  const ids = rows.map((r) => r.id);
  const [goingRes, chatsRes, unread, sets] = await Promise.all([
    db.from("plan_members").select("plan_id, member_id, joined_at").in("plan_id", ids).eq("status", "going").order("joined_at", { ascending: true }),
    db.from("chats").select("id, plan_id").in("plan_id", ids).eq("kind", "plan"),
    unreadMap(viewer.id),
    givenSets ? Promise.resolve(givenSets) : blockSets(viewer.id),
  ]);
  if (goingRes.error) throw goingRes.error;
  if (chatsRes.error) throw chatsRes.error;
  const goingBy = new Map<string, string[]>();
  for (const g of goingRes.data ?? []) goingBy.set(g.plan_id, [...(goingBy.get(g.plan_id) ?? []), g.member_id]);
  const planChat = new Map((chatsRes.data ?? []).map((c) => [c.plan_id, c.id as string]));

  const roleOf = (row: PlanRow): OpenInvite["you"]["role"] =>
    row.host_id === viewer.id ? "host" : (goingBy.get(row.id) ?? []).includes(viewer.id) ? "going" : "guest";
  const hosted = rows.filter((r) => roleOf(r) === "host").map((r) => r.id);
  const guests = rows.filter((r) => roleOf(r) === "guest");
  const inChats = rows.filter((r) => roleOf(r) !== "guest").map((r) => planChat.get(r.id)).filter((c): c is string => Boolean(c));

  const [askers, asks, previews] = await Promise.all([
    questionAskers(hosted),
    guestQuestions(viewer.id, guests),
    latestTexts(inChats, (m) => !m.sender_id || !sets.blocked.has(m.sender_id)),
  ]);
  const people = new Set<string>([...rows.map((r) => r.host_id), ...[...goingBy.values()].flat(), ...askers]);
  for (const p of previews.values()) if (p.sender_id) people.add(p.sender_id);
  const refs = await peopleRefs([...people]);
  const questions = await hostQuestions(hosted, unread, refs, sets.blocked);
  const ref = (id: string): InviteMember => refs.get(id) ?? { id, firstName: "Member", photoUrl: null };

  return rows.map((row) => {
    const role = roleOf(row);
    const chatId = role === "guest" ? null : planChat.get(row.id) ?? null;
    const preview = chatId ? previews.get(chatId) : undefined;
    const ask = asks.get(row.id);
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      startsAt: iso(row.starts_at),
      where: row.place,
      note: row.note,
      places: row.places,
      hostGoing: row.host_going,
      host: ref(row.host_id),
      going: (goingBy.get(row.id) ?? []).map(ref),
      status: planStatus(row, now),
      cost: row.price_pence === null ? null : { pricePence: row.price_pence, faceValueConfirmed: row.face_value_confirmed },
      you: {
        role,
        chatId,
        unreadInChat: chatId ? unread.get(chatId) ?? 0 : 0,
        chatPreview: preview
          ? { from: preview.sender_id === viewer.id ? "You" : ref(preview.sender_id ?? "").firstName, text: preview.body ?? "" }
          : null,
        askThreadId: role === "guest" ? ask?.chatId ?? askPlaceholder(row.id) : null,
        hostReply: role === "guest" ? ask?.hostReply ?? null : null,
        questions: role === "host" ? questions.get(row.id) ?? [] : [],
        // Paid plans are stage 3: no payment and no money exist in stage 2.
        payment: null,
        hostMoney: null,
        receiptEmail: viewer.email,
      },
    };
  });
}

async function planRows(query: (q: ReturnType<ReturnType<typeof serviceDb>["from"]>) => unknown): Promise<PlanRow[]> {
  const { data, error } = (await query(serviceDb().from("plans"))) as { data: PlanRow[] | null; error: unknown };
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------- the feed, Yours, the plan page

type HostState = MemberStateFields & { id: string };

/** The number on the Yours switch: upcoming plans you host or are in with unread chat messages or questions. */
export async function yoursCount(viewerId: string, now: Date = new Date()): Promise<number> {
  const unread = [...(await unreadMap(viewerId)).entries()].filter(([, n]) => n > 0).map(([id]) => id);
  if (!unread.length) return 0;
  const db = serviceDb();
  const { data: chats } = await db.from("chats").select("id, plan_id, kind, asker_id").in("id", unread);
  const relevant = (chats ?? []).filter((c) => c.kind === "plan" || c.asker_id !== viewerId);
  if (!relevant.length) return 0;
  const { data: plans } = await db
    .from("plans")
    .select("id, host_id, starts_at, status")
    .in("id", [...new Set(relevant.map((c) => c.plan_id))])
    .eq("status", "scheduled")
    .gt("starts_at", now.toISOString());
  const live = new Map((plans ?? []).map((p) => [p.id, p]));
  return new Set(relevant.filter((c) => live.has(c.plan_id) && (c.kind === "plan" || live.get(c.plan_id)?.host_id === viewerId)).map((c) => c.plan_id)).size;
}

export async function openInviteFeed(viewer: Viewer, now: Date = new Date()): Promise<OpenInviteFeed> {
  const sets = await blockSets(viewer.id);
  const { data, error } = await serviceDb()
    .from("plans")
    .select(`${PLAN_COLUMNS}, host:members!plans_host_id_fkey(id, membership_status, cancel_at, payment_failed_at, grace_until, paused_at, ended_at, deleted_at)`)
    .eq("status", "scheduled")
    .is("removed_at", null)
    .gt("starts_at", now.toISOString())
    .order("starts_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as (PlanRow & { host: HostState | null })[]).filter((row) => {
    if (!priceAllowed(row)) return false;
    if (row.host_id === viewer.id) return true;
    if (eitherBlocked(sets, row.host_id)) return false;
    return Boolean(row.host) && !isGated(membershipState(row.host!, now).state);
  });
  const [invites, count, me] = await Promise.all([
    buildInvites(rows.map(stripHost), viewer, now, sets),
    yoursCount(viewer.id, now),
    peopleRefs([viewer.id]),
  ]);
  return { invites, yoursCount: count, me: me.get(viewer.id)!, now: now.toISOString() };
}

function stripHost(row: PlanRow & { host?: unknown }): PlanRow {
  const { host: _host, ...rest } = row;
  void _host;
  return rest;
}

/** The plans this member hosts and the ones they are going to (as a guest), any status. */
async function involvedRows(viewerId: string): Promise<{ hosted: PlanRow[]; going: PlanRow[] }> {
  const db = serviceDb();
  const [hostedRows, places] = await Promise.all([
    planRows((q) => q.select(PLAN_COLUMNS).eq("host_id", viewerId).order("starts_at", { ascending: true }).limit(200)),
    db.from("plan_members").select("plan_id").eq("member_id", viewerId).eq("status", "going").eq("role", "guest"),
  ]);
  const ids = (places.data ?? []).map((p) => p.plan_id as string);
  const going = ids.length ? await planRows((q) => q.select(PLAN_COLUMNS).in("id", ids).order("starts_at", { ascending: true })) : [];
  return { hosted: hostedRows.filter(priceAllowed), going: going.filter(priceAllowed) };
}

export async function openInviteYours(viewer: Viewer, now: Date = new Date()): Promise<OpenInviteYours> {
  const { hosted, going } = await involvedRows(viewer.id);
  const upcoming = (r: PlanRow) => new Date(r.starts_at).getTime() > now.getTime();
  const posted = hosted.filter(upcoming);
  const joined = going.filter(upcoming);
  const past = [...hosted, ...going]
    .filter((r) => !upcoming(r) && r.status === "scheduled")
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    .slice(0, 20);
  const sets = await blockSets(viewer.id);
  const built = await buildInvites([...posted, ...joined, ...past], viewer, now, sets);
  const [count, me] = await Promise.all([yoursCount(viewer.id, now), peopleRefs([viewer.id])]);
  return {
    posted: built.slice(0, posted.length),
    joined: built.slice(posted.length, posted.length + joined.length),
    past: built.slice(posted.length + joined.length),
    me: me.get(viewer.id)!,
    now: now.toISOString(),
    yoursCount: count,
  };
}

async function planById(planId: string): Promise<PlanRow | null> {
  if (!isUuid(planId)) return null;
  const { data, error } = await serviceDb().from("plans").select(PLAN_COLUMNS).eq("id", planId).maybeSingle<PlanRow>();
  if (error) throw error;
  return data ?? null;
}

async function isGoing(planId: string, memberId: string): Promise<boolean> {
  const { data } = await serviceDb().from("plan_members").select("status").eq("plan_id", planId).eq("member_id", memberId).maybeSingle();
  return data?.status === "going";
}

const HOST_STATE_COLUMNS = "id, membership_status, cancel_at, payment_failed_at, grace_until, paused_at, ended_at, deleted_at";

/** Is the host's membership one that may have plans open (not paused, not ended)? The feed's rule. */
async function hostActive(hostId: string, now: Date = new Date()): Promise<boolean> {
  const { data } = await serviceDb().from("members").select(HOST_STATE_COLUMNS).eq("id", hostId).maybeSingle<HostState>();
  return Boolean(data) && !isGated(membershipState(data!, now).state);
}

/**
 * May this member see this plan's page? Host and people going always; others not when removed, priced, blocked
 * either way, or when the host is paused or ended (QB1-05: the feed's rule everywhere, so a link does not open
 * what the feed hides).
 */
export async function canSeePlan(viewerId: string, row: PlanRow, sets?: BlockSets): Promise<boolean> {
  if (row.host_id === viewerId || (await isGoing(row.id, viewerId))) return true;
  if (row.removed_at || !priceAllowed(row)) return false;
  if (eitherBlocked(sets ?? (await blockSets(viewerId)), row.host_id)) return false;
  return hostActive(row.host_id);
}

/** One plan's page, or null (the page 404s). */
export async function openInvitePage(viewer: Viewer, planId: string, now: Date = new Date()): Promise<OpenInvitePage | null> {
  const row = await planById(planId);
  if (!row) return null;
  const sets = await blockSets(viewer.id);
  if (!(await canSeePlan(viewer.id, row, sets))) return null;
  const [[invite], me] = await Promise.all([buildInvites([row], viewer, now, sets), peopleRefs([viewer.id])]);
  return { invite, me: me.get(viewer.id)!, now: now.toISOString() };
}

async function inviteFor(viewer: Viewer, planId: string, now: Date): Promise<OpenInvite | null> {
  return (await openInvitePage(viewer, planId, now))?.invite ?? null;
}

// ---------------------------------------------------------------------------- post and edit

/** London's date today, YYYY-MM-DD: the earliest the post form takes. */
export function londonToday(now: Date = new Date()): string {
  const w = londonWall(now);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

export async function newInviteContext(viewer: Viewer, now: Date = new Date()): Promise<NewOpenInviteContext> {
  const me = await peopleRefs([viewer.id]);
  // Get paid is stage 3 (Stripe Connect): nobody has set it up, so the form can never offer a cost that works.
  const getPaid: GetPaid = { status: "not-set-up", accountEnding: null, paused: null };
  return { me: me.get(viewer.id)!, getPaid, today: londonToday(now), now: now.toISOString() };
}

/** The post form's own words (components/members/invite/post-view.tsx ERROR_TEXT), and the server's few more. */
export const POST_ERRORS = {
  title: "Add a title, a few words is fine.",
  titleLong: "Keep the title to 50 characters.",
  type: "Pick a type so people can find it.",
  date: "Pick a date from today.",
  time: "Add a time.",
  past: "Pick a time from now.",
  where: "Say where you’re meeting.",
  whereLong: "Keep the place to 120 characters.",
  places: "Pick between 2 and 12 places.",
  note: "Keep the note to 280 characters.",
  paid: "Paid plans aren’t open yet. Turn off Add a cost to post it free.",
} as const;

export type PlanFieldErrors = Partial<Record<NewOpenInviteField, string>>;

/** Every rule of the post form, checked again on the server. */
export function checkNewInvite(input: NewOpenInvite, now: Date): { errors: PlanFieldErrors; error: string | null; startsAt: string | null } {
  const errors: PlanFieldErrors = {};
  let error: string | null = null;
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const where = typeof input?.where === "string" ? input.where.trim() : "";
  const note = typeof input?.note === "string" ? input.note.trim() : "";
  if (!title) errors.title = POST_ERRORS.title;
  else if ([...title].length > 50) errors.title = POST_ERRORS.titleLong;
  if (!INVITE_TYPES.includes(input?.type as InviteType)) errors.type = POST_ERRORS.type;
  let startsAt: string | null = null;
  const date = typeof input?.date === "string" ? input.date : "";
  const time = typeof input?.time === "string" ? input.time : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < londonToday(now)) errors.date = POST_ERRORS.date;
  else if (!/^\d{2}:\d{2}$/.test(time)) errors.time = POST_ERRORS.time;
  else {
    startsAt = londonLocalToIso(date, time);
    if (!startsAt || new Date(startsAt).getTime() <= now.getTime()) {
      errors.time = POST_ERRORS.past;
      startsAt = null;
    }
  }
  if (!where) errors.where = POST_ERRORS.where;
  else if ([...where].length > 120) errors.where = POST_ERRORS.whereLong;
  if (!Number.isInteger(input?.places) || input.places < 2 || input.places > 12) error = POST_ERRORS.places;
  if ([...note].length > 280) error = POST_ERRORS.note;
  if (typeof input?.hostGoing !== "boolean") error = error ?? POST_ERRORS.places;
  // Nothing in stage 2 takes or pretends to take money.
  if (input?.cost) errors.price = POST_ERRORS.paid;
  return { errors, error, startsAt };
}

export type PostInviteResult =
  | { ok: true; id: string; invite: OpenInvite }
  | { ok: false; errors: PlanFieldErrors; error: string | null };

export async function postOpenInvite(viewer: Viewer, input: NewOpenInvite, now: Date = new Date()): Promise<PostInviteResult> {
  const check = checkNewInvite(input, now);
  if (Object.keys(check.errors).length || check.error || !check.startsAt) return { ok: false, errors: check.errors, error: check.error };
  const { data, error } = await serviceDb().rpc("post_plan", {
    p_host: viewer.id,
    p_title: input.title.trim(),
    p_type: input.type,
    p_starts_at: check.startsAt,
    p_place: input.where.trim(),
    p_note: input.note?.trim() || null,
    p_places: input.places,
    p_host_going: input.hostGoing,
  });
  if (error) {
    console.error(`plans: post by ${viewer.id} failed:`, error);
    return { ok: false, errors: {}, error: "Your plan didn’t post. Try again." };
  }
  const result = data as { status: string; plan_id?: string };
  if (result.status === "past") return { ok: false, errors: { time: POST_ERRORS.past }, error: null };
  if (result.status !== "posted" || !result.plan_id) return { ok: false, errors: {}, error: "Your plan didn’t post. Try again." };
  const invite = await inviteFor(viewer, result.plan_id, now);
  return { ok: true, id: result.plan_id, invite: invite! };
}

export type PlanActionResult = { ok: true; invite: OpenInvite } | { ok: false; error: string; errors?: PlanFieldErrors; invite: OpenInvite | null };

const NOT_FOUND = "That plan couldn’t be found.";

export async function editOpenInvite(viewer: Viewer, planId: string, input: NewOpenInvite, now: Date = new Date()): Promise<PlanActionResult> {
  const row = await planById(planId);
  if (!row || row.host_id !== viewer.id) return { ok: false, error: NOT_FOUND, invite: null };
  const check = checkNewInvite(input, now);
  if (Object.keys(check.errors).length || check.error || !check.startsAt) {
    return { ok: false, error: check.error ?? "Check the details and try again.", errors: check.errors, invite: await inviteFor(viewer, planId, now) };
  }
  const { data, error } = await serviceDb().rpc("edit_plan", {
    p_host: viewer.id,
    p_plan: planId,
    p_title: input.title.trim(),
    p_type: input.type,
    p_starts_at: check.startsAt,
    p_place: input.where.trim(),
    p_note: input.note?.trim() || null,
    p_places: input.places,
    p_host_going: input.hostGoing,
  });
  if (error) {
    console.error(`plans: edit of ${planId} failed:`, error);
    return { ok: false, error: "Your changes didn’t save. Try again.", invite: await inviteFor(viewer, planId, now) };
  }
  const r = data as { status: string; time_changed?: boolean; place_changed?: boolean; previous_starts_at?: string; previous_place?: string; going?: number };
  const words: Record<string, string> = {
    not_found: NOT_FOUND,
    not_host: NOT_FOUND,
    cancelled: "This plan was cancelled, so it can’t be changed.",
    started: "This plan has started, so it can’t be changed.",
    past: POST_ERRORS.past,
    too_few_places: `${r.going ?? "More"} people are going, so keep at least ${r.going ?? "that many"} places.`,
    full: "There’s no place left for you. Add a place first.",
  };
  if (r.status !== "saved") return { ok: false, error: words[r.status] ?? "Your changes didn’t save. Try again.", invite: await inviteFor(viewer, planId, now) };
  if (r.time_changed || r.place_changed) {
    await notify({
      type: "plan.changed",
      planId,
      byId: viewer.id,
      previousStartsAt: r.previous_starts_at ?? row.starts_at,
      previousPlace: r.previous_place ?? row.place,
      timeChanged: Boolean(r.time_changed),
      placeChanged: Boolean(r.place_changed),
    });
  }
  return { ok: true, invite: (await inviteFor(viewer, planId, now))! };
}

export async function cancelOpenInvite(viewer: Viewer, planId: string, now: Date = new Date()): Promise<PlanActionResult> {
  const row = await planById(planId);
  if (!row || row.host_id !== viewer.id) return { ok: false, error: NOT_FOUND, invite: null };
  const { data, error } = await serviceDb().rpc("cancel_plan", { p_host: viewer.id, p_plan: planId });
  if (error) {
    console.error(`plans: cancel of ${planId} failed:`, error);
    return { ok: false, error: "The plan wasn’t cancelled. Try again.", invite: await inviteFor(viewer, planId, now) };
  }
  const r = data as { status: string };
  if (r.status === "started") return { ok: false, error: "This plan has started, so it can’t be cancelled.", invite: await inviteFor(viewer, planId, now) };
  if (r.status !== "cancelled" && r.status !== "already_cancelled") return { ok: false, error: NOT_FOUND, invite: null };
  if (r.status === "cancelled") await notify({ type: "plan.cancelled", planId, byClub: false });
  return { ok: true, invite: (await inviteFor(viewer, planId, now))! };
}

// ---------------------------------------------------------------------------- join and withdraw

export type JoinRefusal = "full" | "started" | "cancelled" | "host" | "paid" | "blocked" | "inactive" | "not_found";
export type JoinResult = { ok: true; invite: OpenInvite; chatId: string | null } | { ok: false; reason: JoinRefusal; error: string; invite: OpenInvite | null };

const JOIN_WORDS: Record<JoinRefusal, string> = {
  full: "The last place has gone.",
  started: "This plan has started.",
  cancelled: "This plan was cancelled.",
  host: "It’s your plan, so you’re in already.",
  paid: "Paid plans aren’t open yet.",
  blocked: NOT_FOUND,
  inactive: "Your membership isn’t active, so you can’t join plans.",
  not_found: NOT_FOUND,
};

export async function joinOpenInvite(viewer: Viewer, planId: string, now: Date = new Date()): Promise<JoinResult> {
  const row = await planById(planId);
  if (!row || !(await canSeePlan(viewer.id, row))) return { ok: false, reason: "not_found", error: NOT_FOUND, invite: null };
  const { data, error } = await serviceDb().rpc("join_plan", { p_member: viewer.id, p_plan: planId });
  if (error) {
    console.error(`plans: join of ${planId} by ${viewer.id} failed:`, error);
    throw error;
  }
  const r = data as { status: string; full?: boolean; chat_id?: string | null };
  if (r.status === "joined") await notify({ type: "plan.joined", planId, memberId: viewer.id, full: Boolean(r.full) });
  const invite = await inviteFor(viewer, planId, now);
  if (r.status === "joined" || r.status === "already_in") return { ok: true, invite: invite!, chatId: r.chat_id ?? null };
  const reason = (r.status in JOIN_WORDS ? r.status : "not_found") as JoinRefusal;
  return { ok: false, reason, error: JOIN_WORDS[reason], invite: reason === "blocked" ? null : invite };
}

export type WithdrawResult = { ok: true; invite: OpenInvite } | { ok: false; reason: "not_in" | "started" | "host" | "not_found"; error: string; invite: OpenInvite | null };

export async function withdrawFromOpenInvite(viewer: Viewer, planId: string, now: Date = new Date()): Promise<WithdrawResult> {
  const row = await planById(planId);
  if (!row) return { ok: false, reason: "not_found", error: NOT_FOUND, invite: null };
  const { data, error } = await serviceDb().rpc("leave_plan", { p_member: viewer.id, p_plan: planId });
  if (error) {
    console.error(`plans: withdraw from ${planId} by ${viewer.id} failed:`, error);
    throw error;
  }
  const r = data as { status: string; was_full?: boolean };
  if (r.status === "left") await notify({ type: "plan.left", planId, memberId: viewer.id, wasFull: Boolean(r.was_full) });
  const invite = await inviteFor(viewer, planId, now);
  if (r.status === "left" || r.status === "not_in") return r.status === "left" ? { ok: true, invite: invite! } : { ok: false, reason: "not_in", error: "You’re not in this plan.", invite };
  const words = { started: "This plan has started, so you can’t withdraw now.", host: "It’s your plan: cancel it instead.", not_found: NOT_FOUND } as const;
  const reason = (r.status in words ? r.status : "not_found") as "started" | "host" | "not_found";
  return { ok: false, reason, error: words[reason], invite };
}

// ---------------------------------------------------------------------------- Your plans (lib/members/plans/types.ts)

/** The Open Invite rows on Your plans: upcoming (going or hosting, not cancelled) or past (finished). */
export async function openInvitePlanRows(viewerId: string, when: PlansWhen, now: Date = new Date()): Promise<OpenInvitePlan[]> {
  const { hosted, going } = await involvedRows(viewerId);
  const upcoming = (r: PlanRow) => new Date(r.starts_at).getTime() > now.getTime();
  const pick = (r: PlanRow) => r.status === "scheduled" && (when === "upcoming" ? upcoming(r) : !upcoming(r));
  const rows: OpenInvitePlan[] = [
    ...hosted.filter(pick).map((r) => ({ r, role: "host" as const })),
    ...going.filter(pick).map((r) => ({ r, role: "guest" as const })),
  ].map(({ r, role }) => ({
    kind: "open-invite" as const,
    id: r.id,
    href: openInviteHref(r.id),
    startsAt: iso(r.starts_at),
    title: r.title,
    place: r.place,
    role,
    pill: when === "upcoming" ? (role === "host" ? "yours" : "youre-in") : role === "host" ? "finished" : "went",
    note: null,
  }));
  return rows.sort((a, b) => (when === "upcoming" ? a.startsAt.localeCompare(b.startsAt) : b.startsAt.localeCompare(a.startsAt)));
}

// ---------------------------------------------------------------------------- the club removes a plan (admin)

export async function adminRemovePlan(adminId: string, planId: string, reason: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await planById(planId);
  if (!row) return { ok: false, error: NOT_FOUND };
  if (row.removed_at) return { ok: false, error: "That plan was removed already." };
  const { data, error } = await serviceDb().rpc("cancel_plan", { p_host: row.host_id, p_plan: planId, p_removed_by: adminId, p_removed_reason: reason });
  if (error || (data as { status: string }).status !== "cancelled") {
    console.error(`plans: removing ${planId} failed:`, error ?? data);
    return { ok: false, error: "We couldn’t remove it. Try again in a moment." };
  }
  await audit(adminId, "plan.remove", { type: "plan", id: planId }, { reason, hostId: row.host_id });
  if (row.status === "scheduled") await notify({ type: "plan.cancelled", planId, byClub: true });
  return { ok: true };
}

export type { PersonRef };

// ---------------------------------------------------------------------------- paused or ended (QB3-06)

export type GateLeaveSummary = { cancelled: number; left: number; chatsClosed: number };

/**
 * A member paused by the club (Suspend, or Pause on the member card) or whose membership ended leaves Open Invite
 * until it is lifted: they withdraw from the upcoming plans they are going to (each host is told as for any
 * withdrawal), the upcoming plans they host are cancelled by the club (the people going are told, in the club's
 * words: the host did not cancel them), and every chat they are in closes to them (they are gated anyway; a
 * question they asked can be opened again from the invite once they are back). Safe to call again: a second call
 * finds nothing. Never throws.
 */
export async function leaveOpenInviteForGate(memberId: string, why: "paused" | "ended", now: Date = new Date()): Promise<GateLeaveSummary> {
  const db = serviceDb();
  const summary: GateLeaveSummary = { cancelled: 0, left: 0, chatsClosed: 0 };
  try {
    // A deleted account leaves through leaveOpenInviteForDeletion (its own words: the host cancelled).
    const { data: me } = await db.from("members").select("deleted_at").eq("id", memberId).maybeSingle();
    if (!me || me.deleted_at) return summary;
    const { data: hosted } = await db.from("plans").select("id").eq("host_id", memberId).eq("status", "scheduled").gt("starts_at", now.toISOString());
    for (const p of hosted ?? []) {
      const { data } = await db.rpc("club_cancel_plan", { p_plan: p.id, p_reason: why === "paused" ? "host_paused" : "host_ended" });
      if ((data as { status: string } | null)?.status === "cancelled") {
        summary.cancelled += 1;
        await notify({ type: "plan.cancelled", planId: p.id, byClub: true });
      }
    }
    const { data: going } = await db.from("plan_members").select("plan_id").eq("member_id", memberId).eq("status", "going").eq("role", "guest");
    for (const g of going ?? []) {
      const { data } = await db.rpc("leave_plan", { p_member: memberId, p_plan: g.plan_id });
      const r = data as { status: string; was_full?: boolean } | null;
      if (r?.status === "left") {
        summary.left += 1;
        await notify({ type: "plan.left", planId: g.plan_id, memberId, wasFull: Boolean(r.was_full) });
      }
    }
    const { data: closed } = await db
      .from("chat_members")
      .update({ left_at: now.toISOString(), left_reason: "left_chat" })
      .eq("member_id", memberId)
      .is("left_at", null)
      .select("chat_id");
    summary.chatsClosed = closed?.length ?? 0;
  } catch (err) {
    console.error(`plans: taking ${memberId} out of Open Invite (${why}) failed:`, err);
  }
  return summary;
}

// ---------------------------------------------------------------------------- Delete my account

/**
 * A deleted account leaves Open Invite and Messages (stage 1's deleteAccount calls this before anonymising):
 * the plans they host that are still to come are cancelled (the people going are told), they withdraw from the
 * plans they are going to (the hosts are told), they leave every chat, their messages read "Message removed"
 * (messages spec 9: account deletion removes messages), and their blocks, Updates and switches go. Never throws.
 */
export async function leaveOpenInviteForDeletion(memberId: string, now: Date = new Date()): Promise<{ cancelled: number; left: number }> {
  const db = serviceDb();
  let cancelled = 0;
  let left = 0;
  try {
    const { data: hosted } = await db.from("plans").select("id").eq("host_id", memberId).eq("status", "scheduled").gt("starts_at", now.toISOString());
    for (const p of hosted ?? []) {
      const { data } = await db.rpc("cancel_plan", { p_host: memberId, p_plan: p.id });
      if ((data as { status: string } | null)?.status === "cancelled") {
        cancelled += 1;
        await notify({ type: "plan.cancelled", planId: p.id, byClub: false });
      }
    }
    const { data: going } = await db.from("plan_members").select("plan_id").eq("member_id", memberId).eq("status", "going").eq("role", "guest");
    for (const g of going ?? []) {
      const { data } = await db.rpc("leave_plan", { p_member: memberId, p_plan: g.plan_id });
      const r = data as { status: string; was_full?: boolean } | null;
      if (r?.status === "left") {
        left += 1;
        await notify({ type: "plan.left", planId: g.plan_id, memberId, wasFull: Boolean(r.was_full) });
      }
    }
    const at = now.toISOString();
    await db.from("chat_members").update({ left_at: at, left_reason: "left_chat" }).eq("member_id", memberId).is("left_at", null);
    await db.from("messages").update({ removed_at: at, removed_reason: "account_deleted" }).eq("sender_id", memberId).eq("kind", "text").is("removed_at", null);
    await db.from("blocks").delete().eq("blocker_id", memberId);
    await db.from("blocks").delete().eq("blocked_id", memberId);
    await db.from("updates").delete().eq("member_id", memberId);
    await db.from("notification_preferences").delete().eq("member_id", memberId);
  } catch (err) {
    console.error(`plans: leaving Open Invite for the deleted account ${memberId} failed:`, err);
  }
  return { cancelled, left };
}
