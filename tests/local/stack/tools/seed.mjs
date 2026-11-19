// Phase A seed for the local stack (test data only). Idempotent: run it as often as you like.
//
//   source /home/claude/stack/app.env && node /home/claude/stack/tools/seed.mjs [--prefix f.] [--quiet]
//
// Makes, for the given email prefix (default "f."; each agent uses its own: f. e. m. y. a.):
//   * an admin  <prefix>admin@example.com with password LOCAL_ADMIN_PASSWORD below and a verified TOTP
//     factor whose secret is saved to /home/claude/stack/tools/admin-<prefix>json (log in with login-admin.mjs);
//   * members in every state, each with a fake Stripe customer and subscription (fake Stripe API):
//     active, ending (cancel at period end), problem (payment failed, in grace), paused, ended,
//     lapsed (cancel date passed, no webhook yet), and two fillers; plus a pending applicant;
//   * events (slugs <p>-seed-*), each with an exact address: paid, included, full, past, cancelled,
//     changed (moved after bookings), late (after the ending member's end date);
//   * bookings: active is booked on paid (a paid fake PaymentIntent, recorded through book_event),
//     included, changed, past and (cancelled by the club) cancelled; the fillers fill the full event;
//     ending is booked on late.
//   * stage 2 (when its tables exist): photos, plans, chats, Updates, a block, reports, switches (seedStage2).
// Prints the ids as JSON and writes them to /home/claude/stack/tools/seed-<prefix>json.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { totp, secondsLeft } from './totp.mjs';

export const LOCAL_ADMIN_PASSWORD = 'local-admin-password-1';

const args = process.argv.slice(2);
const argOf = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const PREFIX = argOf('--prefix', 'f.');
const QUIET = args.includes('--quiet');
const TAG = PREFIX.replace(/[^a-z0-9]/gi, '') || 'x';
const DIR = '/home/claude/stack/tools';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SECRET_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !SERVICE || !ANON) { console.error('source /home/claude/stack/app.env first'); process.exit(1); }
const db = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const log = (...a) => { if (!QUIET) console.error(...a); };

// ---------------------------------------------------------------- fake Stripe
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
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
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json };
}
// Marks a fake PaymentIntent paid. The webhook goes nowhere (the seed records the booking itself).
async function fakePay(pi) {
  const r = await fetch(`https://api.stripe.com/__fake/stripe/pay/${pi}?webhook=http://127.0.0.1:9/none`, { method: 'POST' });
  return r.json();
}
async function customerAndSub(email, name, existing) {
  if (existing?.stripe_customer_id && existing?.stripe_subscription_id) {
    const c = await stripe('GET', `customers/${existing.stripe_customer_id}`);
    const s = await stripe('GET', `subscriptions/${existing.stripe_subscription_id}`);
    if (c.status === 200 && s.status === 200) return { customer: c.json.id, sub: s.json, fresh: false };
  }
  const c = await stripe('POST', 'customers', { email, name });
  const s = await stripe('POST', 'subscriptions', { customer: c.json.id, items: { 0: { price: 'price_membership' } } });
  return { customer: c.json.id, sub: s.json, fresh: true };
}

// ---------------------------------------------------------------- auth users
async function findUser(email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (!data.nextPage) return null;
  }
}
async function ensureUser(email, extra = {}) {
  let user = await findUser(email);
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, ...extra });
    if (error) throw error;
    user = data.user;
  } else if (extra.password) {
    await db.auth.admin.updateUserById(user.id, { password: extra.password, ban_duration: 'none' });
  } else if (user.banned_until) {
    await db.auth.admin.updateUserById(user.id, { ban_duration: 'none' });
  }
  return user;
}

