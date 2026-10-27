// Shared helpers for the Phase A scripts. Plain Node, no test runner: each script is `node <file>`, prints
// one line per check and exits 1 on the first failure. They run against a build of this branch on
// PHASE_A_BASE (default http://127.0.0.1:3141, started with MEMBERS_TEST_HOOKS=on) and the local stack.
//
//   source /home/claude/stack/app.env
//   MEMBERS_TEST_HOOKS=on ADMIN_ALERTS_EMAIL=f.alerts@example.com npx next start -p 3141 &
//   node tests/e2e/phase-a/run-all.mjs
//
// Test people and events are made fresh by each script (emails f.t-<script>-<random>@example.com), so the
// scripts can run in any order and again.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { totp, secondsLeft } from '/home/claude/stack/tools/totp.mjs';

// ---------------------------------------------------------------- env (app.env, if not sourced)
// NODE_EXTRA_CA_CERTS (the fakes' CA) only counts when set before Node starts, so without it the script
// runs itself again with app.env loaded.
if (process.env.NODE_EXTRA_CA_CERTS !== '/home/claude/stack/certs/ca.crt' || !process.env.SUPABASE_SECRET_KEY) {
  const env = { ...process.env };
  for (const line of fs.readFileSync('/home/claude/stack/app.env', 'utf8').split('\n')) {
    const m = /^export\s+([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env });
  process.exit(r.status ?? 1);
}
export const BASE = process.env.PHASE_A_BASE || 'http://127.0.0.1:3141';
export const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const REST = `${SUPA}/rest/v1`;
export const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const SERVICE = process.env.SUPABASE_SECRET_KEY;
export const WEBHOOK = `${BASE}/api/stripe/webhook`;
export const ALERTS = process.env.ADMIN_ALERTS_EMAIL || 'f.alerts@example.com';
export const svc = createClient(SUPA, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

// ---------------------------------------------------------------- checks
let passed = 0;
const scriptName = process.argv[1]?.split('/').pop();
export function ok(cond, label, extra) {
  if (!cond) {
    console.error(`FAIL ${scriptName}: ${label}${extra !== undefined ? `\n  ${typeof extra === 'string' ? extra : JSON.stringify(extra, null, 1).slice(0, 2000)}` : ''}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`ok   ${label}`);
}
export function eq(actual, expected, label) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), label, { actual, expected });
}
export function done() {
  console.log(`PASS ${scriptName}: ${passed} checks`);
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function waitFor(fn, label, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await sleep(250);
  }
  ok(false, `${label} (timed out)`, last);
}
export const rand = () => crypto.randomBytes(4).toString('hex');
export const tag = (name) => `f.t-${name}-${rand()}`;

// ---------------------------------------------------------------- database (psql as postgres, for asserts and setup)
export function sql(query) {
  const out = execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', `select coalesce(json_agg(t), '[]'::json) from (${query}) t`], { encoding: 'utf8' });
  return JSON.parse(out.trim() || '[]');
}
export const sql1 = (query) => sql(query)[0] ?? null;
export function exec(statement) {
  execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-c', statement], { encoding: 'utf8' });
}
export const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------------------------------------------------------------- fakes log
const FAKES = '/home/claude/stack/logs/fakes.jsonl';
export function fakesMark() {
  return fs.existsSync(FAKES) ? fs.readFileSync(FAKES, 'utf8').split('\n').filter(Boolean).length : 0;
}
export function fakesSince(mark, kind) {
  const lines = fs.readFileSync(FAKES, 'utf8').split('\n').filter(Boolean).slice(mark).map((l) => JSON.parse(l));
  return kind ? lines.filter((l) => l.kind === kind) : lines;
}
export function emailsTo(mark, to) {
  return fakesSince(mark, 'email').filter((e) => (Array.isArray(e.to) ? e.to : [e.to]).some((t) => String(t).toLowerCase() === to.toLowerCase()));
}
export function messages(where) {
  return sql(`select template, status, to_address, dedupe_key, error, member_id, booking_id, event_id, application_id from message_log where ${where} order by created_at`);
}

// ---------------------------------------------------------------- fake Stripe
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') form(v, key, out); else out.append(key, String(v));
  }
  return out;
}
export async function stripe(method, path, body) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body ? form(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
export async function fakeState() {
  return (await fetch('https://api.stripe.com/__fake/state')).json();
}
/** Mark a PaymentIntent paid; the signed payment_intent.succeeded goes to this build's webhook (or `webhook`). */
export async function fakePay(pi, webhook = WEBHOOK) {
  return (await fetch(`https://api.stripe.com/__fake/stripe/pay/${pi}?webhook=${encodeURIComponent(webhook)}`, { method: 'POST' })).json();
}
/** Send any event through the fake (it signs it and posts it to this build's webhook). */
export async function emit(type, object) {
  return (await fetch(`https://api.stripe.com/__fake/stripe/emit?webhook=${encodeURIComponent(WEBHOOK)}`, { method: 'POST', body: JSON.stringify({ type, object }) })).json();
}
/** Post an event we build and sign ourselves (same id twice, previous_attributes, bad signatures). */
export async function postWebhook(event, secret = process.env.STRIPE_WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  const r = await fetch(WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body: payload });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
export function stripeEvent(type, object, extra = {}) {
  return { id: `evt_${crypto.randomBytes(10).toString('hex')}`, object: 'event', type, created: Math.floor(Date.now() / 1000), livemode: false, api_version: '2026-08-26.dahlia', data: { object, ...extra } };
}

// ---------------------------------------------------------------- people and events
async function findUser(email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (!data.nextPage) return null;
  }
}

/**
 * A member in a state, with a fake Stripe customer and subscription.
 * state: active | ending | problem | paused | ended | lapsed | graceover
 */
export async function makeMember(name, state = 'active', fields = {}) {
  const email = `${tag(name)}@example.com`;
  let user = await findUser(email);
  if (!user) {
    const { data, error } = await svc.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    user = data.user;
  }
  const c = await stripe('POST', 'customers', { email, name });
  const s = await stripe('POST', 'subscriptions', { customer: c.json.id, items: { 0: { price: 'price_membership' } } });
  const row = { id: user.id, email, full_name: `${name[0].toUpperCase()}${name.slice(1)} Tester`, phone: '+447700900123', membership_status: 'active', stripe_customer_id: c.json.id, stripe_subscription_id: s.json.id };
  const now = Date.now();
  if (state === 'ending') {
    const u = await stripe('POST', `subscriptions/${s.json.id}`, { cancel_at_period_end: 'true' });
    Object.assign(row, { cancel_at: new Date(u.json.cancel_at * 1000).toISOString(), cancel_requested_at: new Date().toISOString() });
  }
  if (state === 'problem') Object.assign(row, { payment_failed_at: new Date(now - 86400000).toISOString(), grace_until: new Date(now + 2 * 86400000).toISOString() });
  if (state === 'graceover') Object.assign(row, { payment_failed_at: new Date(now - 4 * 86400000).toISOString(), grace_until: new Date(now - 3600000).toISOString() });
  if (state === 'paused') Object.assign(row, { membership_status: 'paused', paused_at: new Date().toISOString() });
  if (state === 'ended') Object.assign(row, { membership_status: 'cancelled', ended_at: new Date(now - 86400000).toISOString(), ended_reason: 'member_cancelled' });
  if (state === 'lapsed') Object.assign(row, { cancel_at: new Date(now - 3600000).toISOString(), cancel_requested_at: new Date(now - 20 * 86400000).toISOString() });
  Object.assign(row, fields);
  const { error } = await svc.from('members').upsert(row);
  if (error) throw error;
  return { id: user.id, email, customer: c.json.id, subscription: s.json.id };
}

export async function makeEvent(name, { price = 0, capacity = 20, startInHours = 24 * 10, address = `${name} Hall, 1 Sample Road, Anytown AB1 2CD`, location = `${name} Hall`, endInHours = null } = {}) {
  const slug = `${tag(name).replace(/\./g, '-')}`;
  const { data, error } = await svc.from('events').insert({
    slug, title: `${name[0].toUpperCase()}${name.slice(1)} night`, description: 'Test event', category: 'sport', location,
    start_time: new Date(Date.now() + startInHours * 3600000).toISOString(),
    end_time: endInHours === null ? null : new Date(Date.now() + endInHours * 3600000).toISOString(),
    price_pence: price, capacity,
  }).select('id, slug, title, start_time, location').single();
  if (error) throw error;
  if (address) await svc.from('event_addresses').upsert({ event_id: data.id, address });
  return { ...data, price };
}

/** A confirmed booking made the way the app makes them (book_event), optionally paid with a real fake PaymentIntent. */
export async function makeBooking(member, event, { paid = event.price > 0, bookedAgoHours = 0 } = {}) {
  let pi = null;
  if (paid) {
    const r = await stripe('POST', 'payment_intents', { amount: event.price, currency: 'gbp', customer: member.customer, metadata: { member_id: member.id, event_id: event.id } });
    pi = r.json.id;
    await fakePay(pi, 'http://127.0.0.1:9/none');
  }
  const { data, error } = await svc.rpc('book_event', { p_member: member.id, p_event: event.id, p_amount: paid ? event.price : 0, p_payment_intent: pi, p_allow_over_capacity: Boolean(pi) });
  if (error) throw error;
  if (bookedAgoHours) exec(`update bookings set booked_at = now() - interval '${bookedAgoHours} hours' where id = ${q(data.booking_id)}`);
  return { id: data.booking_id, status: data.status, pi };
}

// ---------------------------------------------------------------- sessions and calls
async function authFetch(path, token, body) {
  const r = await fetch(`${SUPA}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

/** A member's real session (an email OTP minted by the admin API, verified like the login page does). */
export async function memberSession(email) {
  const { data, error } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const v = await authFetch('verify', null, { type: 'magiclink', email, token: data.properties.email_otp });
  if (v.status !== 200) throw new Error(`verify failed for ${email}: ${JSON.stringify(v.json)}`);
  return v.json;
}

/** The seeded admin's aal2 session (password, then a TOTP code), the same steps /admin/login takes. */
export async function adminSession(prefix = 'f.') {
  const saved = JSON.parse(fs.readFileSync(`/home/claude/stack/tools/admin-${prefix}json`, 'utf8'));
  const p = await authFetch('token?grant_type=password', null, { email: saved.email, password: 'local-admin-password-1' });
  if (p.status !== 200) throw new Error(`admin password login failed: ${JSON.stringify(p.json)}`);
  if (secondsLeft() < 4) await sleep((secondsLeft() + 1) * 1000);
  const ch = await authFetch(`factors/${saved.factorId}/challenge`, p.json.access_token, {});
  const v = await authFetch(`factors/${saved.factorId}/verify`, p.json.access_token, { challenge_id: ch.json.id, code: totp(saved.secret) });
  if (v.status !== 200) throw new Error(`admin TOTP verify failed: ${JSON.stringify(v.json)}`);
  return { ...v.json, adminId: saved.userId, email: saved.email };
}

/** The Supabase SSR cookie for a session (sb-127-auth-token, base64url, chunked like @supabase/ssr). */
export function cookieFor(session) {
  const name = `sb-${new URL(SUPA).hostname.split('.')[0]}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  if (value.length <= 3180) return `${name}=${value}`;
  const parts = [];
  for (let i = 0; i * 3180 < value.length; i += 1) parts.push(`${name}.${i}=${value.slice(i * 3180, (i + 1) * 3180)}`);
  return parts.join('; ');
}

/** Call a real server action through the test hook, as the session's user. */
export async function action(name, args = [], session = null) {
  const r = await fetch(`${BASE}/api/test-hooks/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(session ? { cookie: cookieFor(session) } : {}) },
    body: JSON.stringify({ args }),
  });
  const json = await r.json().catch(() => ({}));
  if (r.status !== 200) throw new Error(`action ${name} -> ${r.status} ${JSON.stringify(json)}`);
  return json;
}
export const fd = (obj) => ({ $formData: obj });

/** GET a page as the session's user, without following redirects. */
export async function page(path, session = null, extraHeaders = {}) {
  const r = await fetch(`${BASE}${path}`, { redirect: 'manual', headers: { ...(session ? { cookie: cookieFor(session) } : {}), ...extraHeaders } });
  return { status: r.status, location: r.headers.get('location'), headers: r.headers, text: r.status === 200 ? await r.text() : '' };
}

/** PostgREST as the session's user (anon key plus their JWT), for the security checks. */
export async function rest(method, path, session, body, headers = {}) {
  const r = await fetch(`${REST}/${path}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${session ? session.access_token : ANON}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}

export async function cron(job, secret = process.env.CRON_SECRET) {
  const r = await fetch(`${BASE}/api/cron/${job}`, { headers: secret ? { Authorization: `Bearer ${secret}` } : {} });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
