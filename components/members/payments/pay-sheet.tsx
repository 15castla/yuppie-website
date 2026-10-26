"use client";

// Pay and join: the sheet on a phone, the 520px dialog on a computer. Kit
// counterpart: pages_pay.pay_body() and ext_overlay(). It takes the price,
// says where the money is and when it moves, and never leaves the plan page.
//
// States (the designs' six, plus the two edges nobody drew):
//   ready          Apple Pay first, the card under it
//   paying         the button keeps its size, close is off, "Taking your £22."
//   declined       the card was declined: nothing taken, try again
//   bank           "Check with your bank." (3D Secure), and bank-screen: the
//                  bank's own screen, drawn as a neutral outline
//   full           that was the last place (nothing taken / refunded in full)
//   price          the host changed the price while you were paying
//   hold-expired   the 10 minutes ran out (NEW: not drawn, same grammar)
//   success        "You're in."
//   load-error     "We couldn't open payment."
//
// NO STRIPE IS LOADED. The card fields below are static markup that looks like
// the fields Stripe draws (an approximation, marked in the spec). Pressing Pay
// only changes what this browser tab shows; nothing is sent and nothing is
// charged. With a backend this becomes: reserve the place (PayHold), mount
// Stripe's Payment Element, confirm, then show the PayResult.
//
// needs_device_check: Apple Pay, the card fields, the 3D Secure window, the
// keyboard pushing the sheet up, the sheet's height against Safari's toolbars,
// the bottom padding on the home indicator.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Button, Icon, KitLink } from "@/components/members/kit";
import { gbp } from "@/lib/members/invite/format";
import type { OpenInvite } from "@/lib/members/invite/types";
import { messageThreadHref, openInviteReceiptHref } from "@/lib/members/routes";
import { Sheet, useModalFocus } from "@/components/members/invite/sheet";
import { BACK_5_10, heldLine, MoneyList, PayActions, PayHead, PayMark, PlanTile, PriceLines, REFUND_RULE } from "./pay-parts";

export type PayState =
  | "ready"
  | "paying"
  | "declined"
  | "bank"
  | "bank-screen"
  | "full"
  | "full-refunded"
  | "price"
  | "hold-expired"
  | "success"
  | "load-error";

/** How long "Paying…" shows before the demo says yes (the stand-in for the server). */
export const PAY_DELAY_MS = 1300;

function AppleMark() {
  return (
    <svg className="pay-apple-g" width="17" height="21" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
    </svg>
  );
}

/** The card box: number on top, expiry and security code under it. Static: Stripe draws the real one. */
function CardBox({ mode }: { mode: "empty" | "filled" | "error" | "off" }) {
  const ph = mode === "empty";
  const cls = mode === "error" ? " is-error" : mode === "off" ? " is-off" : "";
  const text = (placeholder: string, value: string) =>
    ph ? <span className="mk-ph">{placeholder}</span> : <span>{value}</span>;
  return (
    <>
      <div className="pay-lab" id="pay-card-label">
        Card details
      </div>
      <div
        className={`pay-cb${cls}`}
        role="img"
        aria-labelledby="pay-card-label"
      >
        <div className="r1">
          {text("1234 1234 1234 1234", "4242 4242 4242 4242")}
          <Icon name="credit-card" size={22} />
        </div>
        <div className="r2">
          <div>{text("MM / YY", "12 / 28")}</div>
          <div>{text("CVC", "123")}</div>
        </div>
      </div>
    </>
  );
}

/**
 * Someone else's screen (the bank's 3D Secure window), drawn as a neutral outline and never redrawn.
 * It is a modal like the sheets (useModalFocus): focus moves in, Tab stays in, the page behind is inert,
 * and Escape does what its one button does (steps back for the bank, closes for Stripe), because the
 * real screens are an in-app browser that the member dismisses.
 */
export function HandOffScreen({
  who,
  address,
  kind,
  cancel,
  onCancel,
}: {
  who: string;
  /** What the address bar shows: "Your bank", "stripe.com". */
  address: string;
  kind: "bank" | "stripe";
  /** The left button's word: "Cancel" for the bank, "Done" for Stripe. */
  cancel: string;
  onCancel: () => void;
}) {
  const sk = (width: string, height: number, extra = "", top?: number) => (
    <span className={`pay-sk ${extra}`.trim()} style={{ width, height, marginTop: top }} />
  );
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref, onCancel);
  return (
    <>
      <div className="mk-scrim" aria-hidden="true" data-keep-live="" />
      <div
        ref={ref}
        className={`pay-ext${kind === "bank" ? " is-short" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${who}’s own screen`}
        tabIndex={-1}
        data-needs-device-check="true"
      >
        <div className="pay-ext-bar">
          <button type="button" className="l" onClick={onCancel}>
            {cancel}
          </button>
          <span className="u">
            <Icon name="lock" size={14} />
            <span>{address}</span>
          </span>
          <span className="r" />
        </div>
        <div className="pay-ext-body">
          {kind === "bank" ? (
            <>
              {sk("48px", 48, "is-c")}
              {sk("62%", 22)}
              {sk("92%", 14)}
              {sk("78%", 14)}
              {sk("100%", 50, "", 8)}
              <span className="pay-sk is-pill" style={{ width: "100%", height: 56, marginTop: "auto" }} />
            </>
          ) : (
            <>
              {sk("40px", 40, "is-c")}
              {sk("70%", 22)}
              {sk("100%", 50, "", 8)}
              {sk("100%", 50)}
              {sk("48%", 50)}
              {sk("86%", 14, "", 8)}
              <span className="pay-sk is-pill" style={{ width: "100%", height: 56, marginTop: "auto" }} />
            </>
          )}
          <span className="pay-ext-cap">{who}’s own screen</span>
        </div>
      </div>
    </>
  );
}

