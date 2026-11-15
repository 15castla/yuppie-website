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
// Two sheets share PayBody (every state's words): PaySheet here is the preview
// harness's, with static markup that looks like the fields Stripe draws and a
// Pay that only changes what the tab shows. The real one is LivePaySheet
// (./live-pay-sheet.tsx, 15 Nov 2026): it holds the place, mounts Stripe's
// Payment Element in the same spot, and shows what the server answered.
//
// needs_device_check: Apple Pay, the card fields, the 3D Secure window, the
// keyboard pushing the sheet up, the sheet's height against Safari's toolbars,
// the bottom padding on the home indicator.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Button, Icon, KitLink, useExample } from "@/components/members/kit";
import { gbp, memberPricePence } from "@/lib/members/invite/format";
import type { OpenInvite } from "@/lib/members/invite/types";
import { messageThreadHref, openInviteReceiptHref } from "@/lib/members/routes";
import { Sheet, useModalFocus } from "@/components/members/invite/sheet";
import { BACK_5_10, heldLine, MoneyList, PayActions, PayHead, PayMark, PayPlanLine, PlanTile, PriceLines } from "./pay-parts";

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
  | "load-error"
  // the live sheet (15 Nov 2026, ./live-pay-sheet.tsx): holding the place and opening payment; back from the
  // bank's own page, checking; the payment still being checked by the bank
  | "opening"
  | "checking"
  | "pending"
  // Club Yuppie credit covers it all (16 Nov 2026): no card, one tap
  | "credit"
  | "credit-paying";

/** How long "Paying…" shows before the demo says yes (the stand-in for the server). */
export const PAY_DELAY_MS = 1300;

