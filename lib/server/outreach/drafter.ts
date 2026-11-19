import "server-only";

// The Outreach Desk's side of the Outlook connection (Phase 2, 16 Nov 2026; plan docs/plans/outreach-desk.md,
// sections 3.3 to 3.7 and 4.2 to 4.5). The drafter on Albert's Mac keeps all mail access; it calls
// /api/desk/drafter/<action> with its own key (only the key's SHA-256 is stored here) and:
//   plan    asks what to look for (known partners, addresses, threads, our sent messages, follow-ups to draft);
//   check   asks whether addresses opted out, before it drafts a partner email;
//   report  tells the desk what it found (emails sent, replies, bounces, automatic replies, follow-up drafts made).
// The key can't delete anything, change an opt-out, move a stage beyond Contacted to Replied, or reach anything
// outside the desk. Every report is idempotent by Outlook's message id, and what the drafter finds is matched to what
// is already on the desk (the rows imported from the outreach log, or logged by hand) so nothing shows twice.

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import { audit } from "@/lib/server/audit";
import type { ServiceDb } from "@/lib/server/db";
import { afterBounce, afterOutreachTouch, afterReply, nextStep } from "./desk";
import { OUTREACH_KINDS, type Followup, type Stage, type TouchKind } from "./model";
import { addWorkingDays, effectiveDue, isWorkingDay, ukDate, UK_TIME_ZONE } from "./rules";

/** The first sync reads back to here (Albert, 16 Nov: "reads everything since 1 Nov the first time"). */
export const BACKFILL_FROM = "2026-11-01T00:00:00.000Z";
/** Drafts are made the night before they are due, from this hour (UK time). */
export const NIGHT_BEFORE_HOUR = 21;
/** A report call carries at most this many items, and a request at most this many bytes. */
export const MAX_ITEMS = 60;
export const MAX_BYTES = 256 * 1024;
const MAX_BODY = 40_000;
/** The Mac and the desk may disagree a little about when something happened; an imported row is often a date only. */
const SAME_EVENT_MS = 18 * 3600 * 1000;

/** Never matched by domain: anyone could write from these (plan 3.6, rule 4). */
export const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "live.co.uk", "icloud.com", "me.com", "mac.com",
  "yahoo.com", "yahoo.co.uk", "aol.com", "btinternet.com", "proton.me", "protonmail.com", "msn.com", "sky.com", "virginmedia.com",
]);
const GROUP_LOCAL = /^(info|hello|hi|events?|press|ukpress|marketing|partnerships?|partners|privatehire|private-?hire|enquiries|enquiry|reservations?|bookings?|admin|team|contact|corporate|office|sales|pr|media|collabs?|support|help)$/;

export class DrafterRefusal extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------------------------------------------- the key

