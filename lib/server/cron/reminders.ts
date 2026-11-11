import "server-only";

// The reminders job (GET /api/cron/reminders, every 15 minutes, idempotent, safe to overlap). Stage 1 sent the
// club-event reminder emails; stage 2 adds, all through the notification dispatcher (lib/server/notify):
//   - club-event reminders by each member's switches, and by text when they turned Text on (quiet hours hold texts);
//   - Open Invite plan reminders 24 hours and 2 hours before: an Update, an email and a text by the switches;
//   - chat emails (unread after 15 minutes, at most one per chat an hour, not for a muted chat);
//   - Updates older than 30 days deleted;
//   - where push is live for a member (11 Nov 2026), their reminders are phone notifications instead of emails.
// The top-level fields are stage 1's (club-event emails), so its callers and checks still read them.

import { deleteOldUpdates, runChatNudges, runEventReminders, runPlanReminders, type NudgesSummary, type PlanRemindersSummary } from "../notify/reminders";

export type RemindersSummary = {
  checked: number;
  sent24h: number;
  sent2h: number;
  /** Club-event reminders sent as phone notifications. */
  pushes: number;
  failed: number;
  skipped: number;
  eventTexts: { texts: number; textsHeld: number; textsSkipped: number; textsFailed: number };
  plans: PlanRemindersSummary;
  nudges: NudgesSummary;
  updatesDeleted: number;
};

export async function runReminders(now: Date = new Date()): Promise<RemindersSummary> {
  const events = await runEventReminders(now);
  const plans = await runPlanReminders(now);
  const nudges = await runChatNudges(now);
  const updatesDeleted = await deleteOldUpdates(now);
  return {
    checked: events.checked,
    sent24h: events.sent24h,
    sent2h: events.sent2h,
    pushes: events.pushes,
    failed: events.failed,
    skipped: events.skipped,
    eventTexts: { texts: events.texts, textsHeld: events.textsHeld, textsSkipped: events.textsSkipped, textsFailed: events.textsFailed },
    plans,
    nudges,
    updatesDeleted,
  };
}
