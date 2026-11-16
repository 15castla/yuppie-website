import "server-only";

// The Outreach Desk's reads and its follow-up engine (17 Nov 2026). Service role only: every caller has already
// checked the owner (requireOwner()). The rules: lib/server/outreach/rules.ts; the numbers: compute.ts.

import { serviceDb, type ServiceDb } from "@/lib/server/db";
import type { DeskData } from "./compute";
import {
  BEFORE_CONTACT,
  type Action,
  type Contact,
  type Followup,
  type Note,
  type Outcome,
  type Recipient,
  type Stage,
  type StageChange,
  type Target,
  type Touch,
} from "./model";
import { JANUARY_ROUND, followUpDue, januaryDay, ukDate } from "./rules";

const TOUCH_COLUMNS =
  "id, target_id, sequence_id, channel, kind, step, status, subject, version, attachment, file_ref, body_text, sent_at, letter_posted_on, letter_class, web_link, counts_in_stats, signed_by, created_by, note, created_at";
const OUTCOME_COLUMNS =
  "id, target_id, sequence_id, touch_id, contact_id, kind, channel, sentiment, received_at, from_address, from_name, subject, body_text, summary, bounced_address, bounce_code, web_link, confirmed, is_first_reply, reply_seconds, created_at";

async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`Desk read failed: ${error.message}`);
  return (data ?? []) as T[];
}

function withRecipients(touches: Omit<Touch, "recipients">[], recipients: Recipient[]): Touch[] {
  const byTouch = new Map<string, Recipient[]>();
  for (const r of recipients) {
    const list = byTouch.get(r.touch_id) ?? [];
    list.push(r);
    byTouch.set(r.touch_id, list);
  }
  return touches.map((t) => ({ ...t, recipients: (byTouch.get(t.id) ?? []).sort((a, b) => (a.role === b.role ? 0 : a.role === "to" ? -1 : 1)) }));
}

/** Every desk row the home page, the Today page and the numbers need (a few hundred rows at most for now). */
export async function loadDesk(db: ServiceDb = serviceDb()): Promise<DeskData> {
  const [targets, contacts, touches, recipients, outcomes, followups, actions, stageHistory] = await Promise.all([
    rows<Target>(db.from("outreach_targets").select("*").order("name").limit(5000)),
    rows<Contact>(db.from("outreach_contacts").select("*").limit(10000)),
    rows<Omit<Touch, "recipients">>(db.from("outreach_touches").select(TOUCH_COLUMNS).order("sent_at", { ascending: false, nullsFirst: false }).limit(20000)),
    rows<Recipient>(db.from("outreach_touch_recipients").select("*").limit(40000)),
    rows<Outcome>(db.from("outreach_outcomes").select(OUTCOME_COLUMNS).limit(20000)),
    rows<Followup>(db.from("outreach_followups").select("*").limit(20000)),
    rows<Action>(db.from("outreach_actions").select("*").limit(20000)),
    rows<StageChange>(db.from("outreach_stage_history").select("*").limit(20000)),
  ]);
  return { targets, contacts, touches: withRecipients(touches, recipients), outcomes, followups, actions, stageHistory };
}

export type TargetPage = DeskData & { target: Target; notes: Note[] };