export function PaySheet({
  invite,
  initialState = "ready",
  newPricePence = 2500,
  seeOtherHref,
  onClose,
  onPaid,
}: {
  invite: OpenInvite;
  initialState?: PayState;
  /** The "price changed" state: what the host changed it to. */
  newPricePence?: number;
  seeOtherHref: string;
  onClose: () => void;
  /** The payment went through: the plan page behind flips to "You're in". `pence` is what was taken. */
  onPaid: (pence: number) => void;
}) {
  const id = useId();
  const host = invite.host.firstName;
  const listed = invite.cost?.pricePence ?? 0;
  const [state, setState] = useState<PayState>(initialState);
  const [paying, setPaying] = useState(initialState === "price" ? newPricePence : listed);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const amount = gbp(listed);
  const chatHref = invite.you.chatId ? messageThreadHref(invite.you.chatId) : messageThreadHref(`chat-${invite.id}`);
  const receiptHref = openInviteReceiptHref(invite.id);

  /** Pay: "Paying…", then the plan says yes. */
  function pay(pence: number) {
    if (state === "paying") return;
    setPaying(pence);
    setState("paying");
    timer.current = setTimeout(() => {
      onPaid(pence);
      setState("success");
    }, PAY_DELAY_MS);
  }

  if (state === "bank-screen") {
    return <HandOffScreen who="Your bank" address="Your bank" kind="bank" cancel="Cancel" onCancel={() => setState("bank")} />;
  }

  let body: ReactNode;
  switch (state) {
    case "ready":
    case "paying":
    case "declined": {
      const busy = state === "paying";
      const bad = state === "declined";
      body = (
        <>
          <PayHead
            id={id}
            title="Pay and join."
            sub={busy ? `Taking your ${gbp(paying)}. Please stay on this screen.` : `Your place is held for ${bad ? "7" : "10"} minutes.`}
            onClose={onClose}
            closeOff={busy}
          />
          <PlanTile invite={invite} photoOf={invite.host}>
            <PriceLines lines={{ kind: "pay", pence: listed }} />
          </PlanTile>
          <MoneyList
            items={[
              { icon: "banknote", text: heldLine(amount, host) },
              ...(bad ? [] : [{ icon: "undo" as const, text: REFUND_RULE }]),
            ]}
          />
          <button type="button" className={`pay-apple${busy ? " is-off" : ""}`} disabled={busy} onClick={() => pay(listed)}>
            <AppleMark />
            <span>Pay</span>
          </button>
          <div className="pay-or">
            <span>or pay by card</span>
          </div>
          <CardBox mode={busy ? "off" : bad ? "error" : "empty"} />
          {bad ? (
            <div className="pay-alert" role="alert">
              <Icon name="circle-alert" size={18} />
              <span>
                <b>Your card was declined.</b> Nothing was taken. Try another card or Apple Pay.
              </span>
            </div>
          ) : null}
          <PayActions tight={bad}>
            <Button block pending={busy} icon={busy ? undefined : <Icon name="lock" size={18} />} onClick={busy ? undefined : () => pay(listed)}>
              {busy ? "Paying…" : `Pay ${amount}`}
            </Button>
          </PayActions>
        </>
      );
      break;
    }
    case "bank":
      body = (
        <>
          <PayMark icon="shield-check" tone="line" />
          <PayHead id={id} title="Check with your bank." />
          <p className="pay-p">Your bank wants to check it’s you. This is normal for card payments.</p>
          <ol className="pay-steps">
            {[
              "Open your banking app, or follow the steps on your bank’s screen.",
              `Approve the ${amount} payment.`,
              "You’ll come straight back here.",
            ].map((step, index) => (
              <li className="pay-step" key={step}>
                <span className="mk-serif">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <MoneyList
            items={[{ icon: "banknote", text: `Nothing has been taken yet. Your ${amount} only leaves your account when you approve it.` }]}
          />
          <PayActions>
            <Button block variant="outline" onClick={() => setState("ready")}>
              Cancel payment
            </Button>
          </PayActions>
        </>
      );
      break;
    case "full":
      body = (
        <>
          <PayMark icon="info" tone="line" />
          <PayHead id={id} title="That was the last place." />
          <p className="pay-p">Someone got there first. We haven’t taken your {amount}, so there’s nothing to refund.</p>
          <PlanTile invite={invite} photoOf={invite.host} />
          <PayActions>
            <Button block href={invite.you.askThreadId ? messageThreadHref(invite.you.askThreadId) : undefined} icon={<Icon name="message" size={20} />}>
              {`Ask ${host}`}
            </Button>
            <Button block variant="outline" href={seeOtherHref}>
              See other plans
            </Button>
          </PayActions>
        </>
      );
      break;
    case "full-refunded":
      body = (
        <>
          <PayMark icon="info" tone="line" />
          <PayHead id={id} title="That was the last place." />
          <p className="pay-p">Someone paid a moment before you. We’ve refunded your {amount} in full.</p>
          <PlanTile invite={invite} photoOf={invite.host} />
          <MoneyList
            items={[{ icon: "undo", text: `Your ${amount} is on its way back to your card. It usually lands in ${BACK_5_10}.` }]}
          />
          <PayActions>
            <Button block href={seeOtherHref}>
              See other plans
            </Button>
            <Button block variant="outline" href={receiptHref}>
              See receipt
            </Button>
          </PayActions>
        </>
      );
      break;
    case "price": {
      const now = gbp(newPricePence);
      body = (
        <>
          <PayMark icon="info" tone="line" />
          <PayHead id={id} title="The price changed." />
          <p className="pay-p">
            {host} changed it from {amount} to {now} while you were paying. Nothing has been taken.
          </p>
          <PlanTile invite={invite} photoOf={invite.host}>
            <PriceLines lines={{ kind: "changed", wasPence: listed, nowPence: newPricePence }} />
          </PlanTile>
          <MoneyList items={[{ icon: "banknote", text: heldLine(now, host) }]} />
          <PayActions>
            <Button block icon={<Icon name="lock" size={18} />} onClick={() => pay(newPricePence)}>
              {`Pay ${now} and join`}
            </Button>
            <Button block variant="outline" onClick={onClose}>
              Not now
            </Button>
          </PayActions>
        </>
      );
      break;
    }
    case "hold-expired":
      body = (
        <>
          <PayMark icon="clock" tone="line" />
          <PayHead id={id} title="Your place is no longer held." />
          <p className="pay-p">
            <b>Nothing was taken.</b> We hold a place for 10 minutes while you pay, and that time is up.
          </p>
          <PlanTile invite={invite} photoOf={invite.host} />
          <PayActions>
            <Button block onClick={() => setState("ready")}>
              Try again
            </Button>
            <Button block variant="outline" onClick={onClose}>
              Close
            </Button>
          </PayActions>
        </>
      );
      break;
    case "success":
      body = (
        <>
          <PayMark icon="check" />
          <PayHead id={id} title="You’re in." />
          <p className="pay-p">{host} can see you’re in. The plan chat is open, so say hello.</p>
          <PlanTile invite={invite} photoOf={invite.host}>
            <PriceLines lines={{ kind: "paid", pence: paying }} />
          </PlanTile>
          <MoneyList
            items={[
              { icon: "banknote", text: heldLine(gbp(paying), host) },
              {
                icon: "mail",
                text: (
                  <>
                    Receipt sent to {invite.you.receiptEmail}.{" "}
                    <KitLink className="mk-inline-link" href={receiptHref}>
                      See receipt
                    </KitLink>
                  </>
                ),
              },
            ]}
          />
          <PayActions>
            <Button block href={chatHref} icon={<Icon name="message" size={20} />}>
              Open chat
            </Button>
            <Button block variant="outline" onClick={onClose}>
              Done
            </Button>
          </PayActions>
        </>
      );
      break;
    case "load-error":
      body = (
        <>
          <PayMark icon="circle-alert" tone="bad" />
          <PayHead id={id} title="We couldn’t open payment." />
          <p className="pay-p">
            <b>Nothing was taken.</b> Check your connection and try again. Your place is still held for 8 minutes.
          </p>
          <PayActions>
            <Button block onClick={() => setState("ready")}>
              Try again
            </Button>
            <Button block variant="outline" onClick={onClose}>
              Close
            </Button>
          </PayActions>
        </>
      );
      break;
  }

  return (
    <Sheet labelledBy={id} onClose={onClose} dismissable={state !== "paying"} variant="pay">
      {body}
      <span className="mk-sr" role="status" aria-live="polite">
        {state === "paying" ? "Taking your payment. Please stay on this screen." : state === "success" ? "You’re in." : ""}
      </span>
    </Sheet>
  );
}
