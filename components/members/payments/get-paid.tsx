"use client";

// Get paid: how a host adds their bank details so Club Yuppie can pay them.
// Kit counterpart: pages_pay.gp_card(), gp_slim() and gp_body(). Club Yuppie
// draws only its own side: the entry card (four statuses), the quiet line for
// "ready", and the hand-off sheet that says what is needed and who checks
// what. Stripe's own pages are drawn as a neutral outline of someone else's
// screen with "Done" and the address, never redrawn.
//
//   not-set-up   "Withdraw to your bank."      Set up Get paid
//
// Since 16 Nov 2026 Get paid is only needed to withdraw money to a bank (a host adds a price with nothing set up).
//   needs-info   "One more thing."             Add the missing info
//   in-review    "We're checking your details." See progress on Stripe
//   ready        "You're set up to get paid."  Manage on Stripe
//
// Live (15 Nov 2026, `stripeHref`): "Continue to Stripe" goes to Stripe's
// hosted onboarding through /members/you/payments/stripe, and "Manage on
// Stripe" / "Add the missing info" go straight there; Stripe sends the host back
// to the screen they started from, which asks Stripe for the new status. The
// preview harness passes no `stripeHref`: then "Done" on the outline screen only
// marks Get paid as ready in that tab.
//
// needs_device_check: the hand-off sheet (web, app) and the Stripe screen (app).

import { useEffect, useId, useState, type ReactNode } from "react";

import { Button, Card, Icon, useExample } from "@/components/members/kit";
import { Sheet } from "@/components/members/invite/sheet";
import { formatDay, gbp } from "@/lib/members/invite/format";
import type { GetPaid, GetPaidStatus } from "@/lib/members/invite/types";
import { cn } from "@/lib/utils";
import { PayActions, PayHead } from "./pay-parts";
import { HandOffScreen } from "./pay-sheet";

export const GET_PAID_LABEL: Record<GetPaidStatus, string> = {
  "not-set-up": "Not set up",
  "needs-info": "Needs more info",
  "in-review": "In review",
  ready: "Ready",
};

const TONE: Record<GetPaidStatus, string> = {
  "not-set-up": "mk-off",
  "needs-info": "mk-warn",
  "in-review": "pay-pending",
  ready: "",
};

/** A dot and a word (not a pill): the status of Get paid. */
export function GetPaidStatusMark({ status, label }: { status: GetPaidStatus; label?: string }) {
  return <span className={cn("mk-status", TONE[status])}>{label ?? GET_PAID_LABEL[status]}</span>;
}

/** Which step of the hand-off is showing: what Club Yuppie needs, or Stripe's own screen. */
export type GetPaidMode = "intro" | "stripe" | null;

/** The entry card on the Payments page. Not set up, needs more info, in review and ready each say one thing. */
export function GetPaidCard({
  getPaid,
  onMode,
}: {
  getPaid: GetPaid;
  onMode: (mode: Exclude<GetPaidMode, null>) => void;
}) {
  const { status } = getPaid;
  let heading: string;
  let words: string;
  let action: ReactNode;
  let fine: string | null = null;
  if (status === "not-set-up") {
    heading = "Withdraw to your bank.";
    words = "Add your bank details so Club Yuppie can pay you.";
    action = (
      <Button block onClick={() => onMode("intro")}>
        Set up Get paid
      </Button>
    );
    fine = "About 5 minutes. Only needed to withdraw money to your bank.";
  } else if (status === "needs-info") {
    const paused = getPaid.paused;
    const before = paused ? ` before it can pay you ${gbp(paused.amountPence)} on ${formatDay(paused.dueOn)}` : " before it can pay you";
    heading = "One more thing.";
    words = `Stripe needs a little more${before}. Your money is safe and nothing is lost.`;
    action = (
      <Button block onClick={() => onMode("stripe")}>
        Add the missing info
      </Button>
    );
  } else if (status === "in-review") {
    heading = "We’re checking your details.";
    words = "Stripe is checking them. It usually takes a day or two, and we’ll tell you when it’s done.";
    action = (
      <Button variant="quiet" onClick={() => onMode("stripe")}>
        See progress on Stripe
        <Icon name="external" size={16} />
      </Button>
    );
  } else {
    heading = "You’re set up to get paid.";
    words = "Money you withdraw goes to your bank, usually in 2 working days.";
    action = (
      <Button block variant="outline" onClick={() => onMode("stripe")}>
        Manage on Stripe
        <Icon name="external" size={18} />
      </Button>
    );
  }
  return (
    <Card className="pay-gp" data-state={status}>
      <div className="pay-gp-top">
        <span className="mk-term">Get paid</span>
        <GetPaidStatusMark status={status} />
      </div>
      <h3 className="pay-gp-h">{heading}</h3>
      <p className="pay-gp-p">{words}</p>
      {status === "ready" && getPaid.accountEnding ? (
        <div className="pay-gp-bank">
          <Icon name="landmark" size={20} />
          <span>
            Paid into the account ending <b>{getPaid.accountEnding}</b>
          </span>
        </div>
      ) : null}
      <div className="pay-gp-act">{action}</div>
      {fine ? <p className="pay-gp-fine">{fine}</p> : null}
    </Card>
  );
}

/** Ready, once everything works: one quiet line instead of a card. */
export function GetPaidSlim({ onManage }: { onManage: () => void }) {
  return (
    <div className="pay-slim">
      <div className="l">
        <GetPaidStatusMark status="ready" label="Ready" />
        <span>Get paid is ready</span>
      </div>
      <Button variant="quiet" onClick={onManage}>
        Manage
        <Icon name="external" size={16} />
      </Button>
    </div>
  );
}

