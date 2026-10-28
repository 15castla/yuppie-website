// Release step (QA3-01): bookings made before the Phase A migration have amount_pence = 0 although the member
// paid (the old code did not store the amount). The new code reads the payment from Stripe when it refunds such
// a booking, but the admin's attendee list, the booking card and the emails read amount_pence. This fills it
// from Stripe, and records any refund already made in Stripe (by hand in the Dashboard) on the booking.
//
// Run by Claude Code after the deploy, from the repo root, with the live keys in the environment (never in a
// file or a chat): STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY.
//
//   node release/backfill-booking-amounts.mjs            # dry run: prints what it would change, changes nothing
//   node release/backfill-booking-amounts.mjs --apply    # makes the changes it printed
//
// Options (for testing): --only-email-prefix <p> (only bookings of members whose email starts with p).
// Safe to run again: it only touches bookings that still have amount_pence = 0 and a payment intent, and each
// update is made only while the row still says 0. Exit code 1 when anything could not be read or saved.
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
const pounds = (p) => `£${Math.floor(p / 100)}${p % 100 ? `.${String(p % 100).padStart(2, '0')}` : ''}`;

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: bookings with a payment intent and amount_pence 0${ONLY_PREFIX ? ` (members ${ONLY_PREFIX}*)` : ''}`);
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
const { data: rows, error } = await readAll(() =>
  db
    .from('bookings')
    .select('id, status, member_id, event_id, stripe_payment_intent_id, amount_pence, refund_status, refund_pence, stripe_refund_id, cancel_reason, member:members(email), event:events(title, start_time)')
    .eq('amount_pence', 0)
    .not('stripe_payment_intent_id', 'is', null)
    .order('booked_at', { ascending: true })
    .order('id', { ascending: true }),
);
if (error) {
  console.error('reading bookings failed:', error.message);
  process.exit(1);
}
const one = (v) => (Array.isArray(v) ? v[0] : v) ?? null;
const todo = rows.filter((r) => !ONLY_PREFIX || (one(r.member)?.email ?? '').startsWith(ONLY_PREFIX));

let changed = 0;
let problems = 0;
const checkByHand = [];
for (const b of todo) {
  const label = `booking ${b.id} (${one(b.member)?.email ?? b.member_id}, ${one(b.event)?.title ?? b.event_id}, ${b.status})`;
  try {
    const pi = await stripe.paymentIntents.retrieve(b.stripe_payment_intent_id);
    const received = pi.status === 'succeeded' ? pi.amount_received ?? 0 : 0;
    const refunds = (await stripe.refunds.list({ payment_intent: pi.id, limit: 100 })).data.filter((r) => r.status === 'succeeded' || r.status === 'pending');
    const refunded = refunds.reduce((sum, r) => sum + r.amount, 0);
    const latest = [...refunds].sort((x, y) => y.created - x.created)[0] ?? null;
    if (received <= 0) {
      console.log(`  ${label}: payment ${pi.id} is ${pi.status}, nothing received: left as it is`);
      continue;
    }
    const update = { amount_pence: received };
    // In full: the booking's refund is done. In part (£5 of £15, by hand): recorded, and the booking stays
    // refundable for the rest (refund_status unchanged; the app refunds only what is left).
    const full = refunded >= received;
    if (refunded > 0 && (b.refund_pence !== refunded || (full && b.refund_status !== 'succeeded'))) {
      Object.assign(update, {
        refund_pence: refunded,
        stripe_refund_id: latest?.id ?? b.stripe_refund_id,
        ...(full ? { refund_status: refunds.every((r) => r.status === 'succeeded') ? 'succeeded' : 'pending', refund_error: null } : {}),
      });
    }
    const parts = [`amount ${pounds(received)}`];
    if ('refund_pence' in update) {
      parts.push(full
        ? `refund already made in Stripe: ${pounds(refunded)} (${latest?.id}), ${update.refund_status}`
        : `part refund already made in Stripe: ${pounds(refunded)} of ${pounds(received)} (${latest?.id}); the other ${pounds(received - refunded)} stays refundable`);
    }
    console.log(`  ${label}: ${parts.join('; ')}`);
    if (b.status === 'confirmed' && refunded >= received) checkByHand.push(`${label}: refunded in full in Stripe but still confirmed`);
    if (APPLY) {
      const { data: saved, error: saveError } = await db.from('bookings').update(update).eq('id', b.id).eq('amount_pence', 0).select('id');
      if (saveError) throw saveError;
      if (!saved?.length) console.log('    (changed since it was read: skipped)');
      else changed += 1;
    }
  } catch (err) {
    problems += 1;
    console.error(`  ${label}: FAILED: ${err?.message ?? err}`);
  }
}
console.log(`${todo.length} booking(s) looked at; ${APPLY ? `${changed} changed` : 'nothing changed (dry run)'}; ${problems} problem(s)`);
if (checkByHand.length) {
  console.log('Check by hand (not changed by this script):');
  for (const line of checkByHand) console.log(`  ${line}`);
}
process.exit(problems ? 1 : 0);