// ---------------------------------------------------------------- admin with TOTP
async function authFetch(path, token, body, method = 'POST') {
  const r = await fetch(`${URL_}/auth/v1/${path}`, {
    method,
    headers: { apikey: ANON, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
export async function passwordSession(email, password) {
  const r = await authFetch('token?grant_type=password', null, { email, password });
  if (r.status !== 200) throw new Error(`password login failed for ${email}: ${JSON.stringify(r.json)}`);
  return r.json;
}
export async function totpSession(email, password, factorId, secret) {
  const s = await passwordSession(email, password);
  if (secondsLeft() < 4) await new Promise((r) => setTimeout(r, (secondsLeft() + 1) * 1000));
  const ch = await authFetch(`factors/${factorId}/challenge`, s.access_token, {});
  if (ch.status !== 200) throw new Error(`challenge failed: ${JSON.stringify(ch.json)}`);
  const v = await authFetch(`factors/${factorId}/verify`, s.access_token, { challenge_id: ch.json.id, code: totp(secret) });
  if (v.status !== 200) throw new Error(`verify failed: ${JSON.stringify(v.json)}`);
  return v.json;
}
async function ensureAdmin() {
  const email = `${PREFIX}admin@example.com`;
  const file = `${DIR}/admin-${PREFIX}json`;
  const user = await ensureUser(email, { password: LOCAL_ADMIN_PASSWORD });
  await db.from('admin_users').upsert({ id: user.id });
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const { data: factors } = await db.auth.admin.mfa.listFactors({ userId: user.id });
  const verified = (factors?.factors ?? []).filter((f) => f.factor_type === 'totp' && f.status === 'verified');
  if (saved?.userId === user.id && saved.secret && verified.some((f) => f.id === saved.factorId)) {
    return { ...saved, password: LOCAL_ADMIN_PASSWORD };
  }
  for (const f of factors?.factors ?? []) await db.auth.admin.mfa.deleteFactor({ userId: user.id, id: f.id });
  const s = await passwordSession(email, LOCAL_ADMIN_PASSWORD);
  const en = await authFetch('factors', s.access_token, { factor_type: 'totp', friendly_name: `admin-${email}`, issuer: 'Club Yuppie local' });
  if (en.status !== 200) throw new Error(`enrol failed: ${JSON.stringify(en.json)}`);
  const factorId = en.json.id;
  const secret = en.json.totp.secret;
  const ch = await authFetch(`factors/${factorId}/challenge`, s.access_token, {});
  const v = await authFetch(`factors/${factorId}/verify`, s.access_token, { challenge_id: ch.json.id, code: totp(secret) });
  if (v.status !== 200) throw new Error(`first verify failed: ${JSON.stringify(v.json)}`);
  const record = { email, userId: user.id, factorId, secret };
  fs.writeFileSync(file, JSON.stringify(record, null, 2));
  return { ...record, password: LOCAL_ADMIN_PASSWORD };
}

// ---------------------------------------------------------------- dates (London wall clock, so events read 18:30)
function londonAt(daysFromNow, hh, mm) {
  const d = new Date(Date.now() + daysFromNow * 86400000);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const guess = new Date(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  const wall = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(guess);
  const [h] = wall.split(':').map(Number);
  return new Date(guess.getTime() - (h - hh) * 3600000).toISOString();
}
function endOfLondonDay(daysFromNow) {
  return new Date(new Date(londonAt(daysFromNow + 1, 0, 0)).getTime() - 1).toISOString();
}

// ---------------------------------------------------------------- main
export async function seed() {
  const out = { prefix: PREFIX, admin: null, members: {}, applicant: null, events: {}, bookings: {} };
  out.admin = await ensureAdmin();
  log('admin', out.admin.email);

  const people = [
    { key: 'active', name: 'Ada Active' },
    { key: 'ending', name: 'Eve Ending' },
    { key: 'problem', name: 'Pat Problem' },
    { key: 'paused', name: 'Paula Paused' },
    { key: 'ended', name: 'Ed Ended' },
    { key: 'lapsed', name: 'Lee Lapsed' },
    { key: 'filler1', name: 'Fay Filler' },
    { key: 'filler2', name: 'Finn Filler' },
  ];
  for (const p of people) {
    const email = `${PREFIX}${p.key}@example.com`;
    const user = await ensureUser(email);
    const { data: existing } = await db.from('members').select('stripe_customer_id, stripe_subscription_id').eq('id', user.id).maybeSingle();
    const { customer, sub } = await customerAndSub(email, p.name, existing);
    const row = {
      id: user.id, email, full_name: p.name, phone: '+447700900123', employer: 'Example Ltd', role_title: 'Tester',
      membership_status: 'active', stripe_customer_id: customer, stripe_subscription_id: sub.id,
      cancel_at: null, cancel_requested_at: null, cancel_reason: null, payment_failed_at: null, grace_until: null,
      paused_at: null, ended_at: null, ended_reason: null, deleted_at: null,
    };
    if (p.key === 'ending') {
      const s = await stripe('POST', `subscriptions/${sub.id}`, { cancel_at_period_end: 'true' });
      row.cancel_at = new Date(s.json.cancel_at * 1000).toISOString();
      row.cancel_requested_at = new Date().toISOString();
      row.cancel_reason = 'Moving away';
    }
    if (p.key === 'problem') {
      row.payment_failed_at = new Date(Date.now() - 86400000).toISOString();
      row.grace_until = endOfLondonDay(2);
      // Added 28 Oct (fixer 1): the failed renewal as Stripe has it, an open invoice (once per subscription).
      if (sub.status !== 'past_due') await fetch('https://api.stripe.com/__fake/stripe/invoice-failed', { method: 'POST', body: JSON.stringify({ subscription: sub.id }) });
    }
    if (p.key === 'paused') {
      await stripe('POST', `subscriptions/${sub.id}`, { pause_collection: { behavior: 'void' } });
      row.membership_status = 'paused';
      row.paused_at = new Date().toISOString();
    }
    if (p.key === 'ended') {
      await stripe('DELETE', `subscriptions/${sub.id}`);
      row.membership_status = 'cancelled';
      row.ended_at = new Date(Date.now() - 2 * 86400000).toISOString();
      row.ended_reason = 'member_cancelled';
    }
    if (p.key === 'lapsed') {
      row.cancel_at = new Date(Date.now() - 3600000).toISOString();
      row.cancel_requested_at = new Date(Date.now() - 20 * 86400000).toISOString();
      // Added 28 Oct (fixer 1): as Stripe would have it. The cancel date passed and the webhook was missed, so
      // Stripe has ended the subscription (the memberships job now asks Stripe before ending, QA3-03).
      if (sub.status !== 'canceled') await stripe('DELETE', `subscriptions/${sub.id}`);
    }
    // 3 Nov 2026: seeded members have agreed to the community rules and the Concierge (the gates have their own tests).
    row.rules_agreed_at = row.rules_agreed_at ?? new Date().toISOString();
    row.concierge_consent_at = row.concierge_consent_at ?? new Date().toISOString();
    const { error } = await db.from('members').upsert(row);
    if (error) throw error;
    out.members[p.key] = { id: user.id, email, customer, subscription: sub.id };
  }

  // A pending applicant (no account until approved).
  const appEmail = `${PREFIX}applicant@example.com`;
  const { data: app0 } = await db.from('applications').select('id').eq('email', appEmail).neq('status', 'rejected').maybeSingle();
  if (app0) out.applicant = { id: app0.id, email: appEmail };
  else {
    const c = await stripe('POST', 'customers', { email: appEmail, name: 'Abe Applicant' });
    const { data, error } = await db.from('applications').insert({
      full_name: 'Abe Applicant', email: appEmail, phone: '+447700900456', employer: 'Example Ltd', role_title: 'Analyst',
      linkedin_url: 'https://www.linkedin.com/in/example', instagram_username: 'example', stripe_customer_id: c.json.id, stripe_payment_method_id: `pm_seed_${TAG}`,
    }).select('id').single();
    if (error) throw error;
    out.applicant = { id: data.id, email: appEmail };
  }

  const events = [
    { key: 'paid', title: 'Padel & Pints', days: 10, hh: 18, mm: 30, price: 2500, cap: 16, location: 'Northgate Courts', address: 'Northgate Courts, 1 Sample Road, Anytown AB1 2CD' },
    { key: 'included', title: 'Rooftop Social', days: 12, hh: 19, mm: 0, price: 0, cap: 60, location: 'The Mews Terrace', address: 'The Mews Terrace, 4 Sample Mews, Anytown AB1 2CD' },
    { key: 'full', title: 'Supper Club: Wine & Charcuterie', days: 14, hh: 19, mm: 30, price: 3500, cap: 2, location: 'The Cellar', address: 'The Cellar, 7 Sample Street, Anytown AB1 2CD' },
    { key: 'past', title: 'Sunrise Wellness Retreat', days: -1, hh: 7, mm: 0, price: 0, cap: 30, location: 'Hartley Polo Grounds', address: 'Hartley Polo Grounds, Sample Lane, Anytown AB1 2CD' },
    { key: 'cancelled', title: 'Quiz Night', days: 20, hh: 19, mm: 0, price: 1000, cap: 40, location: 'The Old Bell', address: 'The Old Bell, 2 Sample Square, Anytown AB1 2CD', cancelled: true },
    { key: 'changed', title: 'Tennis Doubles', days: 8, hh: 18, mm: 30, price: 0, cap: 12, location: 'Riverside Club', address: 'Riverside Club, 9 Sample Walk, Anytown AB1 2CD', changed: true },
    { key: 'late', title: 'Winter Supper', days: 45, hh: 19, mm: 0, price: 0, cap: 30, location: 'The Long Room', address: 'The Long Room, 5 Sample Row, Anytown AB1 2CD' },
  ];
  for (const e of events) {
    const slug = `${TAG}-seed-${e.key}`;
    const row = {
      slug, title: e.title, description: `${e.title}. Example event for local tests.`, category: e.price ? 'sport' : 'entertainment',
      location: e.location, start_time: londonAt(e.days, e.hh, e.mm), end_time: null, price_pence: e.price, capacity: e.cap,
      cancelled_at: e.cancelled ? new Date().toISOString() : null, cancel_note: e.cancelled ? 'the venue is closed that evening' : null,
    };
    const { data, error } = await db.from('events').upsert(row, { onConflict: 'slug' }).select('id').single();
    if (error) throw error;
    await db.from('event_addresses').upsert({ event_id: data.id, address: e.address });
    out.events[e.key] = { id: data.id, slug, price: e.price };
  }

  const book = async (memberKey, eventKey, amount = 0, pi = null) => {
    const { data, error } = await db.rpc('book_event', { p_member: out.members[memberKey].id, p_event: out.events[eventKey].id, p_amount: amount, p_payment_intent: pi, p_allow_over_capacity: Boolean(pi) });
    if (error) throw error;
    return data;
  };
  // Paid: a fake PaymentIntent made and paid, then recorded as the app does (book_event, with the PI and amount).
  const { data: paidExisting } = await db.from('bookings').select('id, stripe_payment_intent_id').eq('member_id', out.members.active.id).eq('event_id', out.events.paid.id).eq('status', 'confirmed').maybeSingle();
  if (paidExisting) out.bookings.activePaid = paidExisting.id;
  else {
    const pi = await stripe('POST', 'payment_intents', { amount: 2500, currency: 'gbp', customer: out.members.active.customer, metadata: { member_id: out.members.active.id, event_id: out.events.paid.id } });
    await fakePay(pi.json.id);
    out.bookings.activePaid = (await book('active', 'paid', 2500, pi.json.id)).booking_id;
  }
  out.bookings.activeIncluded = (await book('active', 'included')).booking_id;
  // Changed: booked first, then the club moved it.
  await db.from('events').update({ changed_at: null }).eq('id', out.events.changed.id);
  out.bookings.activeChanged = (await book('active', 'changed')).booking_id;
  await db.from('events').update({ changed_at: new Date(Date.now() + 1000).toISOString() }).eq('id', out.events.changed.id);
  out.bookings.filler1Full = (await book('filler1', 'full')).booking_id;
  out.bookings.filler2Full = (await book('filler2', 'full')).booking_id;
  out.bookings.endingLate = (await book('ending', 'late')).booking_id;
  // Past (book_event refuses started events) and cancelled-by-the-club rows are written directly.
  for (const [key, eventKey, extra] of [
    ['activePast', 'past', { status: 'confirmed', booked_at: new Date(Date.now() - 5 * 86400000).toISOString() }],
    ['activeCancelled', 'cancelled', { status: 'cancelled', amount_pence: 0, cancelled_at: new Date().toISOString(), cancelled_by: 'club', cancel_reason: 'event_cancelled' }],
  ]) {
    const { data: found } = await db.from('bookings').select('id').eq('member_id', out.members.active.id).eq('event_id', out.events[eventKey].id).limit(1).maybeSingle();
    if (found) out.bookings[key] = found.id;
    else {
      const { data, error } = await db.from('bookings').insert({ member_id: out.members.active.id, event_id: out.events[eventKey].id, ...extra }).select('id').single();
      if (error) throw error;
      out.bookings[key] = data.id;
    }
  }
  out.stage2 = await seedStage2(out);
  fs.writeFileSync(`${DIR}/seed-${PREFIX}json`, JSON.stringify(out, null, 2));
  return out;
}

// ---------------------------------------------------------------- stage 2 (Phase B, added 30 Oct 2026)
//
// Only when the stage 2 tables exist (20261030090000_open_invite_messages.sql); on a stage 1 database it does
// nothing. Idempotent, like the rest: run it as often as you like. Makes, for the prefix:
//   * photos in the private member-photos bucket: active and ending approved, problem pending (new, no face
//     found), filler1 changed (pending, with the approved photo it replaced), filler2 removed (not_clear: the
//     photo gate), paused, ended and lapsed approved;
//   * plans in every state: P1 Climbing (active hosts; ending going; problem asked a question, host replied),
//     P2 Sunday walk (ending hosts; active and filler1 going; a plan chat with messages, one a phone number),
//     P3 Padel (problem hosts; full: filler1 and active going), P4 Gallery (filler1 hosts; cancelled), P5 Spin
//     (ending hosted; past, active went), P6 Comedy (filler1 hosts, not going: spare tickets, nobody yet),
//     P7 Quiz (filler2 hosts; active blocked filler2, so it is not in active's feed);
//   * Updates for active (joined, changed, reminder), a block (active blocks filler2), reports (a message,
//     open; a photo, open; a plan, dismissed), and switches (ending: text on, check sent; problem: email off).
// Upcoming plans are moved back to their intended times on every run, so the fixtures stay upcoming.
const PHOTO_FIXTURE = (name) => fs.readFileSync(`${DIR}/fixtures/${name}`);

async function stage2Exists() {
  const { error } = await db.from('plans').select('id').limit(1);
  return !error;
}

async function seedPhoto(memberId, key, { status, source = 'new', face = 'found', reason = null, previous = null, current = true, file = 'photo-480.jpg' }) {
  const path = `${memberId}/seed-${key}-full.jpg`;
  const thumb = `${memberId}/seed-${key}-thumb.jpg`;
  for (const [p, f] of [[path, file], [thumb, 'photo-120.jpg']]) {
    const { error } = await db.storage.from('member-photos').upload(p, PHOTO_FIXTURE(f), { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(`seed photo upload ${p}: ${error.message}`);
  }
  const now = new Date().toISOString();
  const row = {
    member_id: memberId, path, thumb_path: thumb, width: 480, height: 480, content_type: 'image/jpeg', bytes: PHOTO_FIXTURE(file).length,
    resized: true, source, face_check: face, status, previous_photo_id: previous,
    removal_reason: status === 'removed' ? reason : null, removed_at: status === 'removed' ? now : null,
    reviewed_at: status === 'approved' || status === 'removed' ? now : null, replaced_at: status === 'replaced' ? now : null,
  };
  const { data, error } = await db.from('member_photos').upsert(row, { onConflict: 'path' }).select('id').single();
  if (error) throw new Error(`seed photo row ${key}: ${error.message}`);
  if (current) await db.from('members').update({ photo_id: status === 'removed' ? null : data.id }).eq('id', memberId);
  return data.id;
}

async function rpc(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function seedPlan(key, host, { title, type, days, hh, mm, place, note = null, places, hostGoing = true, past = false }) {
  const startsAt = londonAt(days, hh, mm);
  const { data: found } = await db.from('plans').select('id, status').eq('host_id', host).eq('title', title).order('created_at', { ascending: true }).limit(1);
  let id = found?.[0]?.id;
  if (!id && !past) id = (await rpc('post_plan', { p_host: host, p_title: title, p_type: type, p_starts_at: startsAt, p_place: place, p_note: note, p_places: places, p_host_going: hostGoing })).plan_id;
  if (!id && past) {
    const { data, error } = await db.from('plans').insert({ host_id: host, title, type, starts_at: startsAt, place, note, places, host_going: hostGoing }).select('id').single();
    if (error) throw error;
    id = data.id;
    if (hostGoing) await db.from('plan_members').insert({ plan_id: id, member_id: host, role: 'host', status: 'going', joined_at: londonAt(days - 7, 9, 0) });
    const { data: chat } = await db.from('chats').insert({ plan_id: id, kind: 'plan' }).select('id').single();
    await db.from('chat_members').insert({ chat_id: chat.id, member_id: host, role: 'host' });
    await db.from('messages').insert({ chat_id: chat.id, kind: 'system', system_event: 'opened', about_member_id: host });
  }
  // Back to the intended time (and, for an upcoming one, still scheduled unless it is the cancelled fixture).
  await db.from('plans').update({ starts_at: startsAt }).eq('id', id);
  const { data: chat } = await db.from('chats').select('id').eq('plan_id', id).eq('kind', 'plan').single();
  return { id, chatId: chat.id, title, startsAt };
}

async function joinDirect(planId, memberId, joinedDaysAgo = 2) {
  // As if they joined some days ago (join_plan refuses a started plan; the reminders test wants old joins).
  const { data: pm } = await db.from('plan_members').select('status').eq('plan_id', planId).eq('member_id', memberId).maybeSingle();
  if (pm?.status !== 'going') {
    const { data: plan } = await db.from('plans').select('starts_at').eq('id', planId).single();
    if (new Date(plan.starts_at) > new Date()) await rpc('join_plan', { p_member: memberId, p_plan: planId });
    else {
      await db.from('plan_members').upsert({ plan_id: planId, member_id: memberId, role: 'guest', status: 'going' }, { onConflict: 'plan_id,member_id' });
      const { data: chat } = await db.from('chats').select('id').eq('plan_id', planId).eq('kind', 'plan').single();
      await db.from('chat_members').upsert({ chat_id: chat.id, member_id: memberId, role: 'member', left_at: null }, { onConflict: 'chat_id,member_id' });
    }
  }
  await db.from('plan_members').update({ joined_at: new Date(Date.now() - joinedDaysAgo * 86400000).toISOString() }).eq('plan_id', planId).eq('member_id', memberId);
}

async function seedMessage(chatId, senderId, key, body) {
  const clientId = `seed-${key}`;
  const { data: found } = await db.from('messages').select('id').eq('chat_id', chatId).eq('sender_id', senderId).eq('client_id', clientId).maybeSingle();
  if (found) return found.id;
  const { data, error } = await db.from('messages').insert({ chat_id: chatId, kind: 'text', sender_id: senderId, body, client_id: clientId }).select('id').single();
  if (error) throw error;
  return data.id;
}

async function seedStage2(out) {
  if (!(await stage2Exists())) return null;
  const m = Object.fromEntries(Object.entries(out.members).map(([k, v]) => [k, v.id]));
  const s2 = { photos: {}, plans: {}, chats: {}, messages: {}, reports: {} };

  // ---- photos
  s2.photos.active = await seedPhoto(m.active, 'active', { status: 'approved' });
  s2.photos.ending = await seedPhoto(m.ending, 'ending', { status: 'approved' });
  s2.photos.problem = await seedPhoto(m.problem, 'problem', { status: 'pending', face: 'none' });
  s2.photos.filler1Before = await seedPhoto(m.filler1, 'filler1-before', { status: 'replaced', current: false });
  s2.photos.filler1 = await seedPhoto(m.filler1, 'filler1', { status: 'pending', source: 'changed', previous: s2.photos.filler1Before, file: 'photo-800.jpg' });
  s2.photos.filler2Removed = await seedPhoto(m.filler2, 'filler2', { status: 'removed', reason: 'not_clear' });
  for (const k of ['paused', 'ended', 'lapsed']) s2.photos[k] = await seedPhoto(m[k], k, { status: 'approved' });

  // ---- plans
  const P = s2.plans;
  P.climbing = await seedPlan('climbing', m.active, { title: 'Climbing and a pint', type: 'Sport', days: 5, hh: 18, mm: 30, place: 'The Boulder Yard', note: 'Beginners welcome, shoes can be hired at the desk.', places: 4 });
  P.walk = await seedPlan('walk', m.ending, { title: 'Sunday walk and coffee', type: 'Wellness', days: 3, hh: 11, mm: 0, place: 'Calder Park', note: 'Gentle loop, about an hour, then coffee.', places: 6 });
  P.padel = await seedPlan('padel', m.problem, { title: 'Padel, then pizza', type: 'Sport', days: 7, hh: 19, mm: 0, place: 'Northgate Courts', places: 3 });
  P.gallery = await seedPlan('gallery', m.filler1, { title: 'Gallery late and a drink', type: 'Culture', days: 9, hh: 18, mm: 30, place: 'Marlow Gallery', places: 4 });
  P.spin = await seedPlan('spin', m.ending, { title: 'Saturday spin', type: 'Wellness', days: -3, hh: 10, mm: 0, place: 'Psycle, Oxford Circus', places: 4, past: true });
  P.comedy = await seedPlan('comedy', m.filler1, { title: 'Comedy night, two spare tickets', type: 'Culture', days: 4, hh: 20, mm: 0, place: 'The Bell Room', places: 2, hostGoing: false });
  P.quiz = await seedPlan('quiz', m.filler2, { title: 'Quiz at the Bell', type: 'Something else', days: 6, hh: 19, mm: 30, place: 'The Old Bell', places: 6 });

  await joinDirect(P.climbing.id, m.ending);
  await joinDirect(P.walk.id, m.active);
  await joinDirect(P.walk.id, m.filler1);
  await joinDirect(P.padel.id, m.filler1);
  await joinDirect(P.padel.id, m.active);
  await joinDirect(P.spin.id, m.active, 10);
  // P4 cancelled by its host (once).
  const { data: gallery } = await db.from('plans').select('status').eq('id', P.gallery.id).single();
  if (gallery.status !== 'cancelled') await rpc('cancel_plan', { p_host: m.filler1, p_plan: P.gallery.id });

  // ---- chats and messages
  s2.chats.walk = P.walk.chatId;
  s2.messages.walkHost = await seedMessage(P.walk.chatId, m.ending, 'walk-host', 'Meet by the café at 10:50.');
  s2.messages.walkActive = await seedMessage(P.walk.chatId, m.active, 'walk-active', 'Great, see you there.');
  s2.messages.walkNumber = await seedMessage(P.walk.chatId, m.filler1, 'walk-number', 'I’m on 07700 900456 if you get lost.');
  s2.messages.walkPay = await seedMessage(P.walk.chatId, m.filler1, 'walk-pay', 'Easier if you just send me the money for the coffee.');
  const question = await rpc('open_question', { p_member: m.problem, p_plan: P.climbing.id });
  s2.chats.climbingQuestion = question.chat_id;
  s2.messages.question = await seedMessage(question.chat_id, m.problem, 'q-ask', 'Do I need my own shoes?');
  s2.messages.reply = await seedMessage(question.chat_id, m.active, 'q-reply', 'No, you can hire them at the desk.');
  // Everyone has read everything so far, except active, who has not read the walk chat's last two.
  const readAt = new Date().toISOString();
  await db.from('chat_members').update({ last_read_at: readAt }).in('chat_id', [P.walk.chatId, question.chat_id]).neq('member_id', m.active);
  await db.from('chat_members').update({ last_read_at: readAt }).eq('chat_id', question.chat_id).eq('member_id', m.active);
  const { data: walkActive } = await db.from('messages').select('created_at').eq('id', s2.messages.walkActive).single();
  await db.from('chat_members').update({ last_read_at: walkActive.created_at }).eq('chat_id', P.walk.chatId).eq('member_id', m.active);

  // ---- Updates for active
  const upd = (key, row) => ({ member_id: m.active, dedupe_key: `seed:${PREFIX}${key}`, ...row });
  await db.from('updates').upsert([
    upd('joined', { kind: 'joined', plan_id: P.climbing.id, actor_id: m.ending, role: 'host' }),
    upd('changed', { kind: 'changed', plan_id: P.walk.id, actor_id: m.ending, role: 'going', previous_starts_at: londonAt(3, 10, 30) }),
    upd('reminder', { kind: 'reminder', plan_id: P.padel.id, role: 'going', reminder_hours: 24, read_at: new Date().toISOString() }),
  ], { onConflict: 'dedupe_key', ignoreDuplicates: true });

  // ---- a block, reports, switches
  await db.from('blocks').upsert({ blocker_id: m.active, blocked_id: m.filler2 }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
  const report = async (key, row) => {
    const { data: found } = await db.from('reports').select('id').eq('reporter_id', row.reporter_id).eq('kind', row.kind).eq('reason', row.reason).limit(1);
    if (found?.length) return found[0].id;
    const { data, error } = await db.from('reports').insert(row).select('id').single();
    if (error) throw new Error(`seed report ${key}: ${error.message}`);
    return data.id;
  };
  s2.reports.message = await report('message', { reporter_id: m.active, kind: 'message', reason: 'pay_outside', member_id: m.filler1, plan_id: P.walk.id, chat_id: P.walk.chatId, message_id: s2.messages.walkPay });
  s2.reports.photo = await report('photo', { reporter_id: m.ending, kind: 'photo', reason: 'not_them', member_id: m.problem, photo_id: s2.photos.problem });
  s2.reports.plan = await report('plan', { reporter_id: m.active, kind: 'plan', reason: 'not_real', member_id: m.filler2, plan_id: P.quiz.id, status: 'dismissed', acted_at: new Date().toISOString() });
  await db.from('notification_preferences').upsert({ member_id: m.ending, channel_text: true, text_check: 'sent', text_check_number: '+447700900123', text_check_sent_at: new Date().toISOString() }, { onConflict: 'member_id' });
  await db.from('notification_preferences').upsert({ member_id: m.problem, channel_email: false }, { onConflict: 'member_id' });
  return s2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed().then((out) => console.log(JSON.stringify(out, null, 2))).catch((err) => { console.error(err); process.exit(1); });
}
