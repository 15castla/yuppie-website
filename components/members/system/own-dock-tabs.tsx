"use client";

// The 404 and the page error keep the tab bar (r2b: "the tab bar and top bar stay, so a member always
// knows where they are"). On a page that draws its own docked bar instead (an event, a plan, a chat) the
// shell has drawn no tab bar, and the page that would have drawn its own bar is not there, so this puts the
// shell's tab bar back for the 404 or error that replaced it. Elsewhere it draws nothing.

import { usePathname } from "next/navigation";

import { DockBar } from "@/components/members/shell/dock-bar";
import { useShell } from "@/components/members/shell/shell-context";
import { tabsFor } from "@/components/members/shell/tabs";
import { chromeFor, dockFor } from "@/lib/members/routes";

export function OwnDockTabs() {
  const pathname = usePathname();
  const { mode } = useShell();
  if (dockFor(pathname) !== "own" || chromeFor(pathname) === "bare") return null;
  return (
    <>
      <div className="mk-dock-spacer" aria-hidden="true" />
      <DockBar tabs={tabsFor({ mode })} activeTab={null} />
    </>
  );
}
