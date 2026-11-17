// The Outreach Desk's numbers and lists, worked out from the rows (17 Nov 2026). Pure functions, no database: the
// desk loads every row (a few hundred) and these turn them into the KPI strip, Due today, the blotter and the
// Today page. The definitions follow the plan's section 6 (docs/plans/outreach-desk.md): rates count sequences, a
// sequence is delivered when an address in it wasn't refused (or a letter was posted, a call made), and every rate
// carries its counts.

import {
  CALL_OR_LATER,
  OUTREACH_KINDS,
  type Action,
  type Contact,
  type DraftText,
  type Followup,
  type Outcome,
  type Source,
  type StageChange,
  type Target,
  type Touch,
} from "./model";
import { addDays, effectiveDue, ukDate, workingDaysBetween } from "./rules";

export type DeskData = {
  targets: Target[];
  contacts: Contact[];
  touches: Touch[];
  outcomes: Outcome[];
  followups: Followup[];
  actions: Action[];
  stageHistory: StageChange[];
  /** Follow-up texts (Phase 2); absent in the older tests' data. */
  texts?: DraftText[];
};

/** A touch that counts as outreach sent: first, follow-up, resend or forward, sent or posted, counted in stats. */
export function isOutreachSent(t: Touch): boolean {
  return t.counts_in_stats && OUTREACH_KINDS.includes(t.kind) && (t.status === "sent" || t.status === "posted") && !!t.sent_at;
}

/** An email touch where every address was refused. */
export function allBounced(t: Touch): boolean {
  return t.channel === "email" && t.recipients.length > 0 && t.recipients.every((r) => r.delivery === "bounced");
}

export type Sequence = {
  id: string;
  targetId: string;
  first: Touch;
  touches: Touch[];
  startedOn: string;
  delivered: boolean;
  firstReply: Outcome | null;
};

export function sequencesOf(data: DeskData): Sequence[] {
  const bySeq = new Map<string, Touch[]>();
  for (const t of data.touches) {
    if (!isOutreachSent(t)) continue;
    const list = bySeq.get(t.sequence_id) ?? [];
    list.push(t);
    bySeq.set(t.sequence_id, list);
  }
  const replies = data.outcomes
    .filter((o) => o.kind === "reply" && o.confirmed && o.sequence_id)
    .sort((a, b) => a.received_at.localeCompare(b.received_at));
  const out: Sequence[] = [];
  for (const [id, touches] of bySeq) {
    touches.sort((a, b) => (a.sent_at ?? "").localeCompare(b.sent_at ?? ""));
    const first = touches.find((t) => t.kind === "first") ?? touches[0];
    out.push({
      id,
      targetId: first.target_id,
      first,
      touches,
      startedOn: ukDate(first.sent_at!),
      delivered: touches.some((t) => !allBounced(t)),
      firstReply: replies.find((o) => o.sequence_id === id) ?? null,
    });
  }
  return out.sort((a, b) => a.startedOn.localeCompare(b.startedOn));
}

/** The Monday of the UK week holding `today`. */
export function weekStart(today: string): string {
  const day = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addDays(today, -((day + 6) % 7));
}

export type Kpis = {
  sentThisWeek: number;
  sentLastWeek: number;
  sentByChannel: Record<string, number>;
  delivered: number;
  replied: number;
  positive: number;
  callsBooked: number;
  nextCall: { at: string; targetId: string; name: string } | null;
  live: number;
  agreed: number;
  due: number;
  late: number;
};

export function kpis(data: DeskData, now: Date = new Date()): Kpis {
  const today = ukDate(now);
  const monday = weekStart(today);
  const lastMonday = addDays(monday, -7);
  let sentThisWeek = 0;
  let sentLastWeek = 0;
  const sentByChannel: Record<string, number> = {};
  for (const t of data.touches) {
    if (!isOutreachSent(t)) continue;
    const d = ukDate(t.sent_at!);
    if (d >= monday && d <= today) {
      sentThisWeek += 1;
      sentByChannel[t.channel] = (sentByChannel[t.channel] ?? 0) + 1;
    } else if (d >= lastMonday && d < monday) sentLastWeek += 1;
  }
  const seqs = sequencesOf(data).filter((s) => s.delivered);
  const replied = seqs.filter((s) => s.firstReply).length;
  const positive = seqs.filter((s) => s.firstReply?.sentiment === "positive").length;

  const reachedCall = new Set(data.stageHistory.filter((h) => CALL_OR_LATER.includes(h.to_stage as never)).map((h) => h.target_id));
  for (const t of data.targets) if (CALL_OR_LATER.includes(t.stage)) reachedCall.add(t.id);
  const nowIso = now.toISOString();
  const upcoming = data.targets
    .filter((t) => t.next_call_at && t.next_call_at >= nowIso)
    .sort((a, b) => a.next_call_at!.localeCompare(b.next_call_at!));

  let due = 0;
  let late = 0;
  for (const f of data.followups) {
    if (f.status !== "scheduled" && f.status !== "drafted") continue;
    const when = effectiveDue(f.due_on, f.snoozed_until);
    if (when <= today) due += 1;
    if (when < today) late += 1;
  }
  return {
    sentThisWeek,
    sentLastWeek,
    sentByChannel,
    delivered: seqs.length,
    replied,
    positive,
    callsBooked: reachedCall.size,
    nextCall: upcoming[0] ? { at: upcoming[0].next_call_at!, targetId: upcoming[0].id, name: upcoming[0].name } : null,
    live: data.targets.filter((t) => t.stage === "live").length,
    agreed: data.targets.filter((t) => t.stage === "agreed").length,
    due,
    late,
  };
}

