// Which Settings rows You shows, and what they say. Each row belongs to an
// area that is switched off at launch (Notifications, Payments, Messages),
// so a row appears only when its flag is on. The summaries need those areas'
// data, which has no backend yet: until it does they come from the example
// adapter (lib/members/mock/you-settings.ts), which is not used on the
// live site (Vercel production) unless MEMBERS_SHOW_EXAMPLES=on, so a flag
// set there by mistake shows no rows rather than made-up ones.

import type { Flags } from "@/lib/members/flags";
import { isMockAllowed } from "@/lib/members/mock/guard";
import { marksExamples } from "@/lib/members/mock/marking";
import { exampleSettingsSummaries } from "@/lib/members/mock/you-settings";
import { ROUTES } from "@/lib/members/routes";
import type { ShellMode } from "@/components/members/shell/types";
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

// The live page's rows: none while there is no real data for them.
export function settingsRowsFor(flags: Pick<Flags, "notifications" | "paidPlans" | "messages">, mode: ShellMode): SettingsRow[] {
  const anyOn = flags.notifications || flags.paidPlans || flags.messages;
  if (!anyOn || !isMockAllowed()) return [];
  // The summaries are invented stand-ins ("Push, email", "Get paid: not set up"), and You is a real page that carries
  // no example note, so on the live page each row says what it is instead of a made-up status (the preview harness
  // calls buildSettingsRows directly and keeps the approved summaries).
  const rows = buildSettingsRows(flags, exampleSettingsSummaries(mode));
  // NEXT_PUBLIC_MEMBERS_MARK_EXAMPLES=off (mock/marking.ts) keeps the approved summaries, as in the preview harness.
  return marksExamples() ? rows.map((row) => ({ ...row, lines: ["Example screen"], warn: false })) : rows;
}
