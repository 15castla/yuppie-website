// The pieces every event sheet is made of: the event in the summary tile (date column, title, time and place,
// with an optional money line), the demo card fields the preview draws where Stripe's own fields go, and the
// sheet frame. Kit counterparts: pages_r2a ev_sum(), pages_pay p_apple(), p_or(), p_card(), sheet_ov(), dlg_ov().

import type { ReactNode } from "react";

import { DateColumn, Icon } from "@/components/members/kit";
import { Sheet } from "@/components/members/invite/sheet";
import { rowDate } from "@/lib/members/event-dates";
import { gbp, timeAndPlaceLine, type EventPageEvent } from "./model";

import "@/components/members/payments/payments.css";
import "./event.css";

export function EventSummary({
  event,
  line,
}: {
  event: Pick<EventPageEvent, "title" | "startTime" | "location">;
  /** The one money line under the event: "You’ll pay £25", "Paid £25", "You paid £25", "Included in your membership £0". */
  line?: { label: string; pence: number } | null;
}) {
  const date = rowDate(event.startTime);
  return (
    <div className="pay-sum bk-sum">
      <div className="hd">
        <DateColumn weekday={date.weekday} day={date.day} />
        <div className="tx">
          <b className="pay-t">{event.title}</b>
          <span className="m">{timeAndPlaceLine(event)}</span>
        </div>
      </div>
      {line ? (
        <div className="pay-lines">
          <div className="pay-line is-total">
            <span>{line.label}</span>
            <b>{gbp(line.pence)}</b>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The exact address in its own tile (confirmed sheet, computer card). Only ever drawn for a confirmed booking. */
export function AddressTile({ place, address, className }: { place: string | null; address: string | null; className?: string }) {
  return (
    <div className={`ea-addr ${className ?? ""}`.trim()}>
      <Icon name="map-pin" size={20} />
      <div>
        <b>{place?.trim() || "The venue"}</b>
        <span>{address ?? "We’ll email you the exact address before the day."}</span>
      </div>
    </div>
  );
}

function AppleMark() {
  return (
    <svg className="pay-apple-g" width="17" height="21" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
    </svg>
  );
}

/**
 * PREVIEW ONLY: Apple Pay and the card box as the design draws them, where the real page mounts Stripe's own
 * Payment Element (Stripe draws those fields; nothing here takes a card).
 */
export function DemoPayFields({ mode }: { mode: "empty" | "error" | "off" }) {
  const cls = mode === "error" ? " is-error" : mode === "off" ? " is-off" : "";
  const ph = (text: string) => <span className="mk-ph">{text}</span>;
  return (
    <>
      <div className={`pay-apple${mode === "off" ? " is-off" : ""}`} aria-hidden="true">
        <AppleMark />
        <span>Pay</span>
      </div>
      <div className="pay-or">
        <span>or pay by card</span>
      </div>
      <div className="pay-lab" id="bk-card-label">
        Card details
      </div>
      <div className={`pay-cb${cls}`} role="img" aria-labelledby="bk-card-label">
        <div className="r1">
          {ph("1234 1234 1234 1234")}
          <Icon name="credit-card" size={22} />
        </div>
        <div className="r2">
          <div>{ph("MM / YY")}</div>
          <div>{ph("CVC")}</div>
        </div>
      </div>
    </>
  );
}

/** A bottom sheet on a phone, the 520px dialog from 768px: the approved pay sheet's frame. */
export function EventSheet({
  labelledBy,
  onClose,
  dismissable,
  status,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  dismissable: boolean;
  /** Read out when it changes ("Taking your payment…", "You’re booked."). */
  status?: string;
  children: ReactNode;
}) {
  return (
    <Sheet labelledBy={labelledBy} onClose={onClose} dismissable={dismissable} variant="pay" className="bk-sheet">
      {children}
      <span className="mk-sr" role="status" aria-live="polite">
        {status ?? ""}
      </span>
    </Sheet>
  );
}