/** Who a follow-up goes to: the sequence's To and Cc addresses that neither bounced nor opted out. */
export function followupAddresses(data: DeskData, f: Followup): { to: string[]; cc: string[] } {
  const contacts = new Map(data.contacts.map((c) => [c.id, c]));
  const optedOut = (address: string | null, contactId: string | null) =>
    (contactId && contacts.get(contactId)?.opted_out) ||
    (address && data.contacts.some((c) => c.email === address && c.opted_out));
  const emails = data.touches.filter((t) => t.sequence_id === f.sequence_id && t.channel === "email" && OUTREACH_KINDS.includes(t.kind));
  const to = new Set<string>();
  const cc = new Set<string>();
  // the newest email's recipients (a resend replaces the addresses that bounced)
  const latest = emails.sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""))[0];
  for (const r of latest?.recipients ?? []) {
    if (!r.address || r.delivery === "bounced" || optedOut(r.address, r.contact_id)) continue;
    (r.role === "cc" ? cc : to).add(r.address);
  }
  if (to.size === 0) {
    // a letter first, or everything bounced: the target's primary contact with an email, then any contact
    const pool = data.contacts
      .filter((c) => c.target_id === f.target_id && c.email && c.email_status !== "bounced" && !c.opted_out)
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
    if (pool[0]?.email) to.add(pool[0].email);
  }
  return { to: [...to], cc: [...cc].filter((a) => !to.has(a)) };
}

export type DueItem =
  | {
      kind: "followup";
      id: string;
      targetId: string;
      name: string;
      step: number;
      due: string;
      late: boolean;
      drafted: boolean;
      to: string[];
      cc: string[];
      needsEmail: boolean;
      stale: boolean;
      /** Phase 2: are its words written, and the draft made in Outlook? */
      text: "none" | "written" | "drafted";
      draftLink: string | null;
      draftError: string | null;
    }
  | { kind: "action"; id: string; targetId: string; name: string; title: string; actionKind: string; due: string; late: boolean; startsAt: string | null }
  | { kind: "call"; targetId: string; name: string; at: string };

/** Everything due on `today` or late: follow-ups, open action points, and calls today. */
export function dueItems(data: DeskData, now: Date = new Date(), through?: string): DueItem[] {
  const today = ukDate(now);
  const until = through ?? today;
  const names = new Map(data.targets.map((t) => [t.id, t.name]));
  const items: DueItem[] = [];
  for (const f of data.followups) {
    if (f.status !== "scheduled" && f.status !== "drafted") continue;
    const due = effectiveDue(f.due_on, f.snoozed_until);
    if (due > until) continue;
    const { to, cc } = followupAddresses(data, f);
    items.push({
      kind: "followup",
      id: f.id,
      targetId: f.target_id,
      name: names.get(f.target_id) ?? "",
      step: f.step,
      due,
      late: due < today,
      drafted: f.status === "drafted",
      to,
      cc,
      needsEmail: f.channel === "email" && to.length === 0,
      stale: f.stale_draft,
      text: f.status === "drafted" ? "drafted" : (data.texts ?? []).some((x) => x.followup_id === f.id && x.status !== "discarded") ? "written" : "none",
      draftLink: f.draft_link ?? null,
      draftError: f.draft_error ?? null,
    });
  }
  for (const a of data.actions) {
    if (a.status !== "open") continue;
    const due = a.starts_at ? ukDate(a.starts_at) : a.due_on;
    if (!due || due > until) continue;
    items.push({ kind: "action", id: a.id, targetId: a.target_id, name: names.get(a.target_id) ?? "", title: a.title, actionKind: a.kind, due, late: due < today, startsAt: a.starts_at });
  }
  for (const t of data.targets) {
    if (!t.next_call_at) continue;
    const day = ukDate(t.next_call_at);
    if (day >= today && day <= until && !data.actions.some((a) => a.target_id === t.id && a.status === "open" && a.kind === "call" && a.starts_at === t.next_call_at)) {
      items.push({ kind: "call", targetId: t.id, name: t.name, at: t.next_call_at });
    }
  }
  const order = (i: DueItem) => (i.kind === "call" ? `${ukDate(i.at)}~${i.at}` : i.kind === "action" && i.startsAt ? `${i.due}~${i.startsAt}` : `${i.due}`);
  return items.sort((a, b) => order(a).localeCompare(order(b)));
}

