// The three Applications tabs, shared by the server pages and the client list.

export type AppTab = "waiting" | "approved" | "declined";

export function currentTab(value: string | null | undefined): AppTab {
  return value === "approved" || value === "declined" ? value : "waiting";
}

export function tabHref(tab: AppTab): string {
  return tab === "waiting" ? "/admin/applications" : `/admin/applications?tab=${tab}`;
}