export function fingerprint(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** The active key whose fingerprint matches the request's Bearer key, else null. Compared in constant time. */
export async function keyFor(db: ServiceDb, header: string | null): Promise<{ id: string; last_used_at: string | null; owner: string | null } | null> {
  const m = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(header ?? "");
  if (!m) return null;
  const given = fingerprint(m[1]);
  const { data } = await db.from("outreach_drafter_keys").select("id, key_hash, last_used_at, created_by").is("revoked_at", null).maybeSingle();
  if (!data) return null;
  const a = Buffer.from(given, "hex");
  const b = Buffer.from(String(data.key_hash), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (!data.last_used_at || Date.now() - new Date(data.last_used_at).getTime() > 60_000) {
    await db.from("outreach_drafter_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  }
  // whose Mac (and mailbox) it is: the person who linked it (Albert's; 19 Nov 2026)
  return { id: data.id, last_used_at: data.last_used_at, owner: (data.created_by as string | null) ?? null };
}

const calls: number[] = [];
/** At most 120 calls a minute (per server instance; the drafter makes a handful every 15 minutes). */
export function tooMany(now = Date.now()): boolean {
  while (calls.length && now - calls[0] > 60_000) calls.shift();
  if (calls.length >= 120) return true;
  calls.push(now);
  return false;
}

// ---------------------------------------------------------------------------------------------------- shapes

type Person = { address: string; name: string | null };
type Attachment = { name: string; size: number | null; inline?: boolean };

function str(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
function body(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.slice(0, MAX_BODY) : null;
}
function iso(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;
function address(v: unknown): string | null {
  const a = typeof v === "string" ? v.trim().toLowerCase() : "";
  return EMAIL.test(a) && a.length <= 254 ? a : null;
}
function people(v: unknown): Person[] {
  if (!Array.isArray(v)) return [];
  const out: Person[] = [];
  for (const p of v.slice(0, 50)) {
    const a = address(typeof p === "string" ? p : (p as { address?: unknown })?.address);
    if (a && !out.some((x) => x.address === a)) out.push({ address: a, name: typeof p === "object" && p ? str((p as { name?: unknown }).name, 200) : null });
  }
  return out;
}
function attachments(v: unknown): Attachment[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 30).flatMap((a) => {
    const name = str((a as { name?: unknown })?.name, 300);
    if (!name) return [];
    const size = Number((a as { size?: unknown }).size);
    return [{ name, size: Number.isFinite(size) ? size : null, ...((a as { inline?: unknown }).inline ? { inline: true } : {}) }];
  });
}
function ids(v: unknown): string[] {
  return Array.isArray(v) ? v.slice(0, 50).map((x) => str(x, 1000)).filter((x): x is string => !!x) : [];
}
function uuid(v: unknown): string | null {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v.toLowerCase() : null;
}
const domainOf = (a: string) => a.split("@")[1] ?? "";

async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}
async function must<T = unknown>(query: PromiseLike<{ data?: unknown; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as T;
}

// ---------------------------------------------------------------------------------------------------- check

export type CheckResult = { status: "opted_out" | "contacted" | "fine"; on?: string | null };

/** Before a partner email is drafted: has anyone at these addresses (or their business) asked us to stop? */
export async function check(db: ServiceDb, given: unknown): Promise<Record<string, CheckResult>> {
  const list = people(given);
  const out: Record<string, CheckResult> = {};
  if (!list.length) return out;
  const addrs = list.map((p) => p.address);
  const [contacts, optedTargets, recips] = await Promise.all([
    rows<{ email: string; target_id: string; opted_out: boolean; opted_out_at: string | null }>(
      db.from("outreach_contacts").select("email, target_id, opted_out, opted_out_at").in("email", addrs),
    ),
    rows<{ id: string; domains: string[]; opted_out_at: string | null }>(db.from("outreach_targets").select("id, domains, opted_out_at").eq("opted_out", true)),
    rows<{ address: string; touch_id: string }>(db.from("outreach_touch_recipients").select("address, touch_id").in("address", addrs)),
  ]);
  const touches = recips.length
    ? await rows<{ id: string; sent_at: string | null; status: string }>(db.from("outreach_touches").select("id, sent_at, status").in("id", [...new Set(recips.map((r) => r.touch_id))]))
    : [];
  for (const p of list) {
    const mine = contacts.filter((x) => x.email === p.address);
    const byContact = mine.find((x) => x.opted_out) ?? null;
    const domain = domainOf(p.address);
    const byTarget =
      optedTargets.find((t) => mine.some((c) => c.target_id === t.id)) ?? (FREE_MAIL.has(domain) ? null : optedTargets.find((t) => t.domains.includes(domain))) ?? null;
    if (byContact || byTarget) {
      out[p.address] = { status: "opted_out", on: (byContact?.opted_out_at ?? byTarget?.opted_out_at)?.slice(0, 10) ?? null };
      continue;
    }
    const last = recips
      .filter((r) => r.address === p.address)
      .map((r) => touches.find((t) => t.id === r.touch_id))
      .filter((t): t is { id: string; sent_at: string; status: string } => !!t && !!t.sent_at && t.status === "sent")
      .map((t) => t.sent_at)
      .sort()
      .pop();
    out[p.address] = last ? { status: "contacted", on: ukDate(last) } : { status: "fine" };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- plan

function ukHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/** The last day whose follow-ups are drafted now: today, or from 21:00 the next working day as well. */
export function draftThrough(now: Date): string {
  const today = ukDate(now);
  return ukHour(now) >= NIGHT_BEFORE_HOUR ? addWorkingDays(today, 1) : today;
}

type TouchRow = {
  id: string;
  target_id: string;
  sequence_id: string;
  channel: string;
  kind: TouchKind;
  step: number | null;
  status: string;
  subject: string | null;
  sent_at: string | null;
  internet_message_id: string | null;
  conversation_id: string | null;
  outlook_draft_id: string | null;
  eml_sha256: string | null;
  web_link: string | null;
  counts_in_stats: boolean;
  created_at: string;
};
type RecipientRow = { id: string; touch_id: string; contact_id: string | null; address: string | null; role: "to" | "cc"; delivery: string };
type ContactRow = { id: string; target_id: string; name: string | null; email: string | null; opted_out: boolean; email_status: string; mailbox_type: string };
type TargetRow = { id: string; name: string; domains: string[]; opted_out: boolean; do_not_follow_up: boolean; stage: string; rm?: string | null };
type OutcomeRow = { id: string; target_id: string; sequence_id: string | null; kind: string; internet_message_id: string | null; conversation_id: string | null; confirmed: boolean; received_at: string };
type TextRow = {
  id: string;
  followup_id: string | null;
  outcome_id: string | null;
  kind: string;
  subject: string | null;
  body: string;
  status: string;
  draft_id: string | null;
  draft_error: string | null;
  updated_at: string;
};

const TOUCH_COLS = "id, target_id, sequence_id, channel, kind, step, status, subject, sent_at, internet_message_id, conversation_id, outlook_draft_id, eml_sha256, web_link, counts_in_stats, created_at";

async function deskState(db: ServiceDb) {
  const [targets, contacts, touches, recipients, outcomes, followups, texts, ignored] = await Promise.all([
    rows<TargetRow>(db.from("outreach_targets").select("id, name, domains, opted_out, do_not_follow_up, stage, rm").limit(5000)),
    rows<ContactRow>(db.from("outreach_contacts").select("id, target_id, name, email, opted_out, email_status, mailbox_type").limit(20000)),
    rows<TouchRow>(db.from("outreach_touches").select(TOUCH_COLS).limit(20000)),
    rows<RecipientRow>(db.from("outreach_touch_recipients").select("id, touch_id, contact_id, address, role, delivery").limit(40000)),
    rows<OutcomeRow>(db.from("outreach_outcomes").select("id, target_id, sequence_id, kind, internet_message_id, conversation_id, confirmed, received_at").limit(20000)),
    rows<Followup & { draft_id: string | null; draft_made_at: string | null; draft_error: string | null }>(db.from("outreach_followups").select("*").limit(20000)),
    rows<TextRow>(db.from("outreach_draft_texts").select("id, followup_id, outcome_id, kind, subject, body, status, draft_id, draft_error, updated_at").neq("status", "discarded").limit(20000)),
    rows<{ internet_message_id: string }>(db.from("outreach_ignored_messages").select("internet_message_id").limit(20000)),
  ]);
  return { targets, contacts, touches, recipients, outcomes, followups, texts, ignored };
}

export type Plan = Awaited<ReturnType<typeof plan>>;

/**
 * What the drafter needs for one sync: what to look for in Outlook, and which follow-up drafts to make. `owner` is whose
 * Mac it is: drafts are made only for that person's partners (their Relationship Manager; a partner with none counts),
 * since another RM's follow-ups would otherwise go out of this mailbox signed by the wrong person (19 Nov 2026). Every
 * partner is still looked for in Outlook.
 */
export async function plan(db: ServiceDb, now = new Date(), owner: string | null = null) {
  const s = await deskState(db);
  const mine = (targetId: string) => {
    const rm = s.targets.find((t) => t.id === targetId)?.rm ?? null;
    return !owner || !rm || rm === owner;
  };
  const { data: lastRun } = await db.from("outreach_sync_runs").select("started_at").eq("ok", true).order("started_at", { ascending: false }).limit(1).maybeSingle();
  const since = lastRun?.started_at ? new Date(new Date(lastRun.started_at).getTime() - 3600_000).toISOString() : BACKFILL_FROM;
  const targetsById = new Map(s.targets.map((t) => [t.id, t]));
  const contactsById = new Map(s.contacts.map((c) => [c.id, c]));
  const byTouch = new Map<string, RecipientRow[]>();
  for (const r of s.recipients) byTouch.set(r.touch_id, [...(byTouch.get(r.touch_id) ?? []), r]);

  const ourSent = s.touches.filter((t) => t.channel === "email" && t.internet_message_id && (t.status === "sent" || t.status === "unconfirmed"));
  const conversations = new Map<string, { targetId: string; sequenceId: string | null }>();
  for (const t of s.touches) if (t.conversation_id) conversations.set(t.conversation_id, { targetId: t.target_id, sequenceId: t.sequence_id });
  for (const o of s.outcomes) if (o.conversation_id && !conversations.has(o.conversation_id)) conversations.set(o.conversation_id, { targetId: o.target_id, sequenceId: o.sequence_id });

  const fortnight = now.getTime() - 14 * 86400_000;
  const recentRecipients = s.touches
    .filter((t) => t.channel === "email" && t.sent_at && new Date(t.sent_at).getTime() >= fortnight)
    .flatMap((t) => (byTouch.get(t.id) ?? []).filter((r) => r.address).map((r) => ({ address: r.address as string, targetId: t.target_id, sequenceId: t.sequence_id, subject: t.subject })));

  const through = draftThrough(now);
  const open = s.followups.filter((f) => f.status === "scheduled" && !f.draft_error && effectiveDue(f.due_on, f.snoozed_until) <= through);
  const followups = [];
  for (const f of open) {
    const target = targetsById.get(f.target_id);
    const text = s.texts.find((x) => x.followup_id === f.id && x.status === "written");
    if (!target || !text || target.opted_out || target.do_not_follow_up || !mine(f.target_id)) continue;
    const seqTouches = s.touches
      .filter((t) => t.sequence_id === f.sequence_id && (t.status === "sent" || t.status === "posted") && OUTREACH_KINDS.includes(t.kind))
      .sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""));
    const lastEmail = seqTouches.find((t) => t.channel === "email");
    const replyTo = seqTouches.find((t) => t.channel === "email" && t.internet_message_id) ?? null;
    const firstEmail = [...seqTouches].reverse().find((t) => t.channel === "email" && t.internet_message_id) ?? null;
    // an email in this sequence that Outlook hasn't been matched to yet (the first sync matches the log's rows): wait
    // for that, so the follow-up goes in the thread rather than as a new email
    if (lastEmail && !replyTo) continue;
    // the original To and Cc, minus bounced and opted-out addresses (the Mac takes Albert himself off too)
    let recips = (lastEmail ? byTouch.get(lastEmail.id) ?? [] : []).filter((r) => r.address && r.delivery !== "bounced");
    recips = recips.filter((r) => !(r.contact_id && contactsById.get(r.contact_id)?.opted_out));
    if (!recips.length) {
      // a letter first: the partner's primary (else any) contact with a working address
      const c = s.contacts.filter((x) => x.target_id === f.target_id && x.email && !x.opted_out && x.email_status !== "bounced");
      if (c.length) recips = [{ id: "", touch_id: "", contact_id: c[0].id, address: c[0].email, role: "to", delivery: "unknown" }];
    }
    if (!recips.length) continue;
    const person = (r: RecipientRow) => ({ address: r.address as string, name: (r.contact_id && contactsById.get(r.contact_id)?.name) || null });
    followups.push({
      followupId: f.id,
      targetId: f.target_id,
      partner: target.name,
      step: f.step,
      due: effectiveDue(f.due_on, f.snoozed_until),
      to: recips.filter((r) => r.role === "to").map(person),
      cc: recips.filter((r) => r.role === "cc").map(person),
      // in the thread when one of our emails in it is known to Outlook; else a new email with its own subject
      replyTo: replyTo ? { internetMessageId: replyTo.internet_message_id, conversationId: replyTo.conversation_id } : null,
      subject: replyTo ? null : text.subject || `Club Yuppie and ${target.name}`,
      body: text.body,
      // the follow-up carries the same attachment as the first email (Albert, 16 Nov)
      attachmentsFrom: firstEmail?.internet_message_id ?? null,
    });
  }

  // replies Alex wrote (Phase 3): a draft replying to the partner's message (Reply all), at the next sync, while
  // Albert hasn't answered that message himself and nobody has opted out
  const replies = [];
  for (const text of s.texts.filter((x) => x.kind === "reply" && x.outcome_id && x.status === "written" && !x.draft_error)) {
    const o = s.outcomes.find((x) => x.id === text.outcome_id);
    const target = o ? targetsById.get(o.target_id) : undefined;
    if (!o || !target || o.kind !== "reply" || !o.confirmed || !o.internet_message_id || target.opted_out || !mine(o.target_id)) continue;
    const answered = s.touches.some(
      (t) => t.channel === "email" && t.status === "sent" && t.sent_at && t.sent_at > o.received_at && ((o.conversation_id && t.conversation_id === o.conversation_id) || (o.sequence_id && t.sequence_id === o.sequence_id)),
    );
    if (answered) continue;
    replies.push({
      textId: text.id,
      outcomeId: o.id,
      targetId: o.target_id,
      partner: target.name,
      replyTo: { internetMessageId: o.internet_message_id, conversationId: o.conversation_id },
      body: text.body,
      key: `reply:${text.id}`,
      // never to anyone who opted out
      optedOut: s.contacts.filter((c) => c.target_id === o.target_id && c.opted_out && c.email).map((c) => c.email as string),
    });
  }

  return {
    now: now.toISOString(),
    since,
    draftThrough: through,
    targets: s.targets.map((t) => ({ id: t.id, name: t.name, domains: t.domains.filter((d) => !FREE_MAIL.has(d)), optedOut: t.opted_out })),
    addresses: s.contacts.filter((c) => c.email).map((c) => ({ address: c.email as string, targetId: c.target_id, optedOut: c.opted_out })),
    conversations: [...conversations].map(([conversationId, v]) => ({ conversationId, ...v })),
    sentMessageIds: ourSent.map((t) => ({ internetMessageId: t.internet_message_id as string, targetId: t.target_id, sequenceId: t.sequence_id })),
    recentRecipients,
    knownMessageIds: [
      ...s.touches.filter((t) => t.internet_message_id && t.status !== "unconfirmed").map((t) => t.internet_message_id as string),
      ...s.outcomes.filter((o) => o.internet_message_id && o.confirmed).map((o) => o.internet_message_id as string),
      ...s.ignored.map((i) => i.internet_message_id),
    ],
    pendingMessageIds: [
      ...s.touches.filter((t) => t.internet_message_id && t.status === "unconfirmed").map((t) => t.internet_message_id as string),
      ...s.outcomes.filter((o) => o.internet_message_id && !o.confirmed).map((o) => o.internet_message_id as string),
    ],
    // follow-up drafts made: has Albert sent them (found by their hidden key), or deleted them?
    drafted: s.followups
      .filter((f) => f.status === "drafted" && f.draft_id)
      .map((f) => ({
        followupId: f.id,
        draftId: f.draft_id,
        key: `followup:${f.id}`,
        madeAt: f.draft_made_at,
        // the thread it was made in: if the hidden key doesn't survive sending, the next email there is it
        conversationId:
          s.touches
            .filter((t) => t.sequence_id === f.sequence_id && t.channel === "email" && t.conversation_id && t.status === "sent")
            .sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""))[0]?.conversation_id ?? null,
      })),
    staleDrafts: s.followups.filter((f) => f.stale_draft && f.draft_id).map((f) => ({ followupId: f.id, draftId: f.draft_id, madeAt: f.draft_made_at })),
    followups,
    replies,
    // reply drafts made: sent (found by their hidden key, or the next email in the thread), or deleted?
    draftedReplies: s.texts
      .filter((x) => x.kind === "reply" && x.status === "drafted" && x.draft_id)
      .map((x) => ({
        textId: x.id,
        draftId: x.draft_id,
        key: `reply:${x.id}`,
        madeAt: x.updated_at,
        conversationId: s.outcomes.find((o) => o.id === x.outcome_id)?.conversation_id ?? null,
      })),
  };
}

// ---------------------------------------------------------------------------------------------------- report

export type ReportResult = { i: number; result: string; id?: string; error?: string };

export async function ensureContact(db: ServiceDb, targetId: string, p: Person, source: string): Promise<string> {
  const { data } = await db.from("outreach_contacts").select("id").eq("target_id", targetId).eq("email", p.address).maybeSingle();
  if (data) return data.id;
  const local = p.address.split("@")[0];
  const id = randomUUID();
  const { error } = await db.from("outreach_contacts").insert({
    id,
    target_id: targetId,
    name: p.name && p.name.toLowerCase() !== p.address ? p.name : null,
    email: p.address,
    email_source: source,
    mailbox_type: GROUP_LOCAL.test(local) ? "group_mailbox" : "named_person",
  });
  if (error) {
    const again = await db.from("outreach_contacts").select("id").eq("target_id", targetId).eq("email", p.address).maybeSingle();
    if (again.data) return again.data.id;
    throw new Error(`Contact not saved: ${error.message}`);
  }
  return id;
}

function near(a: string | null, b: string): boolean {
  if (!a) return false;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= SAME_EVENT_MS || ukDate(a) === ukDate(b);
}
/** An imported or hand-logged time with no clock (12:00:00.000 UTC) is replaced by Outlook's exact one. */
function dateOnly(at: string | null): boolean {
  return !!at && new Date(at).toISOString().endsWith("T12:00:00.000Z");
}

type Ctx = { db: ServiceDb; s: Awaited<ReturnType<typeof deskState>>; ignored: Set<string>; owner?: string | null };

/** Which partners an email to or from these addresses belongs to: by contact, then by domain. */
function targetsFor(ctx: Ctx, addresses: string[]): { ids: string[]; how: "sender" | "domain" | null } {
  const byContact = [...new Set(ctx.s.contacts.filter((c) => c.email && addresses.includes(c.email)).map((c) => c.target_id))];
  if (byContact.length) return { ids: byContact, how: "sender" };
  const domains = addresses.map(domainOf).filter((d) => d && !FREE_MAIL.has(d));
  const byDomain = [...new Set(ctx.s.targets.filter((t) => t.domains.some((d) => domains.includes(d))).map((t) => t.id))];
  return { ids: byDomain, how: byDomain.length ? "domain" : null };
}

function freshTarget(ctx: Ctx, id: string) {
  return ctx.db.from("outreach_targets").select("id, stage, do_not_follow_up, opted_out").eq("id", id).single().then(({ data, error }) => {
    if (error || !data) throw new Error("Partner not found");
    return data as { id: string; stage: Stage; do_not_follow_up: boolean; opted_out: boolean };
  });
}

async function addRecipients(ctx: Ctx, touchId: string, targetId: string, to: Person[], cc: Person[], source: string) {
  const list = [...to.map((p) => ({ p, role: "to" })), ...cc.map((p) => ({ p, role: "cc" }))];
  const rows = [];
  for (const { p, role } of list) {
    // only addresses at this partner become its contacts; anyone else copied in stays an address on the email
    const ours = ctx.s.contacts.some((c) => c.target_id === targetId && c.email === p.address) ||
      ctx.s.targets.find((t) => t.id === targetId)?.domains.includes(domainOf(p.address));
    const contactId = ours ? await ensureContact(ctx.db, targetId, p, source) : null;
    rows.push({ touch_id: touchId, contact_id: contactId, address: p.address, role });
  }
  if (rows.length) await must(ctx.db.from("outreach_touch_recipients").insert(rows), "Recipients not saved");
}

/** An email Albert sent, found in Sent Items. */
async function sent(ctx: Ctx, item: Record<string, unknown>, mailbox: string | null): Promise<Omit<ReportResult, "i">> {
  const { db, s } = ctx;
  const imid = str(item.internetMessageId, 1000);
  const at = iso(item.sentAt);
  if (!imid || !at) return { result: "bad" };
  if (ctx.ignored.has(imid)) return { result: "ignored" };
  const to = people(item.to).filter((p) => p.address !== mailbox);
  const cc = people(item.cc).filter((p) => p.address !== mailbox);
  const fields = {
    internet_message_id: imid,
    outlook_message_id: str(item.messageId, 1000),
    conversation_id: str(item.conversationId, 1000),
    web_link: str(item.webLink, 2000),
    body_text: body(item.bodyText),
    attachments: attachments(item.attachments),
  };
  const known = s.touches.find((t) => t.internet_message_id === imid);
  if (known) return { result: "known", id: known.id };

  // 1. a follow-up draft the drafter made (its hidden key), now sent
  const key = str(item.key, 200) ?? "";
  const fu = /^followup:([0-9a-f-]{36})$/.exec(key)?.[1];
  if (fu) {
    const f = s.followups.find((x) => x.id === fu);
    if (f) {
      const id = randomUUID();
      await must(db.from("outreach_touches").insert({
        id, target_id: f.target_id, sequence_id: f.sequence_id, channel: "email", kind: "follow_up", step: f.step, status: "sent", subject: str(item.subject, 998),
        sent_at: at, created_by: "drafter", ...fields,
      }), "Follow-up not saved");
      await addRecipients(ctx, id, f.target_id, to, cc, "unknown");
      await afterOutreachTouch(db, { id, target_id: f.target_id, sequence_id: f.sequence_id, channel: "email", kind: "follow_up", step: f.step, sent_at: at }, await freshTarget(ctx, f.target_id), "drafter");
      await db.from("outreach_followups").update({ status: "done", touch_id: id, draft_error: null }).eq("id", f.id);
      await db.from("outreach_draft_texts").update({ status: "drafted" }).eq("followup_id", f.id);
      s.touches.push({ id, target_id: f.target_id, sequence_id: f.sequence_id, channel: "email", kind: "follow_up", step: f.step, status: "sent", subject: null, sent_at: at, internet_message_id: imid, conversation_id: fields.conversation_id, outlook_draft_id: null, eml_sha256: null, web_link: fields.web_link, counts_in_stats: true, created_at: at });
      return { result: "followup_sent", id };
    }
  }

  // 1b. a reply draft the drafter made from Alex's words (Phase 3), now sent: the conversation goes on
  const rt = /^reply:([0-9a-f-]{36})$/.exec(key)?.[1];
  const replyText = rt ? s.texts.find((x) => x.id === rt) : undefined;
  const answered = replyText?.outcome_id ? s.outcomes.find((o) => o.id === replyText.outcome_id) : undefined;
  if (answered) {
    const id = randomUUID();
    const seq = answered.sequence_id ?? id;
    await must(db.from("outreach_touches").insert({
      id, target_id: answered.target_id, sequence_id: seq, channel: "email", kind: "conversation", step: null, status: "sent", subject: str(item.subject, 998),
      sent_at: at, created_by: "drafter", ...fields,
    }), "Reply not saved");
    await addRecipients(ctx, id, answered.target_id, to, cc, "unknown");
    s.touches.push({ id, target_id: answered.target_id, sequence_id: seq, channel: "email", kind: "conversation", step: null, status: "sent", subject: null, sent_at: at, internet_message_id: imid, conversation_id: fields.conversation_id, outlook_draft_id: null, eml_sha256: null, web_link: fields.web_link, counts_in_stats: true, created_at: at });
    return { result: "reply_sent", id };
  }

  // 2. already on the desk without Outlook's id (imported from the log, or logged by hand): fill it in
  const addrs = [...to, ...cc].map((p) => p.address);
  const same = s.touches
    .filter((t) => t.channel === "email" && !t.internet_message_id && (t.status === "sent" || t.status === "unconfirmed") && near(t.sent_at, at))
    .filter((t) => (ctx.s.recipients.filter((r) => r.touch_id === t.id).some((r) => r.address && addrs.includes(r.address))))
    .sort((a, b) => Math.abs(new Date(a.sent_at as string).getTime() - new Date(at).getTime()) - Math.abs(new Date(b.sent_at as string).getTime() - new Date(at).getTime()))[0];
  if (same) {
    // the log's "Exact time to come from Outlook (Phase 2)." has come true: the note goes
    const { data: was } = await db.from("outreach_touches").select("note").eq("id", same.id).single();
    const note = was?.note ? was.note.replace(/\s*Exact time to come from Outlook \(Phase 2\)\.?/, "").trim() || null : null;
    await must(
      db.from("outreach_touches").update({ ...fields, note, subject: same.subject ?? str(item.subject, 998), ...(dateOnly(same.sent_at) ? { sent_at: at } : {}) }).eq("id", same.id),
      "Email not updated",
    );
    same.internet_message_id = imid;
    same.conversation_id = fields.conversation_id;
    return { result: "matched", id: same.id };
  }

  // 3. whose is it: an email in a known thread, then by address or domain, then a partner email the drafter drafted
  const refs = ids(item.references);
  const conv = fields.conversation_id ? s.touches.find((t) => t.conversation_id === fields.conversation_id) ?? s.outcomes.find((o) => o.conversation_id === fields.conversation_id) : undefined;
  const byRef = refs.length ? s.touches.find((t) => t.internet_message_id && refs.includes(t.internet_message_id)) : undefined;
  let targetIds: string[] = [];
  let sequenceId: string | null = null;
  if (conv || byRef) {
    const hit = (conv ?? byRef) as { target_id: string; sequence_id: string | null };
    targetIds = [hit.target_id];
    sequenceId = hit.sequence_id;
  } else {
    targetIds = targetsFor(ctx, addrs).ids;
  }
  const partner = item.partner && typeof item.partner === "object" ? (item.partner as Record<string, unknown>) : null;
  let created = false;
  if (!targetIds.length && partner && str(partner.name, 200)) {
    // a partner email the skill wrote, for a business not on the desk yet: it goes on the desk now it has been sent
    // (Albert, 16 Nov: "it should go to the dashboard once the first comms have been sent to them")
    const name = str(partner.name, 200) as string;
    const existing = s.targets.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) targetIds = [existing.id];
    else {
      const id = randomUUID();
      const domains = [...new Set([...(Array.isArray(partner.domains) ? partner.domains : []), ...to.map((p) => domainOf(p.address))].map((d) => String(d).toLowerCase().trim()).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) && !FREE_MAIL.has(d)))];
      const category = str(partner.category, 30);
      const ask = str(partner.ask, 40);
      // its Relationship Manager is whoever's mailbox sent it
      const row: Record<string, unknown> = { id, name, domains, stage: "ready", ask_line: str(partner.askLine, 300), ...(ctx.owner ? { rm: ctx.owner } : {}) };
      if (category) row.category = category;
      if (ask) row.ask = ask;
      const { error } = await db.from("outreach_targets").insert(row);
      if (error) {
        // a category or ask the desk doesn't know: keep the defaults
        await must(db.from("outreach_targets").insert({ id, name, domains, stage: "ready", ...(ctx.owner ? { rm: ctx.owner } : {}) }), "Partner not saved");
      }
      s.targets.push({ id, name, domains, opted_out: false, do_not_follow_up: false, stage: "ready", rm: ctx.owner ?? null });
      targetIds = [id];
      created = true;
    }
    // the contacts the skill knew about, with where their addresses came from
    for (const c of Array.isArray(partner.contacts) ? partner.contacts.slice(0, 20) : []) {
      const a = address((c as { email?: unknown }).email);
      if (!a) continue;
      const cid = await ensureContact(db, targetIds[0], { address: a, name: str((c as { name?: unknown }).name, 200) }, "unknown");
      const patch: Record<string, unknown> = {};
      const role = str((c as { role?: unknown }).role, 200);
      const mt = str((c as { mailboxType?: unknown }).mailboxType, 30);
      const src = str((c as { source?: unknown }).source, 30);
      const note = str((c as { sourceNote?: unknown }).sourceNote, 300);
      if (role) patch.role = role;
      if (mt && ["named_person", "founder", "group_mailbox"].includes(mt)) patch.mailbox_type = mt;
      if (src && ["rocketreach", "apollo", "published", "albert", "guessed", "their_reply", "unknown"].includes(src)) patch.email_source = src;
      if (note) patch.source_note = note;
      if (Object.keys(patch).length) await db.from("outreach_contacts").update(patch).eq("id", cid);
      ctx.s.contacts.push({ id: cid, target_id: targetIds[0], name: null, email: a, opted_out: false, email_status: "unknown", mailbox_type: "named_person" });
    }
  }
  if (!targetIds.length) return { result: "unknown" };

  // 4. what was it: decide when it's clear, else Albert confirms in the review list
  const targetId = targetIds[0];
  const outreach = s.touches.filter((t) => t.target_id === targetId && OUTREACH_KINDS.includes(t.kind) && (t.status === "sent" || t.status === "posted"));
  const seqOf = sequenceId ?? outreach.sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""))[0]?.sequence_id ?? null;
  const replied = seqOf ? s.outcomes.some((o) => o.sequence_id === seqOf && o.kind === "reply" && o.confirmed) : false;
  const allBounced = (seq: string | null) => {
    if (!seq) return false;
    const r = s.recipients.filter((x) => s.touches.some((t) => t.id === x.touch_id && t.sequence_id === seq && t.channel === "email"));
    return r.length > 0 && r.every((x) => x.delivery === "bounced");
  };
  let kind: TouchKind;
  let sure: boolean;
  if (targetIds.length > 1) {
    kind = outreach.length ? "resend" : "first";
    sure = false;
  } else if ((conv || byRef) && seqOf) {
    // in a thread we know: after a reply it's the conversation; before one, probably the follow-up (Albert confirms)
    kind = replied ? "conversation" : "follow_up";
    sure = replied;
  } else if (!outreach.length) {
    kind = "first";
    sure = true;
  } else if (allBounced(seqOf)) {
    kind = "resend";
    sure = true;
  } else {
    kind = "resend";
    sure = false;
  }
  const id = randomUUID();
  const sequence = kind === "first" ? id : (seqOf ?? id);
  const step = !sure ? null : kind === "first" ? 0 : kind === "follow_up" ? await nextStep(db, sequence) : null;
  await must(db.from("outreach_touches").insert({
    id, target_id: targetId, sequence_id: sequence, channel: "email", kind, step, status: sure ? "sent" : "unconfirmed", subject: str(item.subject, 998), sent_at: at,
    created_by: "drafter", guess_kind: sure ? null : kind, candidate_targets: targetIds.length > 1 ? targetIds : [],
    attachment: fields.attachments.filter((a) => !a.inline).map((a) => a.name).join(", ") || null, ...fields,
  }), "Email not saved");
  await addRecipients(ctx, id, targetId, to, cc, "unknown");
  s.touches.push({ id, target_id: targetId, sequence_id: sequence, channel: "email", kind, step, status: sure ? "sent" : "unconfirmed", subject: null, sent_at: at, internet_message_id: imid, conversation_id: fields.conversation_id, outlook_draft_id: null, eml_sha256: null, web_link: fields.web_link, counts_in_stats: true, created_at: at });
  if (sure && OUTREACH_KINDS.includes(kind)) {
    await afterOutreachTouch(db, { id, target_id: targetId, sequence_id: sequence, channel: "email", kind, step, sent_at: at }, await freshTarget(ctx, targetId), "drafter");
  }
  return { result: sure ? (created ? "new_partner" : "sent") : "review", id };
}