/** How long a reply took: hours under 48, otherwise working days ("7.5 h", "3 wd"). */
export function replyTimeWords(fromIso: string, toIso: string): string {
  const seconds = (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000;
  if (seconds < 0) return "-";
  if (seconds < 48 * 3600) return `${Math.round((seconds / 3600) * 10) / 10} h`;
  return `${workingDaysBetween(ukDate(fromIso), ukDate(toIso))} wd`;
}

export type BlotterFilters = {
  channel?: string;
  stage?: string;
  category?: string;
  source?: string;
  since?: string;
  q?: string;
  conversation?: boolean;
  sort?: "sent" | "target" | "status";
  dir?: "asc" | "desc";
};

export type BlotterRow = {
  id: string;
  targetId: string;
  name: string;
  sentAt: string | null;
  channel: Touch["channel"];
  kind: Touch["kind"];
  step: number | null;
  to: string;
  more: number;
  source: Source | null;
  status: "replied" | "bounced" | "oof" | Touch["status"];
  sentiment: Outcome["sentiment"];
  reply: string;
  days: number | null;
  stage: Target["stage"];
  next: { due: string; step: number; late: boolean } | null;
  paused: boolean;
};

export function blotterRows(data: DeskData, filters: BlotterFilters = {}, now: Date = new Date()): BlotterRow[] {
  const today = ukDate(now);
  const targets = new Map(data.targets.map((t) => [t.id, t]));
  const contacts = new Map(data.contacts.map((c) => [c.id, c]));
  const q = filters.q?.trim().toLowerCase();
  const rows: BlotterRow[] = [];
  for (const t of data.touches) {
    if (t.status === "cancelled") continue;
    if (t.kind === "conversation" && !filters.conversation) continue;
    const target = targets.get(t.target_id);
    if (!target) continue;
    const toRows = t.recipients.filter((r) => r.role === "to");
    const firstTo = toRows[0] ?? t.recipients[0];
    const contact = firstTo?.contact_id ? contacts.get(firstTo.contact_id) : undefined;
    const to = firstTo?.address ?? contact?.name ?? contact?.email ?? "";
    const outcomes = data.outcomes.filter((o) => o.touch_id === t.id && o.confirmed).sort((a, b) => a.received_at.localeCompare(b.received_at));
    const reply = outcomes.find((o) => o.kind === "reply");
    const bounce = outcomes.find((o) => o.kind === "bounce");
    const oof = outcomes.find((o) => o.kind === "auto_reply");
    const status: BlotterRow["status"] = reply ? "replied" : allBounced(t) ? "bounced" : oof ? "oof" : t.status;
    const replyWords = reply && t.sent_at ? replyTimeWords(t.sent_at, reply.received_at) : allBounced(t) ? (bounce?.bounce_code ?? t.recipients.find((r) => r.bounce_code)?.bounce_code ?? "bounced") : oof ? "OOF" : "";
    const days = t.sent_at && (t.status === "sent" || t.status === "posted")
      ? workingDaysBetween(ukDate(t.sent_at), reply ? ukDate(reply.received_at) : today)
      : null;
    const open = data.followups
      .filter((f) => f.sequence_id === t.sequence_id && (f.status === "scheduled" || f.status === "drafted"))
      .map((f) => ({ due: effectiveDue(f.due_on, f.snoozed_until), step: f.step }))
      .sort((a, b) => a.due.localeCompare(b.due))[0];
    const row: BlotterRow = {
      id: t.id,
      targetId: target.id,
      name: target.name,
      sentAt: t.sent_at,
      channel: t.channel,
      kind: t.kind,
      step: t.step,
      to,
      more: Math.max(0, t.recipients.length - 1),
      source: contact?.email_source ?? null,
      status,
      sentiment: reply?.sentiment ?? null,
      reply: replyWords,
      days,
      stage: target.stage,
      next: open ? { ...open, late: open.due < today } : null,
      paused: !open && data.followups.some((f) => f.sequence_id === t.sequence_id && f.status === "paused"),
    };
    if (filters.channel && row.channel !== filters.channel) continue;
    if (filters.stage && row.stage !== filters.stage) continue;
    if (filters.category && target.category !== filters.category) continue;
    if (filters.source && row.source !== filters.source) continue;
    if (filters.since && (!row.sentAt || ukDate(row.sentAt) < filters.since)) continue;
    if (q && !target.name.toLowerCase().includes(q) && !(target.group_name ?? "").toLowerCase().includes(q) && !row.to.toLowerCase().includes(q)) continue;
    rows.push(row);
  }
  const dir = filters.dir === "asc" ? 1 : -1;
  const key = filters.sort ?? "sent";
  rows.sort((a, b) => {
    const by =
      key === "target" ? a.name.localeCompare(b.name) : key === "status" ? a.status.localeCompare(b.status) : (a.sentAt ?? "").localeCompare(b.sentAt ?? "");
    return by * dir || (b.sentAt ?? "").localeCompare(a.sentAt ?? "");
  });
  return rows;
}
