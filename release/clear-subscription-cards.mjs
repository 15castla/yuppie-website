// Optional release step (N1): subscriptions made before this release carry their own default_payment_method,
// which wins over the customer's invoice default. The code now handles that (customer.updated moves a new card
// onto such a subscription, and approve no longer sets one), so this is optional: it removes the
// subscription-level card from existing subscriptions, so the customer's default (the card the member manages in
// the billing portal) is the one Stripe charges from now on.
//
// For each member's live subscription with a card of its own:
//   * the customer's invoice default is the same card: the subscription's card is removed (nothing else changes);
//   * the customer has no invoice default: that card becomes the customer's default first, then is removed from
//     the subscription (the member is charged the same card as before);
//   * the customer's default is a different card: left alone and reported (which card the member wants is
//     theirs to say: check by hand).
// Every Stripe write has an idempotency key. Safe to run again (a second run finds nothing to do).
//
// Run by Claude Code from the repo root with the live keys in the environment (STRIPE_SECRET_KEY,
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY), after the deploy:
//
//   node release/clear-subscription-cards.mjs            # dry run: prints what it would do, changes nothing
//   node release/clear-subscription-cards.mjs --apply    # does it
//
// Options (for testing): --only-email-prefix <p>.
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const prefixAt = args.indexOf('--only-email-prefix');
const ONLY_PREFIX = prefixAt >= 0 ? args[prefixAt + 1] : null;
for (const name of ['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY']) {
  if (!process.env[name]) {
    console.error(`${name} is not set`);
    process.exit(2);
  }
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const idOf = (v) => (typeof v === 'string' ? v : v?.id ?? null);

// Every row, a page at a time: PostgREST answers at most its max-rows setting (1000 on Supabase) per request.
async function readAll(query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) return { data: null, error };
    rows.push(...data);
    if (data.length < 1000) return { data: rows, error: null };
  }
}

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: subscriptions with a card of their own${ONLY_PREFIX ? ` (members ${ONLY_PREFIX}*)` : ''}`);
const { data: members, error } = await readAll(() =>
  db
    .from('members')
    .select('id, email, stripe_customer_id, stripe_subscription_id')
    .not('stripe_subscription_id', 'is', null)
    .is('deleted_at', null)
    .is('ended_at', null)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true }),
);
if (error) {
  console.error('reading members failed:', error.message);
  process.exit(1);
}
const todo = members.filter((m) => !ONLY_PREFIX || m.email.startsWith(ONLY_PREFIX));

let changed = 0;
let problems = 0;
const look = [];
for (const m of todo) {
  const label = `${m.email} (${m.id})`;
  try {
    const sub = await stripe.subscriptions.retrieve(m.stripe_subscription_id);
    if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
      console.log(`  ${label}: subscription ${sub.id} is ${sub.status}: nothing to do`);
      continue;
    }
    const own = idOf(sub.default_payment_method);
    if (!own) {
      console.log(`  ${label}: follows the customer's default already`);
      continue;
    }
    const customerId = idOf(sub.customer) ?? m.stripe_customer_id;
    const customer = await stripe.customers.retrieve(customerId);
    const theirs = customer.deleted ? null : idOf(customer.invoice_settings?.default_payment_method);
    if (theirs && theirs !== own) {
      look.push(`${label}: the subscription charges ${own}, the customer's default is ${theirs}`);
      console.log(`  ${label}: two different cards: left alone (see below)`);
      continue;
    }
    console.log(`  ${label}: ${theirs ? '' : `make ${own} the customer's default, then `}remove ${own} from subscription ${sub.id}`);
    if (APPLY) {
      if (!theirs) {
        await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: own } }, { idempotencyKey: `release-customer-card-${customerId}-${own}` });
      }
      await stripe.subscriptions.update(sub.id, { default_payment_method: '' }, { idempotencyKey: `release-clear-sub-card-${sub.id}-${own}` });
      changed += 1;
    }
  } catch (err) {
    problems += 1;
    console.error(`  ${label}: FAILED: ${err?.message ?? err}`);
  }
}
console.log(`${todo.length} member(s) looked at; ${APPLY ? `${changed} changed` : 'nothing changed (dry run)'}; ${problems} problem(s)`);
if (look.length) {
  console.log('Needs a look (not changed):');
  for (const line of look) console.log(`  ${line}`);
}
process.exit(problems ? 1 : 0);