/** A reply, bounce, automatic reply or delay notice that the drafter matched to a partner. */
async function incoming(ctx: Ctx, item: Record<string, unknown>): Promise<Omit<ReportResult, "i">> {
  const { db, s } = ctx;
  const imid = str(item.internetMessageId, 1000);
  const at = iso(item.receivedAt);
  const kindIn = str(item.kind, 20);
  if (!imid || !at || !kindIn || !["reply", "auto_reply", "bounce", "delay"].includes(kindIn)) return { result: "bad" };
  const kind = kindIn as "reply" | "auto_reply" | "bounce" | "delay";
  if (ctx.ignored.has(imid)) return { result: "ignored" };
  if (s.outcomes.some((o) => o.internet_message_id === imid)) return { result: "known" };
  const from = people([item.from])[0] ?? null;
  const conversationId = str(item.conversationId, 1000);
  const answers = ids(item.answers);
  const bounced = address(item.bouncedAddress);
  const bounceCode = str(item.bounceCode, 40);

  // the partner, checked here rather than taken on trust: our thread, our message in its headers, a known sender,
  // a bounce of an address we wrote to, and only then the sender's domain (a probable match Albert confirms)
  let method: "conversation" | "headers" | "sender" | "domain" = "domain";
  let targetIds: string[] = [];
  let answered: TouchRow | undefined;
  const ourByImid = answers.length ? s.touches.filter((t) => t.internet_message_id && answers.includes(t.internet_message_id)) : [];
  const inThread = conversationId ? s.touches.filter((t) => t.conversation_id === conversationId) : [];
  const inThreadOutcome = conversationId ? s.outcomes.find((o) => o.conversation_id === conversationId && o.confirmed) : undefined;
  if (ourByImid.length) {
    method = "headers";
    targetIds = [ourByImid[0].target_id];
    answered = ourByImid[0];
  } else if (inThread.length || inThreadOutcome) {
    method = "conversation";
    targetIds = [inThread[0]?.target_id ?? (inThreadOutcome as OutcomeRow).target_id];
    answered = inThread.filter((t) => t.sent_at && t.sent_at <= at).sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""))[0] ?? inThread[0];
  } else if (kind === "bounce" && bounced) {
    const hit = s.recipients.filter((r) => r.address === bounced).map((r) => s.touches.find((t) => t.id === r.touch_id)).filter((t): t is TouchRow => !!t && !!t.sent_at && t.sent_at <= at)
      .sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""))[0];
    if (hit) {
      method = "headers";
      targetIds = [hit.target_id];
      answered = hit;
    }
  }
  if (!targetIds.length && from) {
    const t = targetsFor(ctx, [from.address]);
    targetIds = t.ids;
    method = t.how === "sender" ? "sender" : "domain";
  }
  if (!targetIds.length) return { result: "unknown" };
  const targetId = targetIds[0];
  const confirmed = targetIds.length === 1 && method !== "domain";
  if (!answered) {
    answered = s.touches
      .filter((t) => t.target_id === targetId && OUTREACH_KINDS.includes(t.kind) && (t.status === "sent" || t.status === "posted") && t.sent_at && t.sent_at <= at)
      .sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""))[0];
  }
  const sequenceId = answered?.sequence_id ?? null;

  const fields = {
    internet_message_id: imid,
    graph_message_id: str(item.messageId, 1000),
    conversation_id: conversationId,
    web_link: str(item.webLink, 2000),
    body_text: kind === "reply" ? body(item.bodyText) : null,
    attachments: attachments(item.attachments),
  };

  // already on the desk without Outlook's id (imported, or logged by hand): fill it in
  const same = s.outcomes
    .filter((o) => o.target_id === targetId && o.kind === kind && !o.internet_message_id && near(o.received_at, at))
    .sort((a, b) => Math.abs(new Date(a.received_at).getTime() - new Date(at).getTime()) - Math.abs(new Date(b.received_at).getTime() - new Date(at).getTime()))[0];
  if (same) {
    const patch: Record<string, unknown> = { ...fields };
    if (!fields.body_text) delete patch.body_text;
    if (dateOnly(same.received_at)) patch.received_at = at;
    await must(db.from("outreach_outcomes").update(patch).eq("id", same.id), "Reply not updated");
    same.internet_message_id = imid;
    return { result: "matched", id: same.id };
  }

  let contactId: string | null = null;
  if (from && kind !== "bounce") {
    const c = s.contacts.find((x) => x.target_id === targetId && x.email === from.address);
    if (c) contactId = c.id;
    else if (kind === "reply" && confirmed) {
      contactId = await ensureContact(db, targetId, from, "their_reply");
      s.contacts.push({ id: contactId, target_id: targetId, name: from.name, email: from.address, opted_out: false, email_status: "unknown", mailbox_type: "named_person" });
    }
  }
  const hint = str(item.hint, 30);
  const id = randomUUID();
  await must(db.from("outreach_outcomes").insert({
    id, target_id: targetId, sequence_id: sequenceId, touch_id: answered?.id ?? null, contact_id: contactId, kind, channel: "email", received_at: at,
    from_address: kind === "bounce" ? null : from?.address ?? null, from_name: kind === "bounce" ? null : from?.name ?? null, subject: str(item.subject, 998),
    bounced_address: kind === "bounce" ? bounced : null, bounce_code: kind === "bounce" ? bounceCode : null, match_method: method, confirmed, created_by: "drafter",
    hint: hint === "possible_opt_out" || hint === "invite" ? hint : null, candidate_targets: targetIds.length > 1 ? targetIds : [], ...fields,
  }), "Reply not saved");
  s.outcomes.push({ id, target_id: targetId, sequence_id: sequenceId, kind, internet_message_id: imid, conversation_id: conversationId, confirmed, received_at: at });
  if (confirmed) await effects(db, { id, target_id: targetId, sequence_id: sequenceId, touch_id: answered?.id ?? null, received_at: at, kind, bounced_address: bounced, bounce_code: bounceCode });
  return { result: confirmed ? kind : "review", id };
}

