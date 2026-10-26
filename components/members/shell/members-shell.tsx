"use client";

// The real layout's shell: MembersFrame with everything that depends on the
// URL worked out from the pathname (a layout cannot see it). Which tab is
// lit, whether the messages icon is drawn, whether the page draws its own
// docked bar, whether the page is bare: all of it comes from the route table
// in lib/members/routes.ts, so adding a route there is all a builder does.

import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

import {
  activeTabFor,
  chromeFor,
  dockFor,
  isYouPath,
  messagesIconFor,
} from "@/lib/members/routes";
import { MembersFrame } from "./members-frame";
import type { TabSpec } from "./tabs";
import type { MemberSummary, ShellMode } from "./types";

export function MembersShell({
  mode,
  tabs,
  member,
  messagesEnabled,
  unread = 0,
  pathname: pathnameOverride,
  style,
  children,
}: {
  mode: ShellMode;
  tabs: TabSpec[];
  member: MemberSummary | null | Promise<MemberSummary | null>;
  /** flags.messages: the messages icon opens a flagged route, so it only shows when that is on. */
  messagesEnabled: boolean;
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
  return (
    <MembersFrame
      mode={mode}
      tabs={tabs}
      activeTab={lit && tabs.some((tab) => tab.key === lit) ? lit : null}
      member={member}
      unread={unread}
      showMessages={messagesEnabled && messages !== "none"}
      messagesCurrent={messages === "current"}
      youCurrent={isYouPath(pathname)}
      dock={dockFor(pathname)}
      chrome={chromeFor(pathname)}
      style={style}
    >
      {children}
    </MembersFrame>
  );
}