const NEEDS = [
  { icon: "id-card", text: "Your name, date of birth and home address" },
  { icon: "landmark", text: "Your UK bank account details" },
  { icon: "camera", text: "A photo ID, if Stripe asks for one" },
] as const;

/** The hand-off sheet: what Club Yuppie needs and who checks what, then on to Stripe. */
export function GetPaidSheet({ onContinue, onClose, stripeHref }: { onContinue: () => void; onClose: () => void; stripeHref?: string }) {
  const id = useId();
  // Example screens on the live site: there is no Stripe link (kit/example-note).
  const example = useExample();
  const [going, setGoing] = useState(false);
  // Back from Stripe in the same tab (the browser's back button keeps this page): ready to go again.
  useEffect(() => {
    const reset = () => setGoing(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  return (
    <Sheet labelledBy={id} onClose={onClose} variant="pay">
      <PayHead id={id} title="Get paid." onClose={onClose} />
      <p className="pay-p">Add your bank details so Club Yuppie can pay you.</p>
      <div className="pay-need">
        <span className="mk-term">What you’ll need</span>
        <ul>
          {NEEDS.map((need) => (
            <li key={need.text}>
              <Icon name={need.icon} size={22} />
              <span>{need.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="pay-tile">
        <Icon name="shield-check" size={22} />
        <div>
          <b>Stripe checks who you are and keeps your bank details.</b> Stripe is our payments partner. Club Yuppie
          never sees your bank details.
        </div>
      </div>
      <PayActions>
        {stripeHref && !example ? (
          // A whole-page load (the route sends the browser on to Stripe), never the client router.
          <Button
            block
            data-needs-net=""
            pending={going}
            onClick={() => {
              setGoing(true);
              window.location.assign(stripeHref);
            }}
          >
            {going ? "Opening Stripe…" : "Continue to Stripe"}
            {going ? null : <Icon name="external" size={18} />}
          </Button>
        ) : (
          <Button block disabled={example} onClick={onContinue}>
            {example ? "Coming soon" : "Continue to Stripe"}
            {example ? null : <Icon name="external" size={18} />}
          </Button>
        )}
        <Button block variant="outline" onClick={onClose}>
          Not now
        </Button>
      </PayActions>
      <p className="pay-fine">It takes about 5 minutes. You’ll come straight back here.</p>
    </Sheet>
  );
}

/** Both steps of the hand-off: the sheet, then Stripe's own screen as a neutral outline. */
export function GetPaidHandOff({
  mode,
  onMode,
  onDone,
  stripeHref,
}: {
  mode: GetPaidMode;
  onMode: (mode: GetPaidMode) => void;
  /** "Done" on Stripe's screen: the host is back and Get paid is ready (demo). */
  onDone: () => void;
  /**
   * Live: where Stripe is (/members/you/payments/stripe, with ?from=post on the post form). "Continue to Stripe"
   * goes there, and "Manage on Stripe" or "Add the missing info" go straight there (?manage=1).
   */
  stripeHref?: string;
}) {
  const manageHref = stripeHref ? `${stripeHref}${stripeHref.includes("?") ? "&" : "?"}manage=1` : null;
  useEffect(() => {
    if (mode === "stripe" && manageHref) {
      onMode(null);
      window.location.assign(manageHref);
    }
  }, [mode, manageHref, onMode]);
  if (mode === "intro") {
    return <GetPaidSheet onContinue={() => onMode("stripe")} onClose={() => onMode(null)} stripeHref={stripeHref} />;
  }
  if (mode === "stripe" && manageHref) return null;
  if (mode === "stripe") {
    return (
      <HandOffScreen
        who="Stripe"
        address="stripe.com"
        kind="stripe"
        cancel="Done"
        onCancel={() => {
          onDone();
          onMode(null);
        }}
      />
    );
  }
  return null;
}

/** The four entry cards and the quiet line together (the preview harness draws them on one page; the product shows one at a time). */
export function GetPaidBoard() {
  const [mode, setMode] = useState<GetPaidMode>(null);
  const cards: GetPaid[] = [
    { status: "not-set-up", accountEnding: null, paused: null },
    { status: "needs-info", accountEnding: null, paused: { amountPence: 3500, dueOn: "2026-10-27T09:00:00Z" } },
    { status: "in-review", accountEnding: null, paused: null },
    { status: "ready", accountEnding: "4321", paused: null },
  ];
  return (
    <main className="mk-main mk-main-pad">
      <div className="mk-wrap" style={{ display: "grid", gap: 32, paddingTop: 32 }}>
        <h1 className="mk-sr">Get paid</h1>
        <h2 className="mk-sr">The four entry cards</h2>
        {cards.map((card) => (
          <GetPaidCard key={card.status} getPaid={card} onMode={setMode} />
        ))}
        <GetPaidSlim onManage={() => setMode("stripe")} />
      </div>
      <GetPaidHandOff mode={mode} onMode={setMode} onDone={() => setMode(null)} />
    </main>
  );
}

/**
 * Live: ask the server again when the host comes back from Stripe: the page shows again (the tab, the app), the
 * in-app browser sheet closes (the app tells the page: cy-browser-closed), or Stripe sent them back (?getpaid=back).
 */
export function useGetPaidRefresh(refresh: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    const again = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 3000) return;
      last = Date.now();
      refresh();
    };
    window.addEventListener("cy-browser-closed", again);
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("cy-browser-closed", again);
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [refresh, enabled]);
}
