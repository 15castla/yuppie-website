"use client";

// Phone notifications in the app (Albert, 11 Nov 2026: "move everything to app notifications"). Drawn by the
// members layout in the app where push is live for the member. It:
//   - tells the server what the phone says (allowed, not allowed, not asked yet; or "unavailable" in an app build
//     from before notifications), each time the app opens or comes back from Settings;
//   - hands the server this iPhone's device token once notifications are allowed;
//   - opens the page a tapped notification is about, with the members area's own router;
//   - offers once to turn notifications on, when the member first has something to hear about (a plan they post or
//     join, a question, a club event booked: notifications spec, "the app asks the first time a member says I'm
//     in or posts a plan"). "Not now" asks again a week later; iOS's own question can only be asked once, so the
//     sheet comes first.

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { pushAskDue, recordPushPermission, registerPushDevice } from "@/app/members/you/notifications/actions";
import { Button, Icon } from "@/components/members/kit";
import { Sheet } from "@/components/members/invite/sheet";
import { askNative, nativePush, onNative, postNative, setNativeOpener, type NativePushStatus } from "@/lib/members/native-push";

const ASKED_KEY = "yuppie-push-offered-at";
const ASK_AGAIN_MS = 7 * 24 * 3600 * 1000;

function offeredRecently(): boolean {
  try {
    const at = Number(window.localStorage.getItem(ASKED_KEY) ?? 0);
    return Date.now() - at < ASK_AGAIN_MS;
  } catch {
    return false;
  }
}

function markOffered(): void {
  try {
    window.localStorage.setItem(ASKED_KEY, String(Date.now()));
  } catch {
    // Private storage off: the sheet may come back next time, which is all.
  }
}

export function PushBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const titleId = useId();
  const [status, setStatus] = useState<NativePushStatus | null>(null);
  const [offer, setOffer] = useState(false);
  const [asking, setAsking] = useState(false);
  const told = useRef<string | null>(null);
  const handed = useRef<string | null>(null);

  // What the phone says, and its token, to the server; taps to the router.
  useEffect(() => {
    if (!nativePush()) {
      void recordPushPermission("unavailable").catch(() => {});
      return;
    }
    setNativeOpener((path) => router.push(path));
    const off = onNative((event) => {
      if (event.type === "status") {
        setStatus(event.status);
        if (told.current !== event.status) {
          told.current = event.status;
          void recordPushPermission(event.status).catch(() => {});
        }
      } else if (event.type === "token" && handed.current !== event.token) {
        handed.current = event.token;
        void registerPushDevice(event.token, event.environment).catch(() => {
          handed.current = null;
        });
      }
    });
    postNative("status");
    const back = () => {
      if (document.visibilityState === "visible") postNative("status");
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      off();
      document.removeEventListener("visibilitychange", back);
      setNativeOpener(null);
    };
  }, [router]);

  // Offer to turn them on, once there is something to hear about.
  useEffect(() => {
    if (status !== "not_asked" || offer || offeredRecently()) return;
    let gone = false;
    pushAskDue()
      .then((r) => {
        if (!gone && r && "ask" in r && r.ask) setOffer(true);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [status, pathname, offer]);

  if (!offer) return null;

  const close = () => {
    markOffered();
    setOffer(false);
  };
  const turnOn = async () => {
    setAsking(true);
    markOffered();
    const answer = await askNative();
    setStatus(answer);
    setAsking(false);
    setOffer(false);
  };

  return (
    <Sheet labelledBy={titleId} onClose={asking ? () => {} : close}>
      <span className="oi-sh-icon">
        <Icon name="bell" size={26} />
      </span>
      <h2 className="oi-sh-h" id={titleId}>
        Turn on notifications?
      </h2>
      <p className="oi-sh-p">
        So you know when someone joins your plan, sends a message or changes a plan, and you get your reminders. We don’t email these any more.
      </p>
      <div className="oi-sh-act">
        <Button block pending={asking} onClick={asking ? undefined : () => void turnOn()}>
          Turn on
        </Button>
        <Button block variant="outline" disabled={asking} onClick={close}>
          Not now
        </Button>
      </div>
    </Sheet>
  );
}
