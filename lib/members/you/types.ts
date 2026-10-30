// What the You page draws, as plain data (BUILD_BRIEF 6: types first). The
// page file fetches the real member and builds these; the view is a pure
// component of them, so the preview harness can draw every state with no
// login and no database.
//
// Real (Phase A): the member's details, the five membership states with real
// dates (lib/server/membership-actions.ts membershipCardFor: active, ending,
// problem, paused, cancelled; paused and cancelled members see the gate, so
// only the preview draws those two on You), the card's buttons (Manage and
// Update card open the Stripe billing portal through /members/billing; Keep
// my membership undoes a cancel), the D8 warning line, the two-step Cancel
// membership with its reason, Delete my account and Log out.
// NEEDS BACKEND (Phase B): the three Settings summaries (notification
// channels, Get paid status, the blocked list), and the hosted-plans lines in
// the cancel and delete dialogs (Open Invite and paid plans are not real yet).

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
  /** ending: club events booked after the end date (D8), "Sunrise Wellness Retreat" and "Sun 15 Nov". */
  afterEnd?: { title: string; when: string }[];
  /**
   * The one button in the card: "Manage" and "Update card" (href: the billing portal route; external in the
   * app, so the native shell hands it on rather than navigating its own WebView), "Keep my membership" (no
   * href: the view's keep action).
   */
  action?: { label: string; href?: string; external?: boolean };
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
