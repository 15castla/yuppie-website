// The three Applications tabs, shared by the server pages and the client list.

export type AppTab = "waiting" | "approved" | "declined";

/** The list's view: one of the three tabs, or every application ("Applications, all time" on the dashboard, QA2-14). */
export type AppView = AppTab | "all";

export function currentTab(value: string | null | undefined): AppView {
  return value === "approved" || value === "declined" || value === "all" ? value : "waiting";
}

export function tabHref(tab: AppView): string {
  return tab === "waiting" ? "/admin/applications" : `/admin/applications?tab=${tab}`;
}
