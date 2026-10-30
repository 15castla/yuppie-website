import "server-only";

import type Stripe from "stripe";

// The end of a subscription's current billing period, in seconds. API
// versions from 2025-03-31 (basil) keep it on each item; older ones on the
// subscription itself. A webhook endpoint pinned to an older version sends
// the older shape, so both are read.
export function periodEndSeconds(sub: Stripe.Subscription): number | null {
  const item = sub.items?.data?.[0]?.current_period_end;
  if (item) return item;
  const legacy = (sub as unknown as { current_period_end?: number | null }).current_period_end;
  return legacy ?? null;
}
