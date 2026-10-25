// What the You page draws, as plain data (BUILD_BRIEF 6: types first). The
// page file fetches the real member and the real billing date and builds
// these; the view is a pure component of them, so the preview harness can
// draw every state with no login and no database.
//
// Real today: the member's details, "active", "paused" and "cancelled" (the
// three membership_status values), the next billing date from Stripe, and
// the two actions that exist (Cancel membership, Log out).
// NEEDS BACKEND (drawn, never built by the live page): "ending" (the
// subscription is set to cancel at period end; nothing flips the status or
// reads it back), "problem" (a failed payment; the Stripe webhook only
// handles event payments), the card's own actions (Manage and Update card
// need a Stripe billing page link; Keep my membership needs an undo for the
// cancel), and the three Settings summaries (notification channels, Get paid
// status, the blocked list) which have no data until Notifications, Payments
// and Messages have a backend.

export type MembershipState = "active" | "ending" | "problem" | "paused" | "cancelled";

export type MembershipCardData = {
  state: MembershipState;
  /** "12 Nov". The next billing date, when Stripe gave one. */
  renews?: string | null;
  /** "12 Nov". When a cancelled membership ends (the ending state). */
  endsOn?: string | null;
  /** "12 Nov". The payment that failed (the problem state). */
  failedOn?: string | null;
  /** "15 Nov". Update the card by this date (the problem state). */
  updateBy?: string | null;
  /** The one button in the card ("Manage", "Keep my membership", "Update card"). Only the preview sets it: no live code supports any of them yet. */
  action?: { label: string; href?: string };
};

export type SettingsKey = "notifications" | "payments" | "blocked";

export type SettingsRow = {
  key: SettingsKey;
  title: string;
  href: string;
  /** One or two summary lines. */
  lines: string[];
  /** Amber: something needs the member ("Off. You may miss reminders."). */
  warn?: boolean;
};

/** What the three rows say. Null for a row whose area has no data to show. */
export type SettingsSummaries = {
  notifications: { summary: string; warn?: boolean } | null;
  payments: { lines: string[]; warn?: boolean } | null;
  /** How many members this member has blocked. */
  blocked: number | null;
};

export type YouDetails = {
  fullName: string | null;
  email: string;
  phone: string | null;
};
