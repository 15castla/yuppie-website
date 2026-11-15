"use client";

// Open Invite > post a plan > "Add a cost". Kit counterpart: pages_oi.cost_block()
// with price_field(), get_paid_tile() and the five cost errors. The paid-plans
// flag decides whether the post form draws it at all; with the switch off
// nothing else on the form changes.
//
//   switch off   the default: "Add a cost" and one line, nothing else
//   switch on    "Price per person" (£ in front, "a person" after), the tick
//                box "I'm not charging more than it cost me" and the money note
//
// No Get paid step since 16 Nov 2026 (Albert: "the vinted way"): a host adds a
// price with nothing set up, and once the plan is over chooses Club Yuppie
// credit or their bank (Get paid then, on You > Payments).
//
// Errors are written in the form, and the first one takes focus on Post
// (price, then the tick box). Posting stays one full-ink button in every state
// (RULE-38).

import { Icon } from "@/components/members/kit";
import { cleanPrice, usablePence, type CostErrors, type CostValues } from "@/lib/members/invite/cost";
import { gbp } from "@/lib/members/invite/format";
import { BOOKING_FEE_PENCE, type GetPaidStatus } from "@/lib/members/invite/types";
import { cn } from "@/lib/utils";
import { CheckRow, FieldError, Lab } from "./form-parts";
import type { GetPaidMode } from "@/components/members/payments/get-paid";

export type CostIds = { switch: string; price: string; tick: string; getPaid: string };

export function CostBlock({
  ids,
  cost,
  errors,
  getPaid,
  disabled = false,
  onChange,
}: {
  ids: CostIds;
  cost: CostValues;
  errors: CostErrors;
  getPaid: GetPaidStatus;
  disabled?: boolean;
  onChange: (patch: Partial<CostValues>) => void;
  /** Unused since 16 Nov 2026 (no Get paid step); kept for the callers. */
  onMode?: (mode: Exclude<GetPaidMode, null>) => void;
}) {
  void getPaid;
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
            <span>
              {pence === null
                ? `You get the full price. Members pay it plus Club Yuppie’s ${gbp(BOOKING_FEE_PENCE)} booking fee, which covers the card fees.`
                : `You get ${amount}. Members pay ${gbp(pence + BOOKING_FEE_PENCE)}: your price and Club Yuppie’s ${gbp(BOOKING_FEE_PENCE)} booking fee, which covers the card fees.`}{" "}
              Once the plan is over it’s yours: add it to your Club Yuppie credit, or withdraw it to your bank.
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
