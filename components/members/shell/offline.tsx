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
import { useEffect, useRef, useState } from "react";

const OFF = process.env.NEXT_PUBLIC_MEMBERS_OFFLINE === "off";
const SAVE_DELAY_MS = 1500;
const BACK_ONLINE_MS = 2500;

type Status = { savedAt: number | null; offline: boolean } | null;

function timeOf(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(new Date(ms));
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
  const wasOffline = useRef(false);

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
    const timer = setTimeout(() => {
      const controller = navigator.serviceWorker?.controller;
      controller?.postMessage({ type: "cy-save", href: window.location.href });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pathname, query, online]);

  const offline = !online || Boolean(fromPhone);
  const showing = offline || backOnline;
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("cy-offline", !online);
    root.classList.toggle("cy-netbar", showing);
    return () => root.classList.remove("cy-offline", "cy-netbar");
  }, [online, showing]);

  let words: string | null = null;
  if (offline) {
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
