"use client";

// Offline (Albert, 13 Nov 2026: "I want to improve the app so it still loads when disconnected from wifi like other
// apps do such as instagram. Although, it should still be clear the user is offline").
//
// - Registers the members worker (public/members-sw.js, scope /members), which saves the pages a member opens and
//   shows them with no signal. NEXT_PUBLIC_MEMBERS_OFFLINE=off unregisters it and clears what it saved.
// - Asks the worker to save each page reached inside the app (the router fetches only its data, so the worker would
//   not otherwise see it), a moment after it shows.
// - The bar: "You’re offline. Showing what you saw at 21:42." while there is no connection or the page came from the
//   phone (a weak signal), and "Back online" for a moment when it returns, as the page refreshes itself.
// - While offline, <html> carries .cy-offline: the bar pushes the page down (--safe-top), and anything that needs a
//   connection (marked data-needs-net: Book, I’m in, Send, Save ...) is greyed out and can't be tapped.

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { getRedemptionStatus } from "@/app/members/redemption-actions";
import { CARD_REFRESH_MS, lastCardAt, rememberCard } from "@/components/members/discounts/card-memory";
import { useEffect, useRef, useState } from "react";

const OFF = process.env.NEXT_PUBLIC_MEMBERS_OFFLINE === "off";
const SAVE_DELAY_MS = 1500;
/** The main pages are saved ahead this long after a page opens (once per page load; the worker skips fresh ones). */
const MAIN_DELAY_MS = 4000;
const NOTE_MS = 3500;
const BACK_ONLINE_MS = 2500;

type Status = { savedAt: number | null; offline: boolean } | null;

function timeOf(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(new Date(ms));
}

/** A message to the worker once it is running (not before: the first visit registers it). */
function toWorker(message: unknown, transfer: Transferable[] = []): void {
  if (OFF || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage(message, transfer)).catch(() => {});
}

/** The pages saved on the phone (path and query). */
function savedPaths(): Promise<string[]> {
  return new Promise((resolve) => {
    if (OFF || !("serviceWorker" in navigator)) return resolve([]);
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve([]), 1500);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(Array.isArray(event.data) ? (event.data as string[]) : []);
    };
    toWorker({ type: "cy-list" }, [channel.port2]);
  });
}

/** The main pages, as this member's shell links to them: the tabs, Profile and Messages. */
function mainPages(): string[] {
  // Profile and Messages always (Messages answers "not found" when it is off for this member, and isn't saved), and
  // whatever the tab bar shows.
  const hrefs = new Set<string>(["/members/you", "/members/messages"]);
  document.querySelectorAll<HTMLAnchorElement>(".mk-tabbar a[href], .mk-hdr nav a[href], a[href='/members/messages']").forEach((a) => {
    const url = new URL(a.href, window.location.href);
    if (url.origin === window.location.origin && url.pathname.startsWith("/members/")) hrefs.add(url.pathname);
  });
  return [...hrefs];
}

function askWorker(): Promise<Status> {
  const controller = navigator.serviceWorker?.controller;
  if (!controller) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 1500);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve((event.data as Status) ?? null);
    };
    controller.postMessage({ type: "cy-status" }, [channel.port2]);
  });
}

export function OfflineBar() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [online, setOnline] = useState(true);
  const [fromPhone, setFromPhone] = useState<Status>(null);
  const [backOnline, setBackOnline] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const wasOffline = useRef(false);
  const saved = useRef<{ full: Set<string>; paths: Set<string> } | null>(null);

  // The worker: on, or (switched off) gone with everything it saved.
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.location.pathname.startsWith("/members")) return;
    if (OFF) {
      void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()));
      void caches?.keys().then((keys) => keys.filter((k) => k.startsWith("cy-")).forEach((k) => void caches.delete(k)));
      return;
    }
    navigator.serviceWorker.register("/members-sw.js", { scope: "/members" }).catch((err) => {
      // Not where service workers are allowed (an app build without App-Bound Domains, a private window): the
      // pages work as before, just not offline.
      console.warn("offline: the members worker could not register:", err);
    });
    void askWorker().then((status) => {
      if (status) setFromPhone(status);
    });
  }, []);

  // The connection, as the phone reports it.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Back online: say so for a moment and bring the page up to date.
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setFromPhone(null);
    setBackOnline(true);
    router.refresh();
    const timer = setTimeout(() => setBackOnline(false), BACK_ONLINE_MS);
    return () => clearTimeout(timer);
  }, [online, router]);

  // Each page reached inside the app: saved on the phone a moment after it shows (online only).
  const query = search.toString();
  useEffect(() => {
    if (OFF || !online) return;
    const timer = setTimeout(() => toWorker({ type: "cy-save", href: window.location.href }), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pathname, query, online]);

  // The main pages (every tab, Profile, Messages) saved ahead, so each opens offline even if not visited
  // (14 Nov 2026: Concierge, not yet opened, went to the offline screen). Once per page load; the worker skips any
  // saved in the last half hour.
  useEffect(() => {
    if (OFF) return;
    const timer = setTimeout(() => {
      if (!navigator.onLine) return;
      toWorker({ type: "cy-save-main", hrefs: mainPages() });
      // The members card, checked ahead so it shows offline (with when it was checked), 14 Nov 2026.
      if (Date.now() - lastCardAt() > CARD_REFRESH_MS) {
        getRedemptionStatus()
          .then((status) => {
            if (status) rememberCard(status);
          })
          .catch(() => {});
      }
    }, MAIN_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Offline: which pages are on the phone, so a tap on one that isn't stays here with a note, instead of leaving
  // the app for the offline screen.
  useEffect(() => {
    if (online) {
      saved.current = null;
      return;
    }
    void savedPaths().then((list) => {
      saved.current = { full: new Set(list), paths: new Set(list.map((p) => p.split("?")[0])) };
    });
  }, [online, pathname]);

  useEffect(() => {
    if (online) return;
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || !(url.pathname === "/members" || url.pathname.startsWith("/members/"))) return;
      const known = saved.current;
      if (!known) return; // not known yet: let it try
      const path = url.pathname.replace(/\/$/, "") || "/";
      const isSaved =
        path === "/members"
          ? known.paths.has("/members/open-invite") || known.paths.has("/members/events")
          : known.full.has(path + url.search) || known.paths.has(path);
      if (path === window.location.pathname || isSaved) return;
      event.preventDefault();
      event.stopPropagation();
      setNote("Not saved yet. It opens when you’re back online.");
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [online]);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(timer);
  }, [note]);

  const offline = !online || Boolean(fromPhone);
  const showing = offline || backOnline;
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("cy-offline", !online);
    root.classList.toggle("cy-netbar", showing);
    return () => root.classList.remove("cy-offline", "cy-netbar");
  }, [online, showing]);

  let words: string | null = null;
  if (note && !online) {
    words = note;
  } else if (offline) {
    const saw = fromPhone?.savedAt ? `Showing what you saw at ${timeOf(fromPhone.savedAt)}.` : "Showing what you last saw.";
    words = online ? `Weak signal. ${saw}` : `You’re offline. ${saw}`;
  } else if (backOnline) {
    words = "Back online";
  }

  return (
    <div className="cy-offbar" role="status" aria-live="polite" data-show={words ? "true" : "false"} data-state={offline ? "off" : "on"}>
      {words ? (
        <>
          <span className="cy-offdot" aria-hidden="true" />
          <span>{words}</span>
          {online && fromPhone ? (
            // a weak signal, not none: the page came from the phone; try the network again
            <button type="button" className="cy-offtry" onClick={() => window.location.reload()}>
              Try again
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
