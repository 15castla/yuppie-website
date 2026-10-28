// Release step (QA3 checklist 2): before members use the new pages, make each member's row agree with Stripe.
// The old code never told the database about a cancel (it only set cancel_at_period_end in Stripe) and
// listened to no subscription webhooks, so a row can say "active" for a subscription that is ending, has ended,
// or has a failed payment. For each member with a Stripe subscription it reads Stripe and sets:
//   * ended (membership_status cancelled, ended_at, ended_reason) when Stripe has ended the subscription;
//   * cancel_at (the day access ends) when Stripe is set to cancel, or clears a cancel date Stripe does not have;
//   * the payment problem (payment_failed_at now, grace_until the end of the London day 3 days later, C-D12)
//     when the latest invoice is unpaid after a try, or clears it when Stripe shows the subscription paid up.
// It reports every change, anything it leaves alone that needs a look (a pause that differs, a member ended
// here whose subscription still bills), and every member with no Stripe subscription (listed, never changed).
// It sends no emails itself. After --apply the memberships job runs (with --site <url>, or by hand: GET
// /api/cron/memberships): it sends the payment-failed email to anyone put in the payment problem state here
// (C-D12, the same dedupe key as the webhook's) and cancels and refunds the future bookings of anyone ended (A-D8).
//
// Run by Claude Code from the repo root with the live keys in the environment (STRIPE_SECRET_KEY,
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY), after the migration and before members use the new pages:
//
//   node release/reconcile-members.mjs            # dry run: prints every change, changes nothing
//   node release/reconcile-members.mjs --apply --site https://clubyuppie.com    # makes them, then runs the job
//
// Options (for testing): --only-email-prefix <p>. Safe to run again (a second run finds nothing to change).
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const prefixAt = args.indexOf('--only-email-prefix');
const ONLY_PREFIX = prefixAt >= 0 ? args[prefixAt + 1] : null;
// --site <url>: after --apply, run the site's memberships job (GET <url>/api/cron/memberships with CRON_SECRET from
// the environment). It sends the payment-failed email to anyone this put in the payment problem state (C-D12, the
// webhook's dedupe key) and cancels and refunds the future bookings of anyone it ended (A-D8).
const siteAt = args.indexOf('--site');
const SITE = siteAt >= 0 ? args[siteAt + 1]?.replace(/\/+$/, '') : null;
for (const name of ['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY']) {
  if (!process.env[name]) {
    console.error(`${name} is not set`);
    process.exit(2);
  }
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// ---------------------------------------------------------------- dates (as lib/server/format.ts)
const wallFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
function londonWall(v) {
  const p = Object.fromEntries(wallFormat.formatToParts(new Date(v)).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour % 24, minute: +p.minute, second: +p.second };
}
function londonWallToDate(y, mo, d, h = 0, mi = 0, s = 0, ms = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  const offsetAt = (t) => { const w = londonWall(t); return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(t / 1000) * 1000; };
  let r = guess - offsetAt(guess);
  r = guess - offsetAt(r);
  return new Date(r);
}
/** The last millisecond of the London day plusDays after value's day (lib/server/format.ts londonEndOfDay). */
function londonEndOfDay(v, plusDays) {
  const w = londonWall(v);
  const x = new Date(Date.UTC(w.year, w.month - 1, w.day + plusDays));
  return londonWallToDate(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate(), 23, 59, 59, 999);
}
const PAYMENT_GRACE_DAYS = 3;
const sec = (iso) => (iso ? Math.floor(new Date(iso).getTime() / 1000) : null);
const iso = (s) => (s ? new Date(s * 1000).toISOString() : null);
const periodEnd = (sub) => sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end ?? null;

// ---------------------------------------------------------------- read
console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: members with a Stripe subscription${ONLY_PREFIX ? ` (${ONLY_PREFIX}*)` : ''}`);
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
const { data: members, error } = await readAll(() =>
  db
    .from('members')
    .select('id, email, membership_status, stripe_subscription_id, cancel_at, cancel_requested_at, payment_failed_at, grace_until, paused_at, ended_at, ended_reason, deleted_at')
    .not('stripe_subscription_id', 'is', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true }),
);
if (error) {
  console.error('reading members failed:', error.message);
  process.exit(1);
}
const todo = members.filter((m) => !ONLY_PREFIX || m.email.startsWith(ONLY_PREFIX));

let changes = 0;
let problems = 0;
const look = [];
const now = new Date();
for (const m of todo) {
  const label = `${m.email} (${m.id})`;
  try {
    let sub = null;
    try {
      sub = await stripe.subscriptions.retrieve(m.stripe_subscription_id, { expand: ['latest_invoice'] });
    } catch (err) {
      if (err?.code !== 'resource_missing') throw err;
    }
    const ended = !sub || sub.status === 'canceled' || sub.status === 'incomplete_expired';
    const update = {};
    const why = [];

    if (m.membership_status === 'cancelled' || m.ended_at) {
      if (!ended) look.push(`${label}: ended here, but Stripe subscription ${sub.id} is ${sub.status} (still billing?)`);
      continue;
    }

    if (ended) {
      const endedAt = sub?.ended_at ? iso(sub.ended_at) : m.cancel_at && new Date(m.cancel_at) <= now ? m.cancel_at : now.toISOString();
      const reason = m.cancel_requested_at || m.cancel_at || sub?.cancellation_details?.reason === 'cancellation_requested'
        ? 'member_cancelled'
        : m.payment_failed_at || sub?.cancellation_details?.reason === 'payment_failed'
          ? 'payment_failed'
          : 'admin_cancelled';
      Object.assign(update, { membership_status: 'cancelled', ended_at: endedAt, ended_reason: m.ended_reason ?? reason });
      why.push(`ended: Stripe subscription ${sub ? `${sub.status} since ${endedAt}` : 'no longer exists'} (${update.ended_reason})`);
    } else {
      // The cancel date.
      const stripeCancel = sub.cancel_at ? iso(sub.cancel_at) : sub.cancel_at_period_end ? iso(periodEnd(sub)) : null;
      if (sec(stripeCancel) !== sec(m.cancel_at)) {
        if (stripeCancel) {
          Object.assign(update, { cancel_at: stripeCancel, ...(m.cancel_requested_at ? {} : { cancel_requested_at: now.toISOString() }) });
          why.push(`cancel_at ${m.cancel_at ?? 'none'} -> ${stripeCancel} (Stripe is set to cancel)`);
        } else {
          Object.assign(update, { cancel_at: null, cancel_requested_at: null, cancel_reason: null });
          why.push(`cancel_at ${m.cancel_at} -> none (Stripe is not set to cancel)`);
        }
      }
      // The payment problem.
      const invoice = typeof sub.latest_invoice === 'string' ? await stripe.invoices.retrieve(sub.latest_invoice) : sub.latest_invoice;
      const unpaid = invoice && invoice.status === 'open' && (invoice.attempt_count ?? 0) > 0;
      const paidUp = (sub.status === 'active' || sub.status === 'trialing') && (!invoice || invoice.status === 'paid');
      if (unpaid && !m.payment_failed_at) {
        Object.assign(update, { payment_failed_at: now.toISOString(), grace_until: londonEndOfDay(now, PAYMENT_GRACE_DAYS).toISOString() });
        why.push(`payment problem: invoice ${invoice.id} unpaid after ${invoice.attempt_count} attempt(s); grace until ${update.grace_until} (the memberships job sends the payment-failed email)`);
      } else if (m.payment_failed_at && paidUp) {
        Object.assign(update, { payment_failed_at: null, grace_until: null });
        why.push('payment problem cleared: Stripe shows the subscription paid up');
      }
      // A pause: reported, not changed (the admin decides).
      const pausedThere = Boolean(sub.pause_collection);
      if (pausedThere !== (m.membership_status === 'paused')) look.push(`${label}: paused in ${pausedThere ? 'Stripe' : 'the database'} only`);
    }

    if (!why.length) {
      console.log(`  ${label}: matches Stripe`);
      continue;
    }
    console.log(`  ${label}: ${why.join('; ')}`);
    if (APPLY) {
      const { error: saveError } = await db.from('members').update(update).eq('id', m.id).is('ended_at', null);
      if (saveError) throw saveError;
      changes += 1;
    }
  } catch (err) {
    problems += 1;
    console.error(`  ${label}: FAILED: ${err?.message ?? err}`);
  }
}
console.log(`${todo.length} member(s) looked at; ${APPLY ? `${changes} changed` : 'nothing changed (dry run)'}; ${problems} problem(s)`);
if (look.length) {
  console.log('Needs a look (not changed):');
  for (const line of look) console.log(`  ${line}`);
}
// Members with no Stripe subscription: listed, never changed (N3).
{
  const { data: noSub, error: noSubError } = await readAll(() =>
    db.from('members').select('id, email, membership_status, ended_at').is('stripe_subscription_id', null).is('deleted_at', null).order('created_at', { ascending: true }).order('id', { ascending: true }),
  );
  if (noSubError) {
    problems += 1;
    console.error('reading members with no subscription failed:', noSubError.message);
  } else {
    const listed = noSub.filter((m) => !ONLY_PREFIX || m.email.startsWith(ONLY_PREFIX));
    console.log(`No Stripe subscription (${listed.length}, left as they are; check each by hand):`);
    for (const m of listed) console.log(`  ${m.email} (${m.id}): ${m.ended_at ? 'ended' : m.membership_status}`);
  }
}
if (APPLY && changes) {
  if (SITE && process.env.CRON_SECRET) {
    const r = await fetch(`${SITE}/api/cron/memberships`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const body = await r.json().catch(() => ({}));
    console.log(`Memberships job on ${SITE}: ${r.status} ${JSON.stringify(body.result ?? body)}`);
    if (r.status !== 200) problems += 1;
  } else {
    console.log('Next: GET https://clubyuppie.com/api/cron/memberships (with the bearer secret), or run again with --site https://clubyuppie.com: it sends the payment-failed emails (C-D12) and cancels and refunds the future bookings of anyone ended (A-D8).');
  }
}
process.exit(problems ? 1 : 0);