/** What a confirmed reply or bounce does to the follow-ups and the stage. */
export async function effects(
  db: ServiceDb,
  o: { id: string; target_id: string; sequence_id: string | null; touch_id: string | null; received_at: string; kind: string; bounced_address: string | null; bounce_code: string | null },
  by = "drafter",
): Promise<void> {
  if (o.kind === "reply") {
    const { data: target } = await db.from("outreach_targets").select("id, stage").eq("id", o.target_id).single();
    if (target) await afterReply(db, o, target as { id: string; stage: Stage }, by);
  }
  if (o.kind === "bounce") await afterBounce(db, o.target_id, o.sequence_id, o.bounced_address, o.bounce_code, o.received_at);
}

async function followupDraft(ctx: Ctx, item: Record<string, unknown>): Promise<Omit<ReportResult, "i">> {
  const id = uuid(item.followupId);
  const draftId = str(item.draftId, 1000);
  const f = ctx.s.followups.find((x) => x.id === id);
  if (!f || !draftId) return { result: "bad" };
  if (f.status !== "scheduled") {
    // stopped while the draft was being made (a reply came in): the drafter deletes it next time if untouched
    await ctx.db.from("outreach_followups").update({ draft_id: draftId, draft_link: str(item.webLink, 2000), draft_made_at: iso(item.madeAt) ?? new Date().toISOString(), stale_draft: true }).eq("id", f.id);
    return { result: "stale" };
  }
  await must(ctx.db.from("outreach_followups").update({
    status: "drafted", draft_id: draftId, draft_link: str(item.webLink, 2000), draft_made_at: iso(item.madeAt) ?? new Date().toISOString(), draft_error: null,
  }).eq("id", f.id), "Follow-up not marked");
  await ctx.db.from("outreach_draft_texts").update({ status: "drafted" }).eq("followup_id", f.id);
  return { result: "drafted" };
}