function AppleMark() {
  return (
    <svg className="pay-apple-g" width="17" height="21" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
    </svg>
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

/** Every state's words and buttons (the demo sheet and the live one). `fields`: Stripe's Payment Element (live). */
export function PayBody({
  id,
  state,
  invite,
  listed,
  paying,
  newPricePence,
  seeOtherHref,
  fields,
  fieldsReady = true,
  declinedMessage = null,
  example = false,
  feePence = 0,
  creditPence = 0,
  creditLeftPence = 0,
  onPayCredit,
  onClose,
  onPay,
  onPayNewPrice,
  onRetry,
  onCancelBank,
}: {
  id: string;
  state: PayState;
  invite: OpenInvite;
  /** What a member pays, as the page drew it (the place and the booking fee). */
  listed: number;
  /** Club Yuppie's booking fee in that (15 Nov 2026); 0: none. */
  feePence?: number;
  /** The member's Club Yuppie credit put towards it (16 Nov 2026); the card pays `paying`, the rest. */
  creditPence?: number;
  /** "credit": what is left of their credit after this. */
  creditLeftPence?: number;
  /** "credit": Pay with credit. */
  onPayCredit?: () => void;
  /** What is being (or was) taken. */
  paying: number;
  newPricePence: number;
  seeOtherHref: string;
  fields?: ReactNode;
  fieldsReady?: boolean;
  declinedMessage?: string | null;
  example?: boolean;
  onClose: () => void;
  onPay: () => void;
  onPayNewPrice: () => void;
  onRetry: () => void;
  onCancelBank: () => void;
}): ReactNode {
  const host = invite.host.firstName;
  const amount = gbp(listed);
  // The host's part of it (what is held for them); the booking fee is Club Yuppie's.
  const place = gbp(listed - feePence);
  // The money rules in one small line under the button (17 Nov 2026: the sheet is half the screen, like I'm in).
  const moneyRules = feePence
    ? `Held by Club Yuppie until the plan is over, then it goes to ${host}. Leave more than 24 hours before and you get ${place} back (not the ${gbp(feePence)} booking fee).`
    : `Held by Club Yuppie until the plan is over, then it goes to ${host}. Leave more than 24 hours before and you get it all back.`;
  const chatHref = invite.you.chatId ? messageThreadHref(invite.you.chatId) : messageThreadHref(`chat-${invite.id}`);
  const receiptHref = openInviteReceiptHref(invite.id);
  switch (state) {
    case "opening":
    case "checking":
      return (
        <>
          <PayHead id={id} title={state === "opening" ? "Pay and join." : "Checking your payment."} sub={state === "opening" ? "Holding your place." : "This takes a moment."} onClose={onClose} closeOff={state === "checking"} />
          <PayPlanLine invite={invite} pence={listed} feePence={feePence} />
          <div className="pay-loading is-short" aria-hidden="true" />
        </>
      );
    case "credit":
    case "credit-paying": {
      const busy = state === "credit-paying";
      return (
        <>
          <PayHead id={id} title="Pay with your credit." sub="Your credit covers it, so there’s nothing to pay." onClose={onClose} closeOff={busy} />
          <PayPlanLine invite={invite} pence={listed} feePence={feePence} creditPence={listed} />
          <MoneyList items={[{ icon: "gift", text: `${amount} comes off your credit. You’ll have ${gbp(creditLeftPence)} left.` }]} />
          <PayActions>
            <Button block data-needs-net="" pending={busy} disabled={example} onClick={busy ? undefined : onPayCredit}>
              {busy ? "Paying…" : example ? "Coming soon" : "Pay with credit"}
            </Button>
          </PayActions>
          <p className="pay-fine">{moneyRules}</p>
        </>
      );
    }
    case "ready":
    case "paying":
    case "declined": {
      const busy = state === "paying";
      const bad = state === "declined";
      return (
        <>
          <PayHead
            id={id}
            title="Pay and join."
            sub={busy ? `Taking your ${gbp(paying)}. Please stay on this screen.` : bad && !fields ? "Your place is held for 7 minutes." : "Your place is held for 10 minutes."}
            onClose={onClose}
            closeOff={busy}
          />
          <PayPlanLine invite={invite} pence={listed} feePence={feePence} creditPence={creditPence} />
          {fields ?? (
            // The harness's stand-in for Stripe's folded list of ways to pay (the card's fields open when chosen).
            <div className={`pay-methods${busy || example ? " is-off" : ""}`} aria-hidden="true">
              <span>
                <AppleMark />
                Apple Pay
              </span>
              <span>
                <Icon name="credit-card" size={20} />
                Card
              </span>
            </div>
          )}
          {bad ? (
            <div className="pay-alert" role="alert">
              <Icon name="circle-alert" size={18} />
              <span>
                <b>{declinedMessage ?? "Your card was declined."}</b> Nothing was taken. Try another card or Apple Pay.
              </span>
            </div>
          ) : null}
          <PayActions tight={bad}>
            <Button
              block
              data-needs-net=""
              pending={busy}
              disabled={example || !fieldsReady}
              icon={busy || example ? undefined : <Icon name="lock" size={18} />}
              onClick={busy ? undefined : onPay}
            >
              {busy ? "Paying…" : example ? "Coming soon" : `Pay ${creditPence ? gbp(listed - creditPence) : amount}`}
            </Button>
          </PayActions>
          <p className="pay-fine">{moneyRules}</p>
        </>
      );
    }
    case "bank":
      return (
        <>
          <PayMark icon="shield-check" tone="line" />
          <PayHead id={id} title="Check with your bank." />
          <p className="pay-p">Your bank wants to check it’s you. This is normal for card payments.</p>
          <ol className="pay-steps">
            {[
              "Open your banking app, or follow the steps on your bank’s screen.",
              `Approve the ${gbp(paying)} payment.`,
              "You’ll come straight back here.",
            ].map((step, index) => (
              <li className="pay-step" key={step}>
                <span className="mk-serif">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <MoneyList
            items={[{ icon: "banknote", text: `Nothing has been taken yet. Your ${gbp(paying)} only leaves your account when you approve it.` }]}
          />
          {fields ? <div className="pay-bank-fields">{fields}</div> : null}
          <PayActions>
            <Button block variant="outline" onClick={onCancelBank}>
              Cancel payment
            </Button>
          </PayActions>
        </>
      );
    case "pending":
      return (
        <>
          <PayMark icon="clock" tone="line" />
          <PayHead id={id} title="Your payment is being checked." onClose={onClose} />
          <p className="pay-p">
            Your bank is still checking it. You’ll be in as soon as it clears, and if it doesn’t, nothing is taken. We’ll tell you either way.
          </p>
          <PlanTile invite={invite} photoOf={invite.host} />
          <PayActions>
            <Button block onClick={onClose}>
              Close
            </Button>
          </PayActions>
        </>
      );
    case "full":
      return (
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
    case "full-refunded":
      return (
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
    case "price": {
      const now = gbp(newPricePence);
      return (
        <>
          <PayMark icon="info" tone="line" />
          <PayHead id={id} title="The price changed." />
          <p className="pay-p">
            {host} changed it from {amount} to {now} while you were paying. Nothing has been taken.
          </p>
          <PlanTile invite={invite} photoOf={invite.host}>
            <PriceLines lines={{ kind: "changed", wasPence: listed, nowPence: newPricePence }} />
          </PlanTile>
          <MoneyList items={[{ icon: "banknote", text: heldLine(gbp(newPricePence - feePence), host, "would") }]} />
          <PayActions>
            <Button block disabled={example} icon={example ? undefined : <Icon name="lock" size={18} />} onClick={onPayNewPrice}>
              {example ? "Coming soon" : `Pay ${now} and join`}
            </Button>
            <Button block variant="outline" onClick={onClose}>
              Not now
            </Button>
          </PayActions>
        </>
      );
    }
    case "hold-expired":
      return (
        <>
          <PayMark icon="clock" tone="line" />
          <PayHead id={id} title="Your place is no longer held." />
          <p className="pay-p">
            <b>Nothing was taken.</b> We hold a place for 10 minutes while you pay, and that time is up.
          </p>
          <PlanTile invite={invite} photoOf={invite.host} />
          <PayActions>
            <Button block onClick={onRetry}>
              Try again
            </Button>
            <Button block variant="outline" onClick={onClose}>
              Close
            </Button>
          </PayActions>
        </>
      );
    case "success":
      return (
        <>
          <PayMark icon="check" />
          <PayHead id={id} title="You’re in." />
          <p className="pay-p">{host} can see you’re in. The plan chat is open, so say hello.</p>
          <PlanTile invite={invite} photoOf={invite.host}>
            <PriceLines lines={{ kind: "paid", pence: paying, feePence }} />
          </PlanTile>
          <MoneyList
            items={[
              { icon: "banknote", text: heldLine(gbp(paying - feePence), host) },
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
    case "load-error":
      return (
        <>
          <PayMark icon="circle-alert" tone="bad" />
          <PayHead id={id} title="We couldn’t open payment." />
          <p className="pay-p">
            <b>Nothing was taken.</b> Check your connection and try again.
          </p>
          <PayActions>
            <Button block onClick={onRetry}>
              Try again
            </Button>
            <Button block variant="outline" onClick={onClose}>
              Close
            </Button>
          </PayActions>
        </>
      );
    case "bank-screen":
      return null;
  }
}

/** The screen reader's line while paying, and once in. */
export function payLiveLine(state: PayState): string {
  return state === "paying" ? "Taking your payment. Please stay on this screen." : state === "success" ? "You’re in." : "";
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
  // Example screens on the live site: taking money is not built here, so nothing can pay (kit/example-note).
  // The entry points already say "Coming soon"; this is the second lock.
  const example = useExample();
  const listed = memberPricePence(invite.cost);
  const feePence = invite.cost?.bookingFeePence ?? 0;
  const [state, setState] = useState<PayState>(initialState);
  const [paying, setPaying] = useState(initialState === "price" ? newPricePence : listed);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  /** Pay: "Paying…", then the plan says yes (the demo). */
  function pay(pence: number) {
    if (state === "paying" || example) return;
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

  return (
    <Sheet labelledBy={id} onClose={onClose} dismissable={state !== "paying"} variant="pay">
      <PayBody
        id={id}
        state={state}
        invite={invite}
        listed={listed}
        feePence={feePence}
        paying={paying}
        newPricePence={newPricePence}
        seeOtherHref={seeOtherHref}
        example={example}
        onClose={onClose}
        onPay={() => pay(listed)}
        onPayNewPrice={() => pay(newPricePence)}
        onRetry={() => setState("ready")}
        onCancelBank={() => setState("ready")}
      />
      <span className="mk-sr" role="status" aria-live="polite">
        {payLiveLine(state)}
      </span>
    </Sheet>
  );
}
