// The tab bar's tabs, and which of them a given mode and flag set shows.
//
// Launch bar: Events, Discounts, Access. With flags: Open Invite first, and
// Concierge in the middle in the app only. You is never a tab: it is the
// member's photo, top right. Kit counterparts: k2.TABS and k2.tab_keys().

import { flags as liveFlags, type Flags } from "@/lib/members/flags";
import { ROUTES, type TabKey } from "@/lib/members/routes";
import type { IconName } from "../kit/icons";
import type { ShellMode } from "./types";

export type TabSpec = {
  key: TabKey;
  label: string;
  href: string;
  icon: IconName;
  /** A number to show as a small badge on the tab, e.g. unread chats. 0 or missing: none. */
  badge?: number;
};

const TAB_META: Record<TabKey, Omit<TabSpec, "key">> = {
  invite: { label: "Open Invite", href: ROUTES.openInvite, icon: "users" },
  events: { label: "Events", href: ROUTES.events, icon: "calendar" },
  concierge: { label: "Concierge", href: ROUTES.concierge, icon: "concierge" },
  discounts: { label: "Discounts", href: ROUTES.discounts, icon: "percent" },
  access: { label: "Access", href: ROUTES.access, icon: "key" },
};

export function tabsFor({
  mode,
  flags = liveFlags,
  badges = {},
}: {
  mode: ShellMode;
  flags?: Pick<Flags, "openInvite" | "concierge">;
  badges?: Partial<Record<TabKey, number>>;
}): TabSpec[] {
  const keys: TabKey[] = [
    ...(flags.openInvite ? (["invite"] as const) : []),
    "events",
    ...(mode === "app" && flags.concierge ? (["concierge"] as const) : []),
    "discounts",
    "access",
  ];
  return keys.map((key) => ({ key, ...TAB_META[key], badge: badges[key] }));
}

// The computer header's links: the same tabs without Concierge (app only,
// and a phone-shaped screen).
export function headerLinksFor(tabs: TabSpec[]): TabSpec[] {
  return tabs.filter((tab) => tab.key !== "concierge");
}