async function followupFailed(ctx: Ctx, item: Record<string, unknown>): Promise<Omit<ReportResult, "i">> {
  const id = uuid(item.followupId);
  if (!id) return { result: "bad" };
  await ctx.db.from("outreach_followups").update({ draft_error: str(item.error, 300) ?? "The draft couldn't be made." }).eq("id", id);
  return { result: "noted" };
}

async function draftGone(ctx: Ctx, item: Record<string, unknown>): Promise<Omit<ReportResult, "i">> {
  const id = uuid(item.followupId);
  const f = ctx.s.followups.find((x) => x.id === id);
  if (!f) return { result: "bad" };
  if (f.status === "drafted") {
    // deleted in Outlook without being sent: back to waiting, and not made again until Albert asks
    await ctx.db.from("outreach_followups").update({ status: "scheduled", draft_id: null, draft_link: null, draft_error: "The draft was deleted in Outlook before it was sent." }).eq("id", f.id);
    await ctx.db.from("outreach_draft_texts").update({ status: "written" }).eq("followup_id", f.id);
  } else {
    await ctx.db.from("outreach_followups").update({ stale_draft: false, draft_id: null, draft_link: null }).eq("id", f.id);
  }
  return { result: "noted" };
}

async function staleDraft(ctx: Ctx, item: Record<string, unknown>): Promise<Omit<ReportResult, "i">> {
  const id = uuid(item.followupId);
  const what = str(item.outcome, 20);
  if (!id || !what) return { result: "bad" };
  if (what === "moved" || what === "gone") {
    await ctx.db.from("outreach_followups").update({ stale_draft: false, draft_id: null, draft_link: null }).eq("id", id);
  } else if (what === "edited") {
    await ctx.db.from("outreach_followups").update({ draft_error: "You edited this draft, so it was left in Outlook: delete it there if it isn't needed." }).eq("id", id);
  }
  return { result: "noted" };
}

