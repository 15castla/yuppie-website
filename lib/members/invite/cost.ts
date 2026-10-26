// The post form's cost option, without any React: what a host typed, the five
// errors in the words the design uses, and the check a server repeats. Kept out
// of the client component so the preview harness (a server module) can read it.

import { MAX_PRICE_PENCE, MIN_PRICE_PENCE, type GetPaidStatus } from "./types";

export type CostValues = {
  on: boolean;
  /** What the host typed, in pounds: "40", "22.50". */
  price: string;
  /** "I'm not charging more than it cost me". Off until the host ticks it. */
  tick: boolean;
};

export const EMPTY_COST: CostValues = { on: false, price: "", tick: false };

export type CostErrors = { price?: string; faceValue?: string; getPaid?: string };

const MAX_POUNDS = MAX_PRICE_PENCE / 100;

export const COST_ERROR = {
  blank: "Add a price, or turn off Add a cost.",
  zero: "The price must be more than £0.",
  low: `Enter a price from £${MIN_PRICE_PENCE / 100} to £${MAX_POUNDS}.`,
  high: `The most you can charge is £${MAX_POUNDS} a person.`,
  untick: "Tick the box to say you’re not charging more.",
  getPaid: "Finish Get paid first, then post.",
} as const;

/** Keeps digits and one point, at most two decimals: what a price field takes. */
export function cleanPrice(raw: string): string {
  const only = raw.replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = only.split(".");
  const wholePart = whole.slice(0, 4);
  if (rest.length === 0) return wholePart;
  return `${wholePart}.${rest.join("").slice(0, 2)}`;
}

/** The typed price in pence, or null when nothing usable was typed. */
export function pricePence(price: string): number | null {
  if (price.trim() === "" || price === ".") return null;
  const pounds = Number(price);
  if (!Number.isFinite(pounds)) return null;
  return Math.round(pounds * 100);
}

/** The cost errors. Empty when the switch is off. */
export function validateCost(cost: CostValues, getPaid: GetPaidStatus): CostErrors {
  const errors: CostErrors = {};
  if (!cost.on) return errors;
  const pence = pricePence(cost.price);
  if (pence === null) errors.price = COST_ERROR.blank;
  else if (pence === 0) errors.price = COST_ERROR.zero;
  else if (pence < MIN_PRICE_PENCE) errors.price = COST_ERROR.low;
  else if (pence > MAX_PRICE_PENCE) errors.price = COST_ERROR.high;
  if (!cost.tick) errors.faceValue = COST_ERROR.untick;
  if (getPaid !== "ready") errors.getPaid = COST_ERROR.getPaid;
  return errors;
}

/** The price that can be shown (the preview card, the money note): only a usable one. */
export function usablePence(cost: CostValues): number | null {
  if (!cost.on) return null;
  const pence = pricePence(cost.price);
  return pence !== null && pence >= MIN_PRICE_PENCE && pence <= MAX_PRICE_PENCE ? pence : null;
}

