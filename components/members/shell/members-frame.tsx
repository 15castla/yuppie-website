// The members shell, as a pure component of props. It draws, around the page
// the children are:
//   web phone   TopBar: 56px bar, wordmark left, (messages) and photo right
//   app         no bar: the status area is the system's; the page's own
//               TitleBlock or BackRow clears the inset
//   computer    DesktopHeader: links left, wordmark centre, photo and name right
//   phone       DockBar: the tab bar (unless the page has its own docked bar)
// Pages never draw their own tab bar or page-level header.
//
// The real layout (app/members/layout.tsx, through MembersShell) and the
// preview harness (app/dev-preview) both render this, so a screen in the
// harness sits in exactly the shell the member gets.
//
// `member` may be a promise: the layout streams it, the shell paints at once
// and the photo arrives into its fixed 44px slot.
//
// Who may show the messages icon: only Open Invite pages (showMessages).
// Nothing else. See FOUNDATION_NOTES.

import type { CSSProperties, ReactNode } from "react";

import type { TabKey } from "@/lib/members/routes";
import { cn } from "@/lib/utils";
import { DesktopHeader } from "./desktop-header";
import { DockBar } from "./dock-bar";
import { ShellProvider } from "./shell-context";
import type { TabSpec } from "./tabs";
import { TopBar } from "./top-bar";
import type { MemberSummary, ShellMode } from "./types";

export type MembersFrameProps = {
  mode: ShellMode;
  /** The tabs to show (tabsFor({ mode, flags })). */
  tabs: TabSpec[];
  /** The lit tab, or null (You, Messages, sub pages without one). */
  activeTab: TabKey | null;
  member: MemberSummary | null | Promise<MemberSummary | null>;
  /** The number on the messages icon: unread chats plus updates. */
  unread?: number;
  /** The number the server draws while the page hydrates (default: `unread`; the real shell's live count passes 0). */
  unreadAtStart?: number;
  /** Draw the messages icon. Open Invite pages only. */
  showMessages?: boolean;
  /** The messages icon is the current page (the Messages pages). */
  messagesCurrent?: boolean;
  /** The photo button is the current page (You and its sub pages). */
  youCurrent?: boolean;
  /** "own": the page draws its own docked bar in the tab bar's slot, so no tab bar here. */
  dock?: "tabs" | "own";
  /** "bare": no bar, header or dock at all (the photo gate). */
  chrome?: "full" | "bare";
  /** Where the wordmark links. Default: the landing page. */
  landingHref?: string;
  /** Inline style on the root, for the preview harness (simulated safe insets). */
  style?: CSSProperties;
  children: ReactNode;
};

export function MembersFrame({
  mode,
  tabs,
  activeTab,
  member,
  unread = 0,
  unreadAtStart = unread,
  showMessages = false,
  messagesCurrent = false,
  youCurrent = false,
  dock = "tabs",
  chrome = "full",
  landingHref,
  style,
  children,
}: MembersFrameProps) {
  const bare = chrome === "bare";
  const tabBar = !bare && dock === "tabs";
  return (
    <ShellProvider
      value={{ mode, member, showMessages, messagesCurrent, unread, unreadAtStart, youCurrent }}
    >
      <div className={cn("mk-screen", mode === "app" ? "mk-app" : "mk-web")} data-mode={mode} style={style}>
        <div className="mk-page">
          {!bare && mode === "web" ? <TopBar landingHref={landingHref} /> : null}
          {!bare ? (
            <DesktopHeader tabs={tabs} activeTab={activeTab} landingHref={landingHref} />
          ) : null}
          {children}
          {tabBar ? (
            <>
              <div className="mk-dock-spacer" aria-hidden="true" />
              <DockBar tabs={tabs} activeTab={activeTab} />
            </>
          ) : (
            // No tab bar here: a solid fixed strip keeps something with a
            // real background-color at the bottom edge for Safari 26's tint.
            <div className="mk-tint" aria-hidden="true" />
          )}
        </div>
      </div>
    </ShellProvider>
  );
}