async function replyDraft(ctx: Ctx, item: Record<string, unknown>): Promise<Omit<ReportResult, "i">> {
  const id = uuid(item.textId);
  const draftId = str(item.draftId, 1000);
  const t = ctx.s.texts.find((x) => x.id === id && x.kind === "reply");
  if (!t || !draftId) return { result: "bad" };
  // recorded even if Albert removed the words meanwhile: the draft is in Outlook, and the partner's page says so
  await must(ctx.db.from("outreach_draft_texts").update({ status: "drafted", draft_id: draftId, draft_link: str(item.webLink, 2000), draft_error: null, updated_at: iso(item.madeAt) ?? new Date().toISOString() }).eq("id", t.id), "Reply not marked");
  return { result: "reply_drafted" };
}

async function replyFailed(ctx: Ctx, item: Record<string, unknown>): Promise<Omit<ReportResult, "i">> {
  const id = uuid(item.textId);
  if (!id) return { result: "bad" };
  await ctx.db.from("outreach_draft_texts").update({ draft_error: str(item.error, 300) ?? "The reply's draft couldn't be made." }).eq("id", id).eq("kind", "reply");
  return { result: "noted" };
}

async function replyDraftGone(ctx: Ctx, item: Record<string, unknown>): Promise<Omit<ReportResult, "i">> {
  const id = uuid(item.textId);
  const t = ctx.s.texts.find((x) => x.id === id && x.kind === "reply");
  if (!t) return { result: "bad" };
  // deleted in Outlook without being sent: Albert didn't want it, so it isn't made again (Alex can write it again if
  // he asks)
  if (t.status === "drafted") await ctx.db.from("outreach_draft_texts").update({ status: "discarded", draft_id: null, draft_link: null }).eq("id", t.id);
  return { result: "noted" };
}

