"use client";

// The messages icon's number in the real shell, from one source: the server's unread chats plus unread updates
// (app/members/shell-actions.ts getMessagesBadge). Polling, not sockets (the brief: the local stack has no
// Realtime): it is fetched when the page changes and every minute while a page that shows the icon is open and
// visible, and at once when a screen says it changed what is unread (announceUnreadChanged: Messages reading a chat
// or an update, a block). Off pages that show no icon it is not fetched at all. A failed fetch keeps the last number.

import { useEffect, useState } from "react";

import { getMessagesBadge } from "@/app/members/shell-actions";

const EVERY_MS = 60_000;
const CHANGED = "members:unread-changed";

/** A screen that just changed what is unread (read a chat or an update, blocked someone) asks the icon to look again. */
export function announceUnreadChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED));
}

export function useUnread(active: boolean, pathname: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      getMessagesBadge()
        .then((n) => {
          if (alive && typeof n === "number") setCount(n);
        })
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(CHANGED, load);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(CHANGED, load);
    };
  }, [active, pathname]);
  return active ? count : 0;
}
