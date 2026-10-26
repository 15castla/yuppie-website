"use client";

// Open Invite > post a plan > "Add a cost". Kit counterpart: pages_oi.cost_block()
// with price_field(), get_paid_tile() and the five cost errors. The paid-plans
// flag decides whether the post form draws it at all; with the switch off
// nothing else on the form changes.
//
//   switch off   the default: "Add a cost" and one line, nothing else
//   switch on    "Price per person" (£ in front, "a person" after), the tick
//                box "I'm not charging more than it cost me", the money note
//                and the Get paid step
//   Get paid     not set up, needs more info, in review: a tile with the
//                status and the next step; ready: one line
//
// Errors are written in the form, and the first one takes focus on Post
// (price, then the tick box, then the Get paid step). Posting stays one
// full-ink button in every state (RULE-38).
//
// Get paid copy: A draws the tile for "not set up" and "ready". The other two
// statuses use the payments design's words (payments.md section 3.5).
//
// LOCAL DEMO STATE: nothing is saved. "Done" on the Stripe outline screen only
// marks Get paid ready in this tab (components/members/payments/get-paid.tsx).

import { Button, Icon, KitLink, Pill, Status } from "@/components/members/kit";
import { cleanPrice, usablePence, type CostErrors, type CostValues } from "@/lib/members/invite/cost";
import { gbp } from "@/lib/members/invite/format";
import type { GetPaidStatus } from "@/lib/members/invite/types";
import { ROUTES } from "@/lib/members/routes";
import { cn } from "@/lib/utils";
import { CheckRow, FieldError, Lab } from "./form-parts";
import type { GetPaidMode } from "@/components/members/payments/get-paid";

export type CostIds = { switch: string; price: string; tick: string; getPaid: string };

function GetPaidTile({
  id,
  status,
  error,
  onMode,
}: {
  id: string;
  status: GetPaidStatus;
  error?: string;
  onMode: (mode: Exclude<GetPaidMode, null>) => void;
}) {
  if (status === "ready") {
    return (
      <div className="oi-gp-ready" id={id} tabIndex={-1}>
        <Status>Get paid is ready</Status>
        <KitLink className="mk-link" href={ROUTES.youPayments}>
          Money details
        </KitLink>
      </div>
    );
  }
  const label = status === "not-set-up" ? "Not set up" : status === "needs-info" ? "Needs more info" : "In review";
  const words =
    status === "not-set-up"
      ? "Add your bank details so Club Yuppie can pay you. You only do this once."
      : status === "needs-info"
        ? "Stripe needs a little more before it can pay you. Your money is safe and nothing is lost."
        : "Stripe is checking your details. You can add a cost as soon as that’s done. We’ll tell you.";
  return (
    <div className={cn("oi-gp", error && "is-error")} id={id} tabIndex={-1} aria-describedby={error ? `${id}-e` : undefined}>
      <div className="oi-gp-top">
        <span className="mk-icon-tile" aria-hidden="true">
          <Icon name="banknote" size={22} />
        </span>
        <div className="bd">
          <div className="mk-t">
            <b>Get paid</b>
            <Pill className={status === "needs-info" ? "mk-warn" : undefined}>{label}</Pill>
          </div>
          <span>{words}</span>
        </div>
      </div>
      {status !== "in-review" ? (
        <Button size="sm" onClick={() => onMode(status === "not-set-up" ? "intro" : "stripe")}>
          {status === "not-set-up" ? "Set up Get paid" : "Add the missing info"}
        </Button>
      ) : null}
      <FieldError id={`${id}-e`} message={error} />
    </div>
  );
}

export function CostBlock({
  ids,
  cost,
  errors,
  getPaid,
  disabled = false,
  onChange,
  onMode,
}: {
  ids: CostIds;
  cost: CostValues;
  errors: CostErrors;
  getPaid: GetPaidStatus;
  disabled?: boolean;
  onChange: (patch: Partial<CostValues>) => void;
  onMode: (mode: Exclude<GetPaidMode, null>) => void;
}) {
  const pence = usablePence(cost);
  const amount = pence === null ? "the full price" : gbp(pence);
  return (
    <div className={cn("oi-cost", cost.on && "is-on")}>
      <div className="oi-cost-head">
        <div className="tx">
          <b id={`${ids.switch}-l`}>Add a cost</b>
          <span id={`${ids.switch}-d`}>For spare tickets or a shared cost. Most plans stay free.</span>
        </div>
        <button
          id={ids.switch}
          type="button"
          role="switch"
          aria-checked={cost.on}
          aria-labelledby={`${ids.switch}-l`}
          aria-describedby={`${ids.switch}-d`}
          className={cn("oi-switch", cost.on && "is-on")}
          disabled={disabled}
          onClick={() => onChange({ on: !cost.on })}
        >
          <span className="knob" />
        </button>
      </div>
      {cost.on ? (
        <div className="oi-cost-body">
          <Lab htmlFor={ids.price} text="Price per person" />
          <div className={cn("oi-in oi-price", errors.price && "is-error", disabled && "is-off")}>
            <span className="gbp" aria-hidden="true">
              £
            </span>
            <input
              id={ids.price}
              type="text"
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              placeholder="0.00"
              value={cost.price}
              disabled={disabled}
              aria-invalid={errors.price ? true : undefined}
              aria-describedby={errors.price ? `${ids.price}-e` : `${ids.price}-h`}
              onChange={(event) => onChange({ price: cleanPrice(event.target.value) })}
            />
            <span className="per" aria-hidden="true">
              a person
            </span>
          </div>
          {errors.price ? (
            <FieldError id={`${ids.price}-e`} message={errors.price} />
          ) : (
            <div className="oi-help" id={`${ids.price}-h`}>
              In pounds, for each person who joins.
            </div>
          )}
          <CheckRow
            id={ids.tick}
            checked={cost.tick}
            disabled={disabled}
            error={Boolean(errors.faceValue)}
            describedBy={errors.faceValue ? `${ids.tick}-e` : undefined}
            onChange={(next) => onChange({ tick: next })}
            label="I’m not charging more than it cost me"
            sub="Club Yuppie plans share costs. They don’t make money."
          />
          <FieldError id={`${ids.tick}-e`} message={errors.faceValue} />
          <p className="oi-moneynote">
            <Icon name="banknote" size={20} />
            <span>You get {amount}. Club Yuppie covers the card fees. Paid out about 2 days after the plan.</span>
          </p>
          <GetPaidTile id={ids.getPaid} status={getPaid} error={errors.getPaid} onMode={onMode} />
        </div>
      ) : null}
    </div>
  );
}