const HANDLERS: Record<string, (ctx: Ctx, item: Record<string, unknown>, mailbox: string | null) => Promise<Omit<ReportResult, "i">>> = {
  sent,
  incoming: (ctx, item) => incoming(ctx, item),
  followup_draft: (ctx, item) => followupDraft(ctx, item),
  followup_failed: (ctx, item) => followupFailed(ctx, item),
  draft_gone: (ctx, item) => draftGone(ctx, item),
  stale_draft: (ctx, item) => staleDraft(ctx, item),
  reply_draft: (ctx, item) => replyDraft(ctx, item),
  reply_failed: (ctx, item) => replyFailed(ctx, item),
  reply_draft_gone: (ctx, item) => replyDraftGone(ctx, item),
};

/**
 * One report call: a batch of items, in the order the drafter found them (each is safe to repeat). The first call of
 * a sync opens a run; the call with `final` closes it with the run's numbers.
 */
export async function report(db: ServiceDb, keyId: string, payload: Record<string, unknown>, owner: string | null = null) {
  const items = Array.isArray(payload.items) ? payload.items.slice(0, MAX_ITEMS) : [];
  let runId = uuid(payload.runId);
  if (!runId) {
    runId = randomUUID();
    await must(db.from("outreach_sync_runs").insert({ id: runId, key_id: keyId, started_at: iso(payload.startedAt) ?? new Date().toISOString() }), "Run not started");
  }
  const s = await deskState(db);
  const ctx: Ctx = { db, s, ignored: new Set(s.ignored.map((x) => x.internet_message_id)), owner };
  const mailbox = address(payload.mailbox);
  const results: ReportResult[] = [];
  // in time order, so a reply is matched after the email it answers
  const ordered = items
    .map((item, i) => ({ item: (item && typeof item === "object" ? item : {}) as Record<string, unknown>, i }))
    .sort((a, b) => String(a.item.sentAt ?? a.item.receivedAt ?? "").localeCompare(String(b.item.sentAt ?? b.item.receivedAt ?? "")));
  for (const { item, i } of ordered) {
    const handler = HANDLERS[String(item.type)];
    if (!handler) {
      results.push({ i, result: "bad" });
      continue;
    }
    try {
      results.push({ i, ...(await handler(ctx, item, mailbox)) });
    } catch (err) {
      results.push({ i, result: "error", error: err instanceof Error ? err.message.slice(0, 200) : "failed" });
    }
  }
  results.sort((a, b) => a.i - b.i);
  const tally: Record<string, number> = {};
  for (const r of results) tally[r.result] = (tally[r.result] ?? 0) + 1;
  if (payload.final) {
    const counts: Record<string, number> = {};
    if (payload.counts && typeof payload.counts === "object") {
      for (const [k, v] of Object.entries(payload.counts as Record<string, unknown>).slice(0, 40)) if (/^[a-z_]{1,40}$/.test(k) && Number.isFinite(Number(v))) counts[k] = Number(v);
    }
    await db.from("outreach_sync_runs").update({ finished_at: new Date().toISOString(), ok: payload.ok !== false, counts, message: str(payload.message, 300) }).eq("id", runId);
    await db.from("outreach_sync_runs").delete().lt("started_at", new Date(Date.now() - 90 * 86400_000).toISOString());
  }
  if (items.length || payload.final) await audit(null, "desk.drafter.report", { type: "outreach_sync_run", id: runId }, { items: items.length, ...tally });
  return { runId, results };
}

// ---------------------------------------------------------------------------------------------------- health

/** The desk's view of the drafter: linked or not, last used, the last few syncs. */
export async function drafterHealth(db: ServiceDb) {
  const [{ data: key }, { data: runs }] = await Promise.all([
    db.from("outreach_drafter_keys").select("id, label, key_hash, created_at, last_used_at").is("revoked_at", null).maybeSingle(),
    db.from("outreach_sync_runs").select("id, started_at, finished_at, ok, counts, message").order("started_at", { ascending: false }).limit(8),
  ]);
  const lastOk = (runs ?? []).find((r) => r.ok && r.finished_at) ?? null;
  return {
    key: key ? { id: key.id as string, label: key.label as string, fingerprint: String(key.key_hash).slice(0, 12), created_at: key.created_at as string, last_used_at: key.last_used_at as string | null } : null,
    runs: (runs ?? []) as { id: string; started_at: string; finished_at: string | null; ok: boolean; counts: Record<string, number>; message: string | null }[],
    lastOk: lastOk as { finished_at: string } | null,
  };
}

export { isWorkingDay };
