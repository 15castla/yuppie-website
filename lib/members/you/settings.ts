// Which Settings rows You shows, and what they say. Each row belongs to an
// area behind a switch (Notifications, Payments, Messages), so a row appears
// only when its flag is on and it has a summary. Stage 2: the summaries are
// real (app/members/you/load-you.ts: the notification channels and the
// blocked count); Payments has none until paid plans are live (stage 3), so
// it shows no row. The preview harness passes the design's summaries.

import type { Flags } from "@/lib/members/flags";
import { ROUTES } from "@/lib/members/routes";
import type { SettingsRow, SettingsSummaries } from "./types";

export function blockedSummary(count: number): string {
  if (count === 0) return "None";
  return count === 1 ? "1 person" : `${count} people`;
}

// Pure: the rows for a set of flags and summaries (the preview uses this
// too). A row needs its flag on AND a summary to show.
export function buildSettingsRows(flags: Pick<Flags, "notifications" | "paidPlans" | "messages">, summaries: SettingsSummaries | null): SettingsRow[] {
  if (!summaries) return [];
  const rows: SettingsRow[] = [];
  if (flags.notifications && summaries.notifications) {
    rows.push({
      key: "notifications",
      title: "Notifications",
      href: ROUTES.youNotifications,
      lines: [summaries.notifications.summary],
      warn: summaries.notifications.warn,
    });
  }
  if (flags.paidPlans && summaries.payments) {
    rows.push({ key: "payments", title: "Payments", href: ROUTES.youPayments, lines: summaries.payments.lines, warn: summaries.payments.warn });
  }
  if (flags.messages && summaries.blocked !== null) {
    rows.push({ key: "blocked", title: "Blocked members", href: ROUTES.youBlocked, lines: [blockedSummary(summaries.blocked)] });
  }
  return rows;
}
