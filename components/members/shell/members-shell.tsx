"use client";

// The real layout's shell: MembersFrame with everything that depends on the
// URL worked out from the pathname (a layout cannot see it). Which tab is
// lit, whether the messages icon is drawn, whether the page draws its own
// docked bar, whether the page is bare: all of it comes from the route table
// in lib/members/routes.ts, so adding a route there is all a builder does.

import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

import {
  ROUTES,
  activeTabFor,
  chromeFor,
  dockFor,
  isYouPath,
  messagesIconFor,
} from "@/lib/members/routes";
import { MembersFrame } from "./members-frame";
import { useFreshTabs } from "./use-fresh-tabs";
import { useUnread } from "./use-unread";
import type { TabSpec } from "./tabs";
import type { MemberSummary, ShellMode } from "./types";

export function MembersShell({
  mode,
  tabs,
  member,
  messagesEnabled,
  unread,
  pathname: pathnameOverride,
  style,
  children,
}: {
  mode: ShellMode;
  tabs: TabSpec[];
  member: MemberSummary | null | Promise<MemberSummary | null>;
  /** flags.messages: the messages icon opens a flagged route, so it only shows when that is on. */
  messagesEnabled: boolean;
  /** The preview harness only: a fixed number. The real layout leaves it out and the shell asks the server (useUnread). */
  unread?: number;
  /** The preview harness only (?route=/members/open-invite): pretend the page is at this path. The real layout never passes it. */
  pathname?: string;
  /** The preview harness only: simulated safe insets. */
  style?: CSSProperties;
  children: ReactNode;
}) {
  const livePathname = usePathname();
  const pathname = pathnameOverride ?? livePathname;
  const messages = messagesIconFor(pathname);
  const lit = activeTabFor(pathname);
  // One source for the number on the messages icon: the server's unread chats plus unread updates, fetched on
  // the pages that show the icon (Open Invite and Messages), when the page changes and once a minute.
  const live = useUnread(unread === undefined && messagesEnabled && messages !== "none", pathname);
  const showMessages = messagesEnabled && messages !== "none";
  // The tabs, You and (where its icon shows) Messages stay fetched ahead, so a tap opens the whole page at once.
  // The real layout only: the preview harness (a pathname override) fetches nothing, and neither do the bare gate
  // pages (photo, rules, membership: no tabs there, and every tab would only send the member back to the gate).
  const chrome = chromeFor(pathname);
  useFreshTabs(
    pathnameOverride === undefined && chrome !== "bare"
      ? [...tabs.map((tab) => tab.href), ROUTES.you, ...(showMessages ? [ROUTES.messages] : [])]
      : [],
  );
  return (
    <MembersFrame
      mode={mode}
      tabs={tabs}
      activeTab={lit && tabs.some((tab) => tab.key === lit) ? lit : null}
      member={member}
      unread={unread ?? live}
      unreadAtStart={unread ?? 0}
      showMessages={showMessages}
      messagesCurrent={messages === "current"}
      youCurrent={isYouPath(pathname)}
      dock={dockFor(pathname)}
      chrome={chrome}
      style={style}
    >
      {children}
    </MembersFrame>
  );
}
