// A partner's timeline (Albert, 19 Nov 2026: "the timeline should only show bits of contact we have had, its getting
// cluttered at the moment with notes etc. ... group things like arranging a meeting to just one input that says
// Meeting booked (then all notes are visable one you click into it), once we have had the meeting it should then change
// to Meeting and add the meeting notes etc. to that one"; then "The arranging emails too"). Pure, no database.
//
// What is on it: every email and letter we sent, every reply, LinkedIn and WhatsApp messages, calls and meetings.
// Bounces, automatic replies and delay notices sit inside the email they answer. Notes go to their own panel and stage
// changes to the stage's history, except notes about a meeting or call, which sit inside it.
//
// A meeting or call is one item: "Meeting booked" until its time, then "Meeting" (or "Call booked", "Call"). It is an
// action point of kind meeting or call with a time (booked on the desk, by Alex, or from a call booked on a reply),
// a call or meeting logged as a touch, or, when only notes record it, the notes. Inside it: the emails that arranged it
// (every email after the partner's first reply, up to the meeting; the first email and the first reply stay on the
// timeline, as does anything still to confirm), its notes (tied to it, or about a meeting or call that day) and the
// action points that came out of it.

import type { Action, Note, Outcome, Target, Touch } from "./model";
import { ukDate } from "./rules";

export type MeetingState = "booked" | "held" | "cancelled";

export type Meeting = {
  key: string;
  kind: "meeting" | "call";
  at: string;
  state: MeetingState;
  /** The action point that booked it (null when only a logged touch or notes record it). */
  action: Action | null;
  /** A call or meeting logged as a touch ("What was said"). */
  touch: Touch | null;
  /** The emails that arranged it, oldest first. */
  emails: ContactItem[];
  notes: Note[];
  actions: Action[];
};

export type ContactItem = { type: "touch"; at: string; touch: Touch; attached: Outcome[] } | { type: "outcome"; at: string; outcome: Outcome };

export type TimelineEntry = ContactItem | { type: "meeting"; at: string; meeting: Meeting } | { type: "whatsapp"; at: string; note: Note };

export type Timeline = {
  /** Newest first. */
  entries: TimelineEntry[];
  /** Notes that aren't about a meeting or call: their own panel, newest first. */
  notes: Note[];
  meetings: Meeting[];
};

const MEETING_KINDS = new Set(["meeting", "call"]);
const OUTREACH = new Set(["first", "follow_up", "resend", "forward"]);

const at = (t: Touch) => t.sent_at ?? t.created_at;

