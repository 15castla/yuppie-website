"use client";

// The messages icon's number in the real shell, from one source: the server's unread chats plus unread updates
// (app/members/shell-actions.ts getMessagesBadge). Polling, not sockets (the brief: the local stack has no
// Realtime): it is fetched when the page changes and every minute while a page that shows the icon is open and
// visible. Off pages that show no icon it is not fetched at all. A failed fetch keeps the last number.

import { useEffect, useState } from "react";

import { getMessagesBadge } from "@/app/members/shell-actions";

const EVERY_MS = 60_000;

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
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, pathname]);
  return active ? count : 0;
}
