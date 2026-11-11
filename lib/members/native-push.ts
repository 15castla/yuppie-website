// The iOS app's notifications, from the page (client only). The app (mobile/ios/App/App/AppDelegate.swift,
// PushBridge) listens on window.webkit.messageHandlers.yuppiePush and answers with "yuppie-push" events:
//
//   page -> app   { action: "status" }        what the phone says now (and, when allowed, its device token)
//                 { action: "ask" }           iOS's own "Allow notifications?" (once; after that, Settings)
//                 { action: "openSettings" }  the app's page in the iPhone's Settings
//   app -> page   { type: "status", status: "granted" | "denied" | "not_asked" }
//                 { type: "token", token, environment: "sandbox" | "production" }
//
// A tapped notification opens its page through window.__yuppiePushOpen(path) (the members area's router), or a
// plain load when that is not there. In a browser, or an app build from before notifications, there is no
// handler: nativePush() is false and nothing here does anything.

export type NativePushStatus = "granted" | "denied" | "not_asked";
export type NativePushEvent =
  | { type: "status"; status: NativePushStatus }
  | { type: "token"; token: string; environment: "sandbox" | "production" };

type Handler = { postMessage: (message: unknown) => void };
type PushWindow = Window & {
  webkit?: { messageHandlers?: { yuppiePush?: Handler } };
  __yuppiePushOpen?: (path: string) => void;
};

const handler = (): Handler | null => (typeof window === "undefined" ? null : ((window as PushWindow).webkit?.messageHandlers?.yuppiePush ?? null));

/** This is the app, and it can do notifications. */
export function nativePush(): boolean {
  return handler() !== null;
}

export function postNative(action: "status" | "ask" | "openSettings"): void {
  try {
    handler()?.postMessage({ action });
  } catch {
    // The app went away mid-call: nothing to do.
  }
}

/** Listen to the app's answers. Returns the unsubscribe. */
export function onNative(listen: (event: NativePushEvent) => void): () => void {
  const wrapped = (e: Event) => {
    const detail = (e as CustomEvent<NativePushEvent>).detail;
    if (detail && typeof detail === "object" && "type" in detail) listen(detail);
  };
  window.addEventListener("yuppie-push", wrapped);
  return () => window.removeEventListener("yuppie-push", wrapped);
}

/** iOS's own question, answered: the status after it (or the status now, if iOS asked before). */
export function askNative(timeoutMs = 120_000): Promise<NativePushStatus> {
  return new Promise((resolve) => {
    if (!nativePush()) return resolve("denied");
    let off = () => {};
    const timer = window.setTimeout(() => {
      off();
      resolve("not_asked");
    }, timeoutMs);
    off = onNative((event) => {
      if (event.type !== "status") return;
      window.clearTimeout(timer);
      off();
      resolve(event.status);
    });
    postNative("ask");
  });
}

export function openNativeSettings(): void {
  postNative("openSettings");
}

/** Where a tapped notification goes: set by the members area while it is open. */
export function setNativeOpener(open: ((path: string) => void) | null): void {
  const w = window as PushWindow;
  if (open) w.__yuppiePushOpen = open;
  else delete w.__yuppiePushOpen;
}
