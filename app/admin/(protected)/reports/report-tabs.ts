// The Reports page's tabs, row shape and status pills, shared by the server pages and the client list (no I/O).

export type ReportTab = "open" | "done";

export type ReportStatusName = "open" | "dismissed" | "message_removed" | "plan_removed" | "photo_removed" | "warned" | "suspended";

export function reportTab(value: string | null | undefined): ReportTab {
  return value === "done" ? "done" : "open";
}

export function reportTabHref(tab: ReportTab): string {
  return tab === "done" ? "/admin/reports?tab=done" : "/admin/reports";
}

/** A report's status as its pill says it. */
export const STATUS_PILL: Record<ReportStatusName, { label: string; kind: "ink" | "plain" | "muted" }> = {
  open: { label: "Open", kind: "ink" },
  dismissed: { label: "Dismissed", kind: "muted" },
  message_removed: { label: "Removed", kind: "plain" },
  plan_removed: { label: "Removed", kind: "plain" },
  photo_removed: { label: "Removed", kind: "plain" },
  warned: { label: "Warned", kind: "plain" },
  suspended: { label: "Suspended", kind: "plain" },
};

export type ReportListRow = {
  id: string;
  status: ReportStatusName;
  /** Bold: who it is about (the sender, the photo's member, the member, the plan's host). */
  name: string;
  /** Muted after the name: "in Sunday walk and coffee", "photo", "member", "plan". */
  context: string;
  /** The second line: the message's words, the plan's title, or the kind in muted words ("Profile photo"). */
  line: string;
  lineIsKind: boolean;
  reason: string;
  reporter: string;
  ago: string;
  photoUrl: string | null;
};