/** One partner, with everything about them. Null when there is no such partner. */
export async function loadTarget(id: string, db: ServiceDb = serviceDb()): Promise<TargetPage | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data: target, error } = await db.from("outreach_targets").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Desk read failed: ${error.message}`);
  if (!target) return null;
  const [contacts, touches, outcomes, followups, actions, stageHistory, notes] = await Promise.all([
    rows<Contact>(db.from("outreach_contacts").select("*").eq("target_id", id).order("created_at")),
    rows<Omit<Touch, "recipients">>(db.from("outreach_touches").select(TOUCH_COLUMNS).eq("target_id", id)),
    rows<Outcome>(db.from("outreach_outcomes").select(OUTCOME_COLUMNS).eq("target_id", id)),
    rows<Followup>(db.from("outreach_followups").select("*").eq("target_id", id)),
    rows<Action>(db.from("outreach_actions").select("*").eq("target_id", id)),
    rows<StageChange>(db.from("outreach_stage_history").select("*").eq("target_id", id).order("at", { ascending: false })),
    rows<Note>(db.from("outreach_notes").select("*").eq("target_id", id).order("happened_at", { ascending: false })),
  ]);
  const touchIds = touches.map((t) => t.id);
  const recipients = touchIds.length ? await rows<Recipient>(db.from("outreach_touch_recipients").select("*").in("touch_id", touchIds)) : [];
  return {
    target: target as Target,
    targets: [target as Target],
    contacts,
    touches: withRecipients(touches, recipients),
    outcomes,
    followups,
    actions,
    stageHistory,
    notes,
  };
}

// ---------------------------------------------------------------------------------------------- the engine

async function must(query: PromiseLike<{ error: { message: string } | null }>, what: string): Promise<void> {
  const { error } = await query;
  if (error) throw new Error(`${what}: ${error.message}`);
}

/**
 * Moves a target to a stage and records it in the stage history (nothing when it is already there). `at` is when it
 * happened (a backdated email, or the history the import replays), now by default.
 */
export async function setStage(db: ServiceDb, target: Pick<Target, "id" | "stage">, to: Stage, by = "albert", note: string | null = null, at = new Date().toISOString()): Promise<void> {
  if (target.stage === to) return;
  await must(db.from("outreach_targets").update({ stage: to, stage_at: at }).eq("id", target.id), "Stage not saved");
  await must(db.from("outreach_stage_history").insert({ target_id: target.id, from_stage: target.stage, to_stage: to, at, by, note }), "Stage history not saved");
}

/** How many January emails each day of the round already holds. */
async function januaryLoad(db: ServiceDb): Promise<Record<string, number>> {
  const list = await rows<{ due_on: string }>(
    db.from("outreach_followups").select("due_on").eq("step", 2).in("status", ["scheduled", "drafted", "done"]).in("due_on", [...JANUARY_ROUND]),
  );
  const load: Record<string, number> = {};
  for (const r of list) load[r.due_on] = (load[r.due_on] ?? 0) + 1;
  return load;
}

const OPEN = ["scheduled", "drafted", "paused"];

/**
 * After an outreach touch went out (sent or posted). A first touch (or a resend after every address bounced)
 * schedules the follow-up: 7 working days after an email, 10 after a letter. The follow-up going out schedules the
 * January email; the January email going out closes the sequence's follow-ups. Also moves a target that hadn't been
 * contacted to Contacted.
 */
export async function afterOutreachTouch(
  db: ServiceDb,
  touch: Pick<Touch, "id" | "target_id" | "sequence_id" | "channel" | "kind" | "step" | "sent_at">,
  target: Pick<Target, "id" | "stage" | "do_not_follow_up" | "opted_out">,
  by = "albert",
): Promise<void> {
  if (!touch.sent_at) return;
  const sentOn = ukDate(touch.sent_at);
  if (BEFORE_CONTACT.includes(target.stage)) await setStage(db, target, "contacted", by, null, touch.sent_at);
  const existing = await rows<Followup>(db.from("outreach_followups").select("*").eq("sequence_id", touch.sequence_id));
  const step1 = existing.find((f) => f.step === 1);
  const step2 = existing.find((f) => f.step === 2);
  const followUps = !target.do_not_follow_up && !target.opted_out;

  if (touch.kind === "first") {
    if (followUps && !step1) {
      await must(
        db.from("outreach_followups").insert({ target_id: touch.target_id, sequence_id: touch.sequence_id, step: 1, channel: "email", due_on: followUpDue(touch.channel, sentOn) }),
        "Follow-up not scheduled",
      );
    }
    return;
  }
  if (touch.kind === "resend") {
    // a resend after the first addresses bounced starts the follow-up clock again
    if (step1 && (step1.status === "paused" || step1.status === "scheduled") && step1.reason !== "replied") {
      await must(
        db.from("outreach_followups").update({ due_on: followUpDue("email", sentOn), status: followUps ? "scheduled" : step1.status, reason: null, snoozed_until: null }).eq("id", step1.id),
        "Follow-up not moved",
      );
    } else if (!step1 && followUps) {
      await must(
        db.from("outreach_followups").insert({ target_id: touch.target_id, sequence_id: touch.sequence_id, step: 1, channel: "email", due_on: followUpDue("email", sentOn) }),
        "Follow-up not scheduled",
      );
    }
    return;
  }
  if (touch.kind === "follow_up" && touch.step === 1) {
    if (step1) await must(db.from("outreach_followups").update({ status: "done", touch_id: touch.id, stale_draft: false }).eq("id", step1.id), "Follow-up not closed");
    if (followUps && !step2) {
      const day = januaryDay(sentOn, await januaryLoad(db));
      if (day) {
        await must(
          db.from("outreach_followups").insert({ target_id: touch.target_id, sequence_id: touch.sequence_id, step: 2, channel: "email", due_on: day }),
          "January email not scheduled",
        );
      }
    }
    return;
  }
  if (touch.kind === "follow_up" && touch.step === 2 && step2) {
    await must(db.from("outreach_followups").update({ status: "done", touch_id: touch.id, stale_draft: false }).eq("id", step2.id), "January email not closed");
  }
}

/** The step a follow-up touch fulfils: the lowest one still open in its sequence (1, else 2). */
export async function nextStep(db: ServiceDb, sequenceId: string): Promise<1 | 2> {
  const list = await rows<Followup>(db.from("outreach_followups").select("step, status").eq("sequence_id", sequenceId));
  const step1 = list.find((f) => f.step === 1);
  return step1 && OPEN.includes(step1.status) ? 1 : step1 ? 2 : 1;
}

/** Stops a target's follow-ups: a reply (only that sequence), an opt-out (all of them). Drafts made become stale. */
export async function stopFollowups(db: ServiceDb, targetId: string, reason: "replied" | "opted_out" | "manual", sequenceId?: string | null): Promise<void> {
  let query = db.from("outreach_followups").select("*").eq("target_id", targetId).in("status", OPEN);
  if (sequenceId) query = query.eq("sequence_id", sequenceId);
  const open = await rows<Followup>(query);
  for (const f of open) {
    await must(
      db.from("outreach_followups").update({ status: "cancelled", reason, stale_draft: f.status === "drafted" }).eq("id", f.id),
      "Follow-up not stopped",
    );
  }
}

/** After a confirmed reply: the first in its sequence gets its reply time, the follow-ups stop, Contacted becomes Replied. */
export async function afterReply(db: ServiceDb, outcome: Pick<Outcome, "id" | "target_id" | "sequence_id" | "touch_id" | "received_at">, target: Pick<Target, "id" | "stage">, by = "albert"): Promise<void> {
  if (outcome.sequence_id) {
    const earlier = await rows<{ id: string }>(
      db.from("outreach_outcomes").select("id").eq("sequence_id", outcome.sequence_id).eq("kind", "reply").eq("confirmed", true).eq("is_first_reply", true).neq("id", outcome.id),
    );
    if (earlier.length === 0) {
      let seconds: number | null = null;
      if (outcome.touch_id) {
        const { data } = await db.from("outreach_touches").select("sent_at").eq("id", outcome.touch_id).maybeSingle();
        if (data?.sent_at) seconds = Math.max(0, Math.round((new Date(outcome.received_at).getTime() - new Date(data.sent_at).getTime()) / 1000));
      }
      await must(db.from("outreach_outcomes").update({ is_first_reply: true, reply_seconds: seconds }).eq("id", outcome.id), "Reply not marked");
    }
  }
  await stopFollowups(db, outcome.target_id, "replied", outcome.sequence_id);
  if (target.stage === "contacted" || BEFORE_CONTACT.includes(target.stage)) await setStage(db, target, "replied", by, null, outcome.received_at);
}

/** After a bounce: the address is marked bounced; when every address in the sequence bounced, its follow-ups wait. */
export async function afterBounce(db: ServiceDb, targetId: string, sequenceId: string | null, address: string | null, code: string | null, at: string): Promise<void> {
  if (address) {
    await must(db.from("outreach_contacts").update({ email_status: "bounced" }).eq("target_id", targetId).eq("email", address), "Contact not marked");
    if (sequenceId) {
      const touches = await rows<{ id: string }>(db.from("outreach_touches").select("id").eq("sequence_id", sequenceId).eq("channel", "email"));
      if (touches.length) {
        await must(
          db.from("outreach_touch_recipients").update({ delivery: "bounced", bounced_at: at, bounce_code: code }).in("touch_id", touches.map((t) => t.id)).eq("address", address),
          "Recipient not marked",
        );
      }
    }
  }
  if (!sequenceId) return;
  const touches = await rows<{ id: string }>(db.from("outreach_touches").select("id").eq("sequence_id", sequenceId).eq("channel", "email").in("kind", ["first", "follow_up", "resend", "forward"]));
  if (touches.length === 0) return;
  const recipients = await rows<Recipient>(db.from("outreach_touch_recipients").select("*").in("touch_id", touches.map((t) => t.id)));
  if (recipients.length && recipients.every((r) => r.delivery === "bounced")) {
    const open = await rows<Followup>(db.from("outreach_followups").select("*").eq("sequence_id", sequenceId).eq("status", "scheduled"));
    for (const f of open) await must(db.from("outreach_followups").update({ status: "paused", reason: "bounced" }).eq("id", f.id), "Follow-up not paused");
  }
}