export function buildTimeline(
  page: { target: Pick<Target, "next_call_at">; touches: Touch[]; outcomes: Outcome[]; notes: Note[]; actions: Action[] },
  now: Date = new Date(),
): Timeline {
  const nowIso = now.toISOString();
  const meetings: Meeting[] = [];

  // 1. meetings and calls booked as action points
  for (const a of page.actions) {
    if (!MEETING_KINDS.has(a.kind) || !a.starts_at) continue;
    meetings.push({
      key: `a-${a.id}`,
      kind: a.kind as Meeting["kind"],
      at: a.starts_at,
      state: a.status === "cancelled" ? "cancelled" : a.status === "open" && a.starts_at > nowIso ? "booked" : "held",
      action: a,
      touch: null,
      emails: [],
      notes: [],
      actions: [],
    });
  }
  // an older "next call" with no action point behind it
  const nextCall = page.target.next_call_at;
  if (nextCall && !meetings.some((m) => m.at === nextCall)) {
    meetings.push({
      key: "next-call",
      kind: "call",
      at: nextCall,
      state: nextCall > nowIso ? "booked" : "held",
      action: null,
      touch: null,
      emails: [],
      notes: [],
      actions: [],
    });
  }
  const live = () => meetings.filter((m) => m.state !== "cancelled");
  const sameDay = (iso: string, list = live()) => {
    const day = ukDate(iso);
    const t = new Date(iso).getTime();
    return list.filter((m) => ukDate(m.at) === day).sort((a, b) => Math.abs(new Date(a.at).getTime() - t) - Math.abs(new Date(b.at).getTime() - t))[0];
  };

  // 2. calls and meetings logged as touches: the booking that day, else their own item
  const touchRows: Touch[] = [];
  for (const t of page.touches) {
    if ((t.channel === "call" || t.channel === "in_person") && t.status !== "unconfirmed") {
      const m = sameDay(
        at(t),
        live().filter((x) => !x.touch),
      );
      if (m) m.touch = t;
      else
        meetings.push({
          key: `t-${t.id}`,
          kind: t.channel === "call" ? "call" : "meeting",
          at: at(t),
          state: "held",
          action: null,
          touch: t,
          emails: [],
          notes: [],
          actions: [],
        });
      continue;
    }
    touchRows.push(t);
  }

  // 3. notes: tied to a meeting, or about a meeting or call that day; WhatsApp notes are contact; the rest, the panel
  const panel: Note[] = [];
  const whatsapp: Note[] = [];
  for (const n of [...page.notes].sort((a, b) => a.happened_at.localeCompare(b.happened_at))) {
    const tied = n.meeting_id ? meetings.find((m) => m.action?.id === n.meeting_id) : undefined;
    if (tied) {
      tied.notes.push(n);
      continue;
    }
    if (n.kind === "meeting" || n.kind === "call") {
      const m = sameDay(n.happened_at);
      if (m) m.notes.push(n);
      // the notes are the only record that it happened
      else meetings.push({ key: `n-${n.id}`, kind: n.kind, at: n.happened_at, state: "held", action: null, touch: null, emails: [], notes: [n], actions: [] });
      continue;
    }
    if (n.kind === "whatsapp") whatsapp.push(n);
    else panel.push(n);
  }

  // 4. action points that came out of a meeting (tied to it, or to one of its notes)
  for (const a of page.actions) {
    if (MEETING_KINDS.has(a.kind) && a.starts_at) continue;
    const m =
      (a.meeting_id ? meetings.find((x) => x.action?.id === a.meeting_id) : undefined) ??
      (a.note_id ? meetings.find((x) => x.notes.some((n) => n.id === a.note_id)) : undefined);
    if (m) m.actions.push(a);
  }

  // 5. emails: bounces, automatic replies and delay notices inside the email they answer
  const items = new Map<string, ContactItem>();
  for (const t of touchRows) items.set(`t-${t.id}`, { type: "touch", at: at(t), touch: t, attached: [] });
  const emailsBefore = (o: Outcome) =>
    touchRows
      .filter((t) => t.channel === "email" && at(t) <= o.received_at && (!o.sequence_id || t.sequence_id === o.sequence_id))
      .sort((a, b) => at(b).localeCompare(at(a)))[0];
  const outcomeRows: Outcome[] = [];
  for (const o of page.outcomes) {
    if (o.confirmed && (o.kind === "bounce" || o.kind === "auto_reply" || o.kind === "delay")) {
      const t = (o.touch_id ? touchRows.find((x) => x.id === o.touch_id) : undefined) ?? emailsBefore(o);
      const item = t ? items.get(`t-${t.id}`) : undefined;
      if (item && item.type === "touch") {
        item.attached.push(o);
        continue;
      }
    }
    outcomeRows.push(o);
  }
  for (const o of outcomeRows) items.set(`o-${o.id}`, { type: "outcome", at: o.received_at, outcome: o });

  // 6. the emails that arranged each meeting: after the first reply, up to the meeting
  const firstReply = page.outcomes.filter((o) => o.kind === "reply" && o.confirmed).sort((a, b) => a.received_at.localeCompare(b.received_at))[0];
  const ahead = live().sort((a, b) => a.at.localeCompare(b.at));
  if (firstReply && ahead.length) {
    for (const [key, item] of [...items].sort((a, b) => a[1].at.localeCompare(b[1].at))) {
      if (item.at <= firstReply.received_at) continue;
      if (item.type === "touch") {
        const t = item.touch;
        if (t.status === "unconfirmed" || t.channel !== "email" || OUTREACH.has(t.kind)) continue;
      } else {
        const o = item.outcome;
        if (!o.confirmed || o.id === firstReply.id || o.kind === "opt_out_request") continue;
      }
      const m = ahead.find((x) => x.at >= item.at);
      if (!m) continue;
      m.emails.push(item);
      items.delete(key);
    }
  }

  const entries: TimelineEntry[] = [
    ...items.values(),
    ...meetings.map((m) => ({ type: "meeting" as const, at: m.at, meeting: m })),
    ...whatsapp.map((n) => ({ type: "whatsapp" as const, at: n.happened_at, note: n })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  for (const m of meetings) {
    m.emails.sort((a, b) => a.at.localeCompare(b.at));
    m.notes.sort((a, b) => a.happened_at.localeCompare(b.happened_at));
  }
  return { entries, notes: panel.reverse(), meetings };
}

/** "Meeting booked", "Call", "Meeting cancelled". */
export function meetingWords(m: Pick<Meeting, "kind" | "state">): string {
  const k = m.kind === "call" ? "Call" : "Meeting";
  return m.state === "booked" ? `${k} booked` : m.state === "cancelled" ? `${k} cancelled` : k;
}
